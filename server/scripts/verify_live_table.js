const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

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
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function assert(condition, msg) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runLiveTableVerification() {
  console.log('🏁 Starting Live Table & Total Prize Pool verification...');

  // Cancel any existing running/waiting games to isolate test game
  await prisma.game.updateMany({
    where: { status: { in: ['in_progress', 'waiting'] } },
    data: { status: 'cancelled' }
  });

  // 1. Create a real test player
  const player = await prisma.player.upsert({
    where: { telegramId: 'test_table_player' },
    update: { balance: 1000, isBot: false },
    create: {
      telegramId: 'test_table_player',
      firstName: 'TablePlayer',
      phoneNumber: '+251999888777',
      balance: 1000,
      isBot: false,
    },
  });

  // 2. Admin login
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

  // 3. Create a game with stake = 100 ETB
  console.log('🎮 Creating new game with cardPrice = 100 ETB...');
  const gameRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/games',
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }, {
    cardPrice: 100,
    totalCards: 20,
    mode: 'automatic',
  });
  const game = gameRes.body.data;
  console.log(`✅ Game #${game.id} created!`);

  // 4. Claim 2 cards for real player (card #1 and card #2) at 100 ETB stake each
  console.log('💳 Real player claiming Card #1 at 100 ETB stake...');
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/1/claim`,
    method: 'POST',
  }, { playerId: player.id, stake: 100 });

  console.log('💳 Real player claiming Card #2 at 100 ETB stake...');
  await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/2/claim`,
    method: 'POST',
  }, { playerId: player.id, stake: 100 });

  // 5. Call GET /api/games/live to inspect response data
  console.log('🔍 Calling GET /api/games/live...');
  const liveRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/games/live',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const liveGame = liveRes.body.data;
  assert(liveGame !== null, 'Live game returned null!');
  assert(liveGame.id === game.id, `Expected live game ID ${game.id}, got ${liveGame.id}`);
  console.log(`✅ Live Game ID: ${liveGame.id}`);

  // Find session for test player
  const session = liveGame.sessions.find(s => s.playerId === player.id);
  assert(session !== undefined, 'Player session not found in live game sessions!');

  const stake = session.bet > 0 ? session.bet : liveGame.cardPrice;
  const cards = session.cardCount;
  const totalBet = stake * cards;

  console.log(`📊 Verified session values: Stake=${stake} ETB, Cards=${cards}, Total Bet=${totalBet} ETB`);
  assert(stake === 100, `Expected stake=100, got ${stake}`);
  assert(cards === 2, `Expected cards=2, got ${cards}`);
  assert(totalBet === 200, `Expected totalBet=200, got ${totalBet}`);

  // Verify Total Prize Pool matches human contribution
  const humanContribution = liveGame.calculatedStats.humanContribution;
  console.log(`💰 Human Contribution (Total Prize Pool): ${humanContribution} ETB`);
  assert(humanContribution === 200, `Expected Total Prize Pool (humanContribution)=200, got ${humanContribution}`);

  // Clean up test game
  await prisma.game.update({ where: { id: game.id }, data: { status: 'cancelled' } });

  console.log('🎉 Live Table Verification successful! All assertions passed!');
}

runLiveTableVerification()
  .catch(err => {
    console.error('❌ Verification crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
