/**
 * Verification script for card pool generation and claiming logic
 */

const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

// Helper to make HTTP requests
function request(options, body = null) {
  const bodyStr = body ? JSON.stringify(body) : null;
  if (bodyStr) {
    options.headers = options.headers || {};
    options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    options.headers['Content-Type'] = 'application/json';
  }

  return new Promise((resolve, reject) => {
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

async function runVerification() {
  console.log('🚀 Starting card-pool and claim verification...');

  // Ensure gameSettings lobbySeconds is long enough for manual test steps
  await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: { lobbySeconds: 60, maxCardsPerPlayer: 5 },
    create: { id: 1, lobbySeconds: 60, maxCardsPerPlayer: 5 },
  });

  // 1. Create a dummy player in the database
  console.log('👤 Creating test player...');
  const player = await prisma.player.upsert({
    where: { telegramId: 'test_telegram_123' },
    update: { balance: 500 }, // Reset balance to 500 ETB
    create: {
      telegramId: 'test_telegram_123',
      firstName: 'Verification',
      lastName: 'Tester',
      phoneNumber: '+251999999999',
      balance: 500,
    },
  });
  console.log(`✅ Player created: ID ${player.id}, Balance: ${player.balance} ETB`);

  // 2. Login to get Admin JWT token
  console.log('🔑 Logging in as Admin...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    username: 'john',
    password: 'johnadmin',
  });

  if (loginRes.statusCode !== 200) {
    console.error('❌ Login failed:', loginRes.body);
    process.exit(1);
  }

  const token = loginRes.body.token;
  console.log('✅ Admin login successful!');

  // 3. Create a new Game
  console.log('🎮 Creating new game with 10 cards...');
  const gameRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/games',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  }, {
    cardPrice: 50,
    totalCards: 10,
    mode: 'automatic',
    prize: 0,
  });

  if (gameRes.statusCode !== 201) {
    console.error('❌ Game creation failed:', gameRes.body);
    process.exit(1);
  }

  const game = gameRes.body.data;
  console.log(`✅ Game created: ID ${game.id}, totalCards: ${game.totalCards}`);

  // 4. Retrieve card pool without player identity
  console.log('📋 Listing cards as anonymous player...');
  const listResAnon = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards`,
    method: 'GET',
  });

  if (listResAnon.statusCode !== 200) {
    console.error('❌ Listing cards failed:', listResAnon.body);
    process.exit(1);
  }

  const anonCards = listResAnon.body.data;
  console.log(`✅ Listed ${anonCards.length} cards.`);
  const card1 = anonCards[0];
  console.log(`👉 Card 1 Claimed status: ${card1.claimed}. Has numbers array: ${card1.numbers !== undefined}`);
  if (card1.numbers !== undefined) {
    console.error('❌ Security breach: Numbers array exposed for unclaimed cards!');
    process.exit(1);
  }

  // 5. Claim Card #3 for our test player
  console.log('💳 Claiming card #3...');
  const claimRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/3/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    playerId: player.id,
  });

  if (claimRes.statusCode !== 200) {
    console.error('❌ Claim failed:', claimRes.body);
    process.exit(1);
  }

  console.log('✅ Claim succeeded!', claimRes.body.data);
  console.log(`💰 New balance: ${claimRes.body.data.newBalance} ETB`);

  // 6. List cards specifying our player ID
  console.log(`📋 Listing cards specifying player ID ${player.id}...`);
  const listResPlayer = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards?playerId=${player.id}`,
    method: 'GET',
  });

  const playerCards = listResPlayer.body.data;
  const claimedCard = playerCards.find(c => c.cardNumber === 3);
  const otherCard = playerCards.find(c => c.cardNumber === 1);

  console.log(`👉 Card 3 (Mine) - Claimed: ${claimedCard.claimed}, Numbers array visible: ${claimedCard.numbers !== undefined}`);
  if (claimedCard.numbers === undefined) {
    console.error('❌ Error: Requester should see own card numbers!');
    process.exit(1);
  }
  console.log('🧬 Card 3 Numbers:', claimedCard.numbers);

  console.log(`👉 Card 1 (Other/Unclaimed) - Claimed: ${otherCard.claimed}, Numbers array visible: ${otherCard.numbers !== undefined}`);
  if (otherCard.numbers !== undefined) {
    console.error('❌ Error: Requester should NOT see other cards numbers!');
    process.exit(1);
  }

  // 7. Verify atomic transaction behavior (re-claiming card #3 should fail)
  console.log('🔒 Testing race condition (re-claiming card #3)...');
  const claimResDouble = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/3/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    playerId: player.id,
  });

  console.log(`👉 Re-claim response code: ${claimResDouble.statusCode} (should be 400), Message: "${claimResDouble.body.message}"`);
  if (claimResDouble.statusCode !== 400) {
    console.error('❌ Error: Double claim succeeded or returned invalid status code!');
    process.exit(1);
  }

  // 8. Test claiming multiple cards up to limit
  console.log('🛒 Claiming cards #4, #5, #6, #7...');
  for (let num of [4, 5, 6, 7]) {
    await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/games/${game.id}/cards/${num}/claim`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { playerId: player.id });
  }

  console.log('🚫 Claiming card #8 (which exceeds the 5-card limit)...');
  const claimResExceeded = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/8/claim`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { playerId: player.id });

  console.log(`👉 Exceeded claim response code: ${claimResExceeded.statusCode} (should be 400), Message: "${claimResExceeded.body.message}"`);
  if (claimResExceeded.statusCode !== 400) {
    console.error('❌ Error: Claiming past setting limits succeeded!');
    process.exit(1);
  }

  // 9. Test unclaiming card #3
  console.log('❌ Releasing card #3...');
  const releaseRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/games/${game.id}/cards/3/claim`,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  }, {
    playerId: player.id,
  });

  if (releaseRes.statusCode !== 200) {
    console.error('❌ Release failed:', releaseRes.body);
    process.exit(1);
  }

  console.log('✅ Release succeeded!', releaseRes.body.data);
  console.log(`💰 Refounded balance: ${releaseRes.body.data.newBalance} ETB`);

  // 10. Verify card is now unclaimed in DB
  const verifiedCard = await prisma.bingoCard.findUnique({
    where: { gameId_cardNumber: { gameId: game.id, cardNumber: 3 } },
  });

  console.log(`👉 Card 3 database state - playerId: ${verifiedCard.playerId}, sessionId: ${verifiedCard.sessionId}`);
  if (verifiedCard.playerId !== null || verifiedCard.sessionId !== null) {
    console.error('❌ Error: Card was not fully cleaned in DB!');
    process.exit(1);
  }

  console.log('🎉 Verification completed successfully! All checks passed!');
}

runVerification()
  .catch(err => {
    console.error('❌ Verification script crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
