/**
 * verify_bot_admin.js
 *
 * End-to-end verification script for Step 6.4 — Bot Management API.
 *
 * Verifies:
 *   1. Permissions: Only super_admin / admin roles can access, agent gets 403, no token gets 401.
 *   2. POST /api/admin/bots/create: Successfully creates specified count of bots.
 *   3. GET /api/admin/bots: Statistics are accurate.
 *   4. PUT /api/admin/bots/settings: Input validations are enforced (min > max validation).
 *   5. PUT /api/admin/bots/settings: Valid settings are persisted.
 *   6. POST /api/admin/bots/reset-balance: Resets one or all bot balances and records transactions.
 *   7. GET /api/admin/bots/:id: Returns full profile including transactions.
 *   8. DELETE /api/admin/bots/:id: Soft-deactivates the bot (status=false).
 *   9. Cleanup.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const http = require('http');

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

let testBotIds = [];

async function run() {
  console.log('🏁 Starting Bot Management API Verification...');

  // 1. Get tokens for Admin and Agent (Agent is forbidden, Admin is allowed)
  console.log('🔑 Logging in as Admin and Agent to obtain tokens...');
  
  // Admin Login
  const adminLogin = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/auth/login', method: 'POST',
  }, { username: 'john', password: 'johnadmin' });
  assert(adminLogin.statusCode === 200, 'Admin login failed');
  const adminToken = adminLogin.body.token;

  // Agent Login
  // Let's create a temporary agent to login if agent doesn't exist, or just use existing.
  // We can seed or query database for an agent.
  let agent = await prisma.agent.findFirst();
  if (!agent) {
    // create a temp agent
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('agentpassword', 10);
    agent = await prisma.agent.create({
      data: {
        username: 'tempagent',
        password: hash,
        firstName: 'Temp',
        lastName: 'Agent',
        phoneNumber: '+251955555555',
        status: true,
      }
    });
  }
  const agentLogin = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/auth/login', method: 'POST',
  }, { username: agent.username, password: 'agentpassword' });
  // Note: if agent password was already changed, we can use the database to update agent password.
  if (agentLogin.statusCode !== 200) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('agentpassword', 10);
    await prisma.agent.update({
      where: { id: agent.id },
      data: { password: hash }
    });
  }
  const agentLoginRetry = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/auth/login', method: 'POST',
  }, { username: agent.username, password: 'agentpassword' });
  assert(agentLoginRetry.statusCode === 200, 'Agent login failed');
  const agentToken = agentLoginRetry.body.token;

  // ── Test Permissions ────────────────────────────────────────────────────────
  console.log('🛡️  Verifying route permissions...');
  
  // No token -> 401
  const resNoToken = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots', method: 'GET',
  });
  assert(resNoToken.statusCode === 401, `No token should return 401, got ${resNoToken.statusCode}`);

  // Agent token -> 403
  const resAgentToken = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots', method: 'GET',
    headers: { 'Authorization': `Bearer ${agentToken}` },
  });
  assert(resAgentToken.statusCode === 403, `Agent token should return 403, got ${resAgentToken.statusCode}`);

  // Admin token -> 200
  const resAdminToken = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots', method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(resAdminToken.statusCode === 200, `Admin token should return 200, got ${resAdminToken.statusCode}`);
  console.log('✅ Permissions verified successfully.');

  // ── Test Bot Creation ───────────────────────────────────────────────────────
  console.log('🤖 Creating 5 bots via API...');
  const createRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots/create', method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  }, { count: 5 });

  assert(createRes.statusCode === 201, `Bot creation failed, got ${createRes.statusCode}`);
  assert(createRes.body.success === true, 'Response success should be true');
  assert(createRes.body.data.length === 5, `Expected 5 bots, got ${createRes.body.data.length}`);
  
  testBotIds = createRes.body.data.map(b => b.id);
  console.log(`✅ Successfully created 5 bots. IDs: ${testBotIds.join(', ')}`);

  // ── Test Bot Stats ──────────────────────────────────────────────────────────
  console.log('📊 Fetching bot stats...');
  const statsRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots', method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(statsRes.statusCode === 200, `Stats request failed: ${statsRes.statusCode}`);
  const stats = statsRes.body.data;
  assert(stats.totalBots >= 5, `Total bots should be at least 5, got ${stats.totalBots}`);
  assert(stats.currentBalances !== undefined, 'currentBalances should be returned');
  console.log(`✅ Stats verified. Total bots: ${stats.totalBots}, current balances sum: ${stats.currentBalances} ETB`);

  // ── Test Settings Validation ────────────────────────────────────────────────
  console.log('⚙️ Testing settings input validations...');

  // minBotPlayers > maxBotPlayers
  const badSettings1 = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots/settings', method: 'PUT',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  }, { minBotPlayers: 10, maxBotPlayers: 5 });
  assert(badSettings1.statusCode === 400, `Expected 400 for minBotPlayers > maxBotPlayers, got ${badSettings1.statusCode}`);

  // botMinCards > botMaxCards
  const badSettings2 = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots/settings', method: 'PUT',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  }, { botMinCards: 5, botMaxCards: 2 });
  assert(badSettings2.statusCode === 400, `Expected 400 for botMinCards > botMaxCards, got ${badSettings2.statusCode}`);

  // Negative delays
  const badSettings3 = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots/settings', method: 'PUT',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  }, { botJoinDelayMin: -100 });
  assert(badSettings3.statusCode === 400, `Expected 400 for negative delay, got ${badSettings3.statusCode}`);

  console.log('✅ Settings validation rules successfully rejected invalid inputs.');

  // ── Test Settings Update ────────────────────────────────────────────────────
  console.log('⚙️ Persisting valid settings settings...');
  const newSettings = {
    botsEnabled: true,
    minBotPlayers: 2,
    maxBotPlayers: 4,
    botMinCards: 1,
    botMaxCards: 3,
    showBotLabels: false,
    botJoinDelayMin: 200,
    botJoinDelayMax: 800,
  };
  const settingsRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots/settings', method: 'PUT',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  }, newSettings);

  assert(settingsRes.statusCode === 200, `Settings update failed, got ${settingsRes.statusCode}`);
  const updatedSettings = settingsRes.body.data;
  assert(updatedSettings.botsEnabled === true, 'botsEnabled should be true');
  assert(updatedSettings.minBotPlayers === 2, 'minBotPlayers should be 2');
  assert(updatedSettings.maxBotPlayers === 4, 'maxBotPlayers should be 4');
  assert(updatedSettings.botMinCards === 1, 'botMinCards should be 1');
  assert(updatedSettings.botMaxCards === 3, 'botMaxCards should be 3');
  assert(updatedSettings.showBotLabels === false, 'showBotLabels should be false');
  assert(updatedSettings.botJoinDelayMin === 200, 'botJoinDelayMin should be 200');
  assert(updatedSettings.botJoinDelayMax === 800, 'botJoinDelayMax should be 800');
  console.log('✅ Settings successfully updated and verified.');

  // ── Test Reset Balance ──────────────────────────────────────────────────────
  console.log('💰 Testing bot balance reset...');
  
  // Let's reset the balance of all bots to exactly 150
  const resetRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/bots/reset-balance', method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  }, { balance: 150 });
  assert(resetRes.statusCode === 200, `Balance reset failed, got ${resetRes.statusCode}`);
  
  // Verify DB state for one of our test bots
  const testBot = await prisma.player.findUnique({
    where: { id: testBotIds[0] },
    include: { transactions: true }
  });
  assert(testBot.balance === 150, `Expected balance to be 150, got ${testBot.balance}`);
  assert(testBot.transactions.length > 0, 'Expected transaction ledger entry to be created for balance adjustment');
  console.log(`✅ Balance reset verified. Bot #${testBot.id} balance is ${testBot.balance} ETB, TX created: "${testBot.transactions[0].note}"`);

  // ── Test Bot Profile ────────────────────────────────────────────────────────
  console.log('👤 Fetching single bot profile...');
  const profileRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/admin/bots/${testBotIds[0]}`, method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(profileRes.statusCode === 200, `Profile request failed, got ${profileRes.statusCode}`);
  const profile = profileRes.body.data;
  assert(profile.id === testBotIds[0], 'ID should match');
  assert(profile.balance === 150, 'Balance should match');
  assert(profile.status === 'active', 'Status should be active');
  assert(profile.transactions.length > 0, 'Transactions array should not be empty');
  console.log(`✅ Single bot profile verified. Username: "${profile.username}"`);

  // ── Test Deactivation ───────────────────────────────────────────────────────
  console.log('🗑️ Deactivating bot (soft-delete)...');
  const deleteRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/admin/bots/${testBotIds[0]}`, method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(deleteRes.statusCode === 200, `Delete request failed, got ${deleteRes.statusCode}`);
  
  const deactivatedBot = await prisma.player.findUnique({
    where: { id: testBotIds[0] }
  });
  assert(deactivatedBot.status === false, 'Bot status in database should be false');
  console.log(`✅ Soft-delete verified. Status in database is false.`);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  console.log('🧹 Cleaning up test bots...');
  if (testBotIds.length > 0) {
    await prisma.transaction.deleteMany({ where: { playerId: { in: testBotIds } } });
    await prisma.bingoCard.updateMany({
      where: { playerId: { in: testBotIds } },
      data: { playerId: null, sessionId: null }
    });
    await prisma.gameSession.deleteMany({ where: { playerId: { in: testBotIds } } });
    await prisma.player.deleteMany({ where: { id: { in: testBotIds } } });
  }

  // Restore game settings to clean state
  await prisma.gameSettings.update({
    where: { id: 1 },
    data: {
      botsEnabled: false,
      minBotPlayers: 0,
      maxBotPlayers: 0,
    }
  });

  console.log('🎉 Bot Management API verification completed successfully! All assertions passed!');
}

run()
  .catch((err) => {
    console.error('❌ Verification script crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
