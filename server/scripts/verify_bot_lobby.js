/**
 * verify_bot_lobby.js
 *
 * End-to-end verification script for Step 6.3 — Bot Engine Integration.
 *
 * Tests:
 *   1. Sets GameSettings for bots to enabled, target 3-5 bots, min/max cards, and delay 100-500ms.
 *   2. Connects a Socket.io client to listen to events (lobby:tick, bot:joined).
 *   3. Creates a new game.
 *   4. Verifies that the client receives the `bot:joined` events for multiple bots.
 *   5. Verifies that the bots claimed cards through the service (registered in DB).
 *   6. Verifies that the countdown timer (lobby:tick) still functions.
 *   7. Cleans up test bots, transactions, and games.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { io } = require('socket.io-client');

const prisma = new PrismaClient();

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers = options.headers || {};
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ statusCode: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function run() {
  console.log('🏁 Starting Bot Lobby Population Verification...');

  // 1. Configure settings for the test
  console.log('⚙️ Configuring GameSettings: botsEnabled=true, minBotPlayers=3, maxBotPlayers=5, delays=100-500ms...');
  await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: {
      botsEnabled: true,
      minBotPlayers: 3,
      maxBotPlayers: 5,
      botMinCards: 1,
      botMaxCards: 2,
      showBotLabels: true,
      botJoinDelayMin: 100,
      botJoinDelayMax: 500,
      lobbySeconds: 5,
      maxCardsPerPlayer: 5,
    },
    create: {
      id: 1,
      botsEnabled: true,
      minBotPlayers: 3,
      maxBotPlayers: 5,
      botMinCards: 1,
      botMaxCards: 2,
      showBotLabels: true,
      botJoinDelayMin: 100,
      botJoinDelayMax: 500,
      lobbySeconds: 5,
      maxCardsPerPlayer: 5,
    },
  });

  // 2. Login to get Admin JWT token
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

  assert(loginRes.statusCode === 200, 'Admin login failed');
  const token = loginRes.body.token;

  // 3. Create a new Game via API
  console.log('🎮 Creating a new game...');
  const gameRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/games',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  }, {
    cardPrice: 10,
    totalCards: 50,
    mode: 'automatic',
  });

  assert(gameRes.statusCode === 201, 'Game creation failed');
  const game = gameRes.body.data;
  console.log(`✅ Game #${game.id} created successfully! Status: ${game.status}`);

  // 4. Connect Socket client and join game room
  console.log('🔌 Connecting Socket client...');
  const socketClient = io('http://localhost:3000');

  await new Promise((resolve) => {
    socketClient.on('connect', () => {
      console.log('✅ Socket connected, ID:', socketClient.id);
      socketClient.emit('join_game', { gameId: game.id });
      resolve();
    });
  });

  // Track Socket events
  const botJoinedEvents = [];
  let lobbyTickCount = 0;

  socketClient.on('bot:joined', (data) => {
    console.log(`💬 [Event: bot:joined] Bot name: ${data.username}, cards: ${data.claimedCards.join(', ')}`);
    botJoinedEvents.push(data);
  });

  socketClient.on('lobby:tick', (data) => {
    console.log(`💬 [Event: lobby:tick] Seconds left: ${data.secondsLeft}`);
    lobbyTickCount++;
  });

  // Wait for 2.5 seconds to allow bot joins and lobby tick events to process
  console.log('⏳ Waiting for bots to join based on random delays...');
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // 5. Assertions
  console.log('🔍 Running assertions...');

  // Verify that bots have joined
  assert(botJoinedEvents.length >= 3 && botJoinedEvents.length <= 5,
    `Expected between 3 and 5 bot joined events, but got ${botJoinedEvents.length}`);
  console.log(`✅ Event count verified: ${botJoinedEvents.length} bots joined.`);

  // Verify each event structure
  botJoinedEvents.forEach(evt => {
    assert(evt.botId !== undefined, 'botId is missing');
    assert(evt.username !== undefined, 'username is missing');
    assert(evt.avatar !== undefined, 'avatar is missing');
    assert(Array.isArray(evt.claimedCards) && evt.claimedCards.length >= 1, 'claimedCards should be a non-empty array');
    assert(evt.isBot === true, 'isBot should be true');
  });
  console.log('✅ Bot joined event structures verified.');

  // Verify that lobby tick events were received
  assert(lobbyTickCount > 0, 'Expected lobby tick events, but got none');
  console.log(`✅ Lobby countdown verified. Received ${lobbyTickCount} tick event(s).`);

  // Verify DB state for cards assigned to these bots
  const botIdsInEvent = botJoinedEvents.map(evt => evt.botId);
  const claimedCardsInDb = await prisma.bingoCard.findMany({
    where: {
      gameId: game.id,
      playerId: { in: botIdsInEvent }
    }
  });

  assert(claimedCardsInDb.length > 0, 'No cards were claimed by bots in the database');
  console.log(`✅ DB state verified: ${claimedCardsInDb.length} card(s) claimed by bots in Game #${game.id}`);

  // 6. Cleanup
  console.log('🧹 Cleaning up test game and bots...');
  socketClient.disconnect();

  // Cancel the test game so it doesn't keep processing draws
  await prisma.game.update({
    where: { id: game.id },
    data: { status: 'cancelled' }
  });

  // Find all bots created by the engine/service to cleanup
  const botsToDelete = await prisma.player.findMany({
    where: { isBot: true }
  });
  const botIds = botsToDelete.map(b => b.id);

  if (botIds.length > 0) {
    await prisma.transaction.deleteMany({ where: { playerId: { in: botIds } } });
    await prisma.bingoCard.updateMany({
      where: { playerId: { in: botIds } },
      data: { playerId: null, sessionId: null }
    });
    await prisma.gameSession.deleteMany({ where: { playerId: { in: botIds } } });
    await prisma.player.deleteMany({ where: { id: { in: botIds } } });
  }

  // Restore game settings to original/sane defaults
  await prisma.gameSettings.update({
    where: { id: 1 },
    data: {
      botsEnabled: false,
      minBotPlayers: 0,
      maxBotPlayers: 0,
    }
  });

  console.log('🎉 Bot lobby population verification script completed successfully! All assertions passed!');
}

run()
  .catch((err) => {
    console.error('❌ Verification script crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
