/**
 * Red Bingos Game Lifecycle E2E Test Script
 * Verifies: Game creation -> Claims -> Countdown -> Draws -> Win checking -> Split payouts & Transactions
 */

const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { io } = require('socket.io-client');

const prisma = new PrismaClient();

// Helper to make HTTP requests
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers = options.headers || {};
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      options.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function runLifecycleVerification() {
  console.log('🏁 Starting complete Red Bingos game lifecycle verification...');

  // 1. Reset GameSettings for fast testing
  console.log('⚙️ Setting test-optimal GameSettings (3s lobby, 1s draw interval, 10% edge)...');
  await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: {
      lobbySeconds: 3,
      drawInterval: 1,
      houseEdge: 10.0,
      maxCardsPerPlayer: 5,
      activePatterns: 'row,column,diagonal,fourCorners',
      botsEnabled: false,
    },
    create: {
      id: 1,
      lobbySeconds: 3,
      drawInterval: 1,
      houseEdge: 10.0,
      maxCardsPerPlayer: 5,
      activePatterns: 'row,column,diagonal,fourCorners',
      botsEnabled: false,
    },
  });

  // 2. Create two test players with sufficient balance
  console.log('👤 Preparing test players (Player A & Player B)...');
  const playerA = await prisma.player.upsert({
    where: { telegramId: 'player_a_tele' },
    update: { balance: 300, gamesPlayed: 0, gamesWon: 0 },
    create: {
      telegramId: 'player_a_tele',
      firstName: 'PlayerA',
      phoneNumber: '+251911111111',
      balance: 300,
    },
  });

  const playerB = await prisma.player.upsert({
    where: { telegramId: 'player_b_tele' },
    update: { balance: 300, gamesPlayed: 0, gamesWon: 0 },
    create: {
      telegramId: 'player_b_tele',
      firstName: 'PlayerB',
      phoneNumber: '+251922222222',
      balance: 300,
    },
  });

  console.log(`✅ Player A: ID ${playerA.id}, Balance: ${playerA.balance} ETB`);
  console.log(`✅ Player B: ID ${playerB.id}, Balance: ${playerB.balance} ETB`);

  // 3. Login to get Admin JWT token
  console.log('🔑 Logging in as Admin...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
  }, {
    username: 'john',
    password: 'johnadmin',
  });

  const token = loginRes.body.token;

  // 4. Create new Game via API
  console.log('🎮 Creating new game...');
  const gameRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/games',
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }, {
    cardPrice: 50,
    totalCards: 10,
    mode: 'automatic',
  });

  const game = gameRes.body.data;
  console.log(`✅ Game #${game.id} created successfully! Status: ${game.status}`);

  // 5. Connect Socket.io Client and join game room
  console.log('🔌 Connecting Socket client...');
  const socket = io('http://localhost:3000');

  await new Promise((resolve) => {
    socket.on('connect', () => {
      console.log('✅ Socket connected, ID:', socket.id);
      socket.emit('join_game', { gameId: game.id });
      resolve();
    });
  });

  // Track Socket events
  const socketEvents = [];
  socket.on('lobby:tick', (data) => {
    console.log(`💬 [Event: lobby:tick] Seconds left: ${data.secondsLeft}`);
    socketEvents.push({ type: 'lobby:tick', data });
  });

  socket.on('game:status', (data) => {
    console.log(`💬 [Event: game:status] Status: ${data.status}, Message: "${data.message}"`);
    socketEvents.push({ type: 'game:status', data });
  });

  socket.on('game:draw', (data) => {
    console.log(`🔮 [Event: game:draw] Drew: ${data.number}, Total Drawn: ${data.drawnNumbers.length}`);
    socketEvents.push({ type: 'game:draw', data });
  });

  // Keep game completed details for validation
  let completedData = null;
  const gameCompletedPromise = new Promise((resolve) => {
    socket.on('game:completed', (data) => {
      console.log('🏆 [Event: game:completed] Game finished!', data);
      completedData = data;
      resolve();
    });
  });

  // 6. Players claim cards
  console.log('💳 Player A claims Card #1...');
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/1/claim`,
    method: 'POST',
  }, { playerId: playerA.id });

  console.log('💳 Player B claims Card #2...');
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/2/claim`,
    method: 'POST',
  }, { playerId: playerB.id });

  // 7. Wait for game to run and finish
  console.log('⏳ Waiting for countdown, draws, and win detection to resolve...');
  await gameCompletedPromise;

  // 8. Disconnect socket
  socket.disconnect();

  // 9. Database state checks
  console.log('🔍 Running final database assertions...');
  const finalGame = await prisma.game.findUnique({
    where: { id: game.id },
    include: { winners: { include: { player: true } } },
  });

  console.log(`👉 Final Game Status: ${finalGame.status}`);
  if (finalGame.status !== 'completed') {
    console.error('❌ Error: Game status is not completed!');
    process.exit(1);
  }

  console.log(`👉 Winner Count: ${finalGame.winnerCount}`);
  if (finalGame.winnerCount < 1) {
    console.error('❌ Error: Game should have at least 1 winner!');
    process.exit(1);
  }

  // Calculate expected payouts
  // Total cards claimed = 2. Card price = 50. Pool = 100. House Cut = 10% (10 ETB). Prize = 90 ETB.
  // Split prize: 90 / winnerCount
  const expectedSplitPrize = 90 / finalGame.winnerCount;

  for (const winner of finalGame.winners) {
    console.log(`🏆 Winner: ${winner.player.firstName}, Prize Paid: ${winner.prize} ETB (Pattern: ${winner.winPattern})`);
    if (Math.abs(winner.prize - expectedSplitPrize) > 0.01) {
      console.error(`❌ Error: Incorrect payout! Expected: ${expectedSplitPrize}, Got: ${winner.prize}`);
      process.exit(1);
    }

    // Verify balance was credited properly
    const updatedPlayer = await prisma.player.findUnique({ where: { id: winner.playerId } });
    const expectedBalance = 300 - 50 + expectedSplitPrize; // 300 initial - 50 card + splitPrize
    console.log(`👉 Player ${updatedPlayer.firstName} updated balance: ${updatedPlayer.balance} ETB (Expected: ${expectedBalance} ETB)`);
    if (Math.abs(updatedPlayer.balance - expectedBalance) > 0.01) {
      console.error(`❌ Error: Player balance was not properly updated!`);
      process.exit(1);
    }

    // Verify Audit Transaction
    const winTx = await prisma.transaction.findFirst({
      where: { playerId: winner.playerId, type: 'win', note: { contains: `Game #${game.id}` } },
      orderBy: { id: 'desc' },
    });
    console.log(`👉 Win Transaction Log: type="${winTx.type}", amount=${winTx.amount} ETB, balanceAfter=${winTx.balanceAfter} ETB`);
    if (!winTx || winTx.amount !== expectedSplitPrize) {
      console.error('❌ Error: Transaction ledger missing or incorrect!');
      process.exit(1);
    }
  }

  console.log('🎉 E2E Game Lifecycle verification successful! All assertions passed!');
  await prisma.gameSettings.update({
    where: { id: 1 },
    data: { botsEnabled: true }
  });
}

runLifecycleVerification()
  .catch(err => {
    console.error('❌ E2E Verification script crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


