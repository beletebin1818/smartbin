/**
 * verify_bot_service.js
 *
 * End-to-end verification script for Step 6.2 — Bot Service.
 *
 * Tests (in order):
 *   1.  loadBotConfiguration  — reads effective config from GameSettings
 *   2.  createBot             — creates a single bot player
 *   3.  getAvailableBots      — lists all bots in the DB
 *   4.  createBots(10)        — creates ten more bots
 *   5.  ensureBotPool(15)     — ensures 15 bots exist (should only top up)
 *   6.  creditBot             — credits a bot's wallet via transaction
 *   7.  debitBot              — debits a bot's wallet via transaction
 *   8.  assignRandomCards     — bot claims cards using the existing claim endpoint
 *   9.  getBotStatistics      — returns aggregate stats
 *   10. Cleanup               — deletes test data created by this script
 *
 * Requires the backend server to be running on localhost:3000.
 * Uses an Admin JWT for game creation (same credentials as other verify scripts).
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

// Import the service under test directly (no HTTP wrapper needed for most methods)
const botService = require('../src/services/botService');

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP helper (matches existing verify script pattern)
// ─────────────────────────────────────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers = options.headers || {};
      options.headers['Content-Type']   = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try   { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ statusCode: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Assertion helper
// ─────────────────────────────────────────────────────────────────────────────
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Track IDs created during this run so we can clean up
// ─────────────────────────────────────────────────────────────────────────────
const createdBotIds = [];
let   testGameId    = null;

// ─────────────────────────────────────────────────────────────────────────────
//  Main verification routine
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       🤖  Bot Service Verification — Step 6.2           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ── Step 1: loadBotConfiguration ──────────────────────────────────────────
  console.log('① loadBotConfiguration — reading global settings...');
  const config = await botService.loadBotConfiguration();

  assert(typeof config.botsEnabled    === 'boolean', 'botsEnabled must be a boolean');
  assert(typeof config.minBotPlayers  === 'number',  'minBotPlayers must be a number');
  assert(typeof config.maxBotPlayers  === 'number',  'maxBotPlayers must be a number');
  assert(typeof config.botMinCards    === 'number',  'botMinCards must be a number');
  assert(typeof config.botMaxCards    === 'number',  'botMaxCards must be a number');
  assert(typeof config.showBotLabels  === 'boolean', 'showBotLabels must be a boolean');
  assert(typeof config.botJoinDelayMin === 'number', 'botJoinDelayMin must be a number');
  assert(typeof config.botJoinDelayMax === 'number', 'botJoinDelayMax must be a number');

  console.log(`   ✅ Config loaded: botsEnabled=${config.botsEnabled}, ` +
              `minBotPlayers=${config.minBotPlayers}, maxBotPlayers=${config.maxBotPlayers}, ` +
              `botMinCards=${config.botMinCards}, botMaxCards=${config.botMaxCards}`);

  // ── Step 2: createBot ─────────────────────────────────────────────────────
  console.log('');
  console.log('② createBot — creating a single bot player...');
  const singleBot = await botService.createBot({ minBalance: 500, maxBalance: 500 });
  createdBotIds.push(singleBot.id);

  assert(singleBot.isBot    === true,   'isBot must be true');
  assert(typeof singleBot.firstName === 'string' && singleBot.firstName.length > 0,
                                         'firstName must be a non-empty string');
  assert(singleBot.botAvatar !== null,   'botAvatar must be set');
  assert(singleBot.balance   === 500,    'starting balance must be 500');
  assert(singleBot.telegramId.startsWith('bot_'), 'telegramId must start with "bot_"');

  console.log(`   ✅ Bot created: ID=${singleBot.id}, name="${singleBot.firstName}", ` +
              `avatar="${singleBot.botAvatar}", balance=${singleBot.balance} ETB`);

  // ── Step 3: getAvailableBots ──────────────────────────────────────────────
  console.log('');
  console.log('③ getAvailableBots — listing all bots in DB...');
  const allBots = await botService.getAvailableBots();

  assert(Array.isArray(allBots),          'getAvailableBots must return an array');
  assert(allBots.length >= 1,             'must have at least 1 bot after createBot');
  assert(allBots.every((b) => b.isBot === true), 'every returned player must have isBot=true');

  console.log(`   ✅ Found ${allBots.length} bot(s) in the database.`);

  // ── Step 4: createBots(10) ────────────────────────────────────────────────
  console.log('');
  console.log('④ createBots(10) — creating ten bots at once...');
  const tenBots = await botService.createBots(10, { minBalance: 200, maxBalance: 1000 });
  tenBots.forEach((b) => createdBotIds.push(b.id));

  assert(tenBots.length === 10,               'createBots(10) must return exactly 10 records');
  assert(tenBots.every((b) => b.isBot === true), 'every bot must have isBot=true');

  const names = tenBots.map((b) => b.firstName);
  console.log(`   ✅ Ten bots created. Sample names: ${names.slice(0, 4).join(', ')}...`);

  // ── Step 5: ensureBotPool ─────────────────────────────────────────────────
  console.log('');
  console.log('⑤ ensureBotPool(15) — ensuring at least 15 bots exist...');
  const poolBefore = await botService.getAvailableBots();
  const poolResult = await botService.ensureBotPool(15, { minBalance: 300, maxBalance: 300 });
  poolResult.created.forEach((b) => createdBotIds.push(b.id));

  const poolAfter = await botService.getAvailableBots();

  assert(poolAfter.length >= 15,        'pool must have at least 15 bots');
  assert(poolResult.total === poolAfter.length, 'reported total must match actual DB count');

  const expectedCreated = Math.max(0, 15 - poolBefore.length);
  assert(poolResult.created.length === expectedCreated,
    `ensureBotPool should have created ${expectedCreated} bots, got ${poolResult.created.length}`);

  console.log(`   ✅ Pool ensured: existed=${poolResult.existing}, ` +
              `created=${poolResult.created.length}, total=${poolResult.total}`);

  // ── Step 6: creditBot ─────────────────────────────────────────────────────
  console.log('');
  console.log('⑥ creditBot — crediting a bot\'s wallet...');
  const botToCredit   = singleBot;
  const creditAmount  = 250;
  const creditResult  = await botService.creditBot(botToCredit.id, creditAmount, 'Verification top-up');

  assert(creditResult.bot.balance === botToCredit.balance + creditAmount,
    `balance after credit must be ${botToCredit.balance + creditAmount}`);
  assert(creditResult.transaction.type   === 'deposit',  'transaction type must be deposit');
  assert(creditResult.transaction.amount === creditAmount, 'transaction amount must match');

  console.log(`   ✅ Credited ${creditAmount} ETB | new balance: ${creditResult.bot.balance} ETB`);
  console.log(`      TX: type="${creditResult.transaction.type}", ` +
              `balanceBefore=${creditResult.transaction.balanceBefore}, ` +
              `balanceAfter=${creditResult.transaction.balanceAfter}`);

  // ── Step 7: debitBot ──────────────────────────────────────────────────────
  console.log('');
  console.log('⑦ debitBot — debiting a bot\'s wallet...');
  const debitAmount  = 100;
  const balanceBeforeDebit = creditResult.bot.balance;
  const debitResult  = await botService.debitBot(botToCredit.id, debitAmount, 'Verification debit');

  assert(debitResult.bot.balance === balanceBeforeDebit - debitAmount,
    `balance after debit must be ${balanceBeforeDebit - debitAmount}`);
  assert(debitResult.transaction.type   === 'withdrawal', 'transaction type must be withdrawal');
  assert(debitResult.transaction.amount === debitAmount,  'transaction amount must match');

  console.log(`   ✅ Debited ${debitAmount} ETB | new balance: ${debitResult.bot.balance} ETB`);
  console.log(`      TX: type="${debitResult.transaction.type}", ` +
              `balanceBefore=${debitResult.transaction.balanceBefore}, ` +
              `balanceAfter=${debitResult.transaction.balanceAfter}`);

  // ── Step 8: assignRandomCards via existing claim endpoint ─────────────────
  console.log('');
  console.log('⑧ assignRandomCards — bot claiming cards via existing claim endpoint...');

  // We need a live game in "waiting" status.  Create one via the admin API.
  const loginRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/auth/login', method: 'POST',
  }, { username: 'john', password: 'johnadmin' });

  assert(loginRes.statusCode === 200, `Admin login must succeed (got ${loginRes.statusCode})`);
  const token = loginRes.body.token;

  const gameRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/games', method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }, { cardPrice: 50, totalCards: 20, mode: 'automatic' });

  assert(gameRes.statusCode === 201,
    `Game creation must return 201 (got ${gameRes.statusCode}): ${JSON.stringify(gameRes.body)}`);

  testGameId = gameRes.body.data.id;
  console.log(`   🎮 Test game #${testGameId} created (status: waiting, 20 cards @ 50 ETB each)`);

  // Give the bot enough balance to buy cards
  await botService.creditBot(
    singleBot.id,
    500,
    'Pre-game funding for card assignment test',
  );

  // Override settings to allow up to 3 cards per player for this test
  await prisma.gameSettings.upsert({
    where:  { id: 1 },
    update: { maxCardsPerPlayer: 3, botMinCards: 1, botMaxCards: 3 },
    create: { id: 1, maxCardsPerPlayer: 3, botMinCards: 1, botMaxCards: 3 },
  });

  const cardResult = await botService.assignRandomCards(singleBot.id, testGameId);

  assert(Array.isArray(cardResult.claimed), 'claimed must be an array');
  assert(cardResult.claimed.length >= 1,    'bot must claim at least 1 card');
  assert(typeof cardResult.skipped === 'number', 'skipped must be a number');

  console.log(`   ✅ Bot #${singleBot.id} claimed ${cardResult.claimed.length} card(s), ` +
              `skipped ${cardResult.skipped} (concurrent conflicts)`);

  // Verify via DB that the cards are actually assigned
  const dbCards = await prisma.bingoCard.findMany({
    where: { gameId: testGameId, playerId: singleBot.id },
  });
  assert(dbCards.length === cardResult.claimed.length,
    `DB must show ${cardResult.claimed.length} cards claimed by bot`);

  console.log(`   ✅ DB confirmed ${dbCards.length} card(s) assigned to bot #${singleBot.id}`);

  // ── Step 9: getBotStatistics ──────────────────────────────────────────────
  console.log('');
  console.log('⑨ getBotStatistics — fetching aggregate stats...');
  const stats = await botService.getBotStatistics();

  assert(typeof stats.totalBots         === 'number', 'totalBots must be a number');
  assert(typeof stats.totalBalance      === 'number', 'totalBalance must be a number');
  assert(typeof stats.gamesPlayed       === 'number', 'gamesPlayed must be a number');
  assert(typeof stats.gamesWon          === 'number', 'gamesWon must be a number');
  assert(typeof stats.cardsPurchased    === 'number', 'cardsPurchased must be a number');
  assert(typeof stats.currentOnlineBots === 'number', 'currentOnlineBots must be a number');

  assert(stats.totalBots      >= 15,  'must report at least 15 bots');
  assert(stats.cardsPurchased >= 1,   'must report at least 1 card purchased');

  console.log('   ✅ Bot statistics:');
  console.log(`      Total Bots:         ${stats.totalBots}`);
  console.log(`      Total Balance:      ${stats.totalBalance} ETB`);
  console.log(`      Games Played:       ${stats.gamesPlayed}`);
  console.log(`      Games Won:          ${stats.gamesWon}`);
  console.log(`      Cards Purchased:    ${stats.cardsPurchased}`);
  console.log(`      Currently Online:   ${stats.currentOnlineBots}`);

  // ── Step 10: Cleanup ──────────────────────────────────────────────────────
  console.log('');
  console.log('⑩ Cleanup — removing test bots and game created by this script...');

  // Cancel the test game so the engine doesn't keep running after script exits
  if (testGameId) {
    try {
      await prisma.game.update({
        where: { id: testGameId },
        data:  { status: 'cancelled' },
      });
      console.log(`   🗑️  Cancelled test game #${testGameId}`);
    } catch (_) { /* non-critical */ }
  }

  // Remove bots created in this run
  if (createdBotIds.length > 0) {
    // Must delete child records first to satisfy FK constraints
    await prisma.transaction.deleteMany({ where: { playerId: { in: createdBotIds } } });
    await prisma.bingoCard.updateMany({
      where: { playerId: { in: createdBotIds } },
      data:  { playerId: null, sessionId: null },
    });
    await prisma.gameSession.deleteMany({ where: { playerId: { in: createdBotIds } } });
    await prisma.player.deleteMany({ where: { id: { in: createdBotIds } } });
    console.log(`   🗑️  Deleted ${createdBotIds.length} bot player(s) created during verification`);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🎉  All bot service checks passed! Step 6.2 verified.  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
}

run()
  .catch((err) => {
    console.error('❌ Bot service verification crashed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
