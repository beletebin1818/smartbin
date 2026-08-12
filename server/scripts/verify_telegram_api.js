/**
 * verify_telegram_api.js
 *
 * Test script to verify the new Telegram API endpoints (/api/bot) on the backend.
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

async function run() {
  console.log('🏁 Starting Telegram Bot API Verification...');

  const tempTelegramId = 'telegram_test_user_999';
  const tempPhone = '+251977777777';

  // Make sure test user is cleaned up from previous runs
  await prisma.transaction.deleteMany({ where: { player: { telegramId: tempTelegramId } } });
  await prisma.pendingRequest.deleteMany({ where: { player: { telegramId: tempTelegramId } } });
  await prisma.player.deleteMany({ where: { telegramId: tempTelegramId } });

  // 1. Verify Registration
  console.log('👤 Registering new player via bot API...');
  const regRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/bot/register', method: 'POST',
  }, {
    telegramId: tempTelegramId,
    phoneNumber: tempPhone,
    firstName: 'Telegram',
    lastName: 'Tester',
  });

  assert(regRes.statusCode === 201, `Expected 201, got ${regRes.statusCode}`);
  assert(regRes.body.success === true, 'success should be true');
  assert(regRes.body.isNew === true, 'isNew should be true');
  assert(regRes.body.bonus !== undefined, 'joining bonus should be returned');
  const bonusAmount = regRes.body.bonus;
  console.log(`   ✅ Player registered! Bonus received: ${bonusAmount} ETB`);

  // Try registering again (should find existing)
  console.log('👤 Registering same player again...');
  const regResDuplicate = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/bot/register', method: 'POST',
  }, {
    telegramId: tempTelegramId,
    phoneNumber: tempPhone,
    firstName: 'Telegram',
    lastName: 'Tester',
  });

  assert(regResDuplicate.statusCode === 200, `Expected 200, got ${regResDuplicate.statusCode}`);
  assert(regResDuplicate.body.isNew === false, 'isNew should be false for duplicate');
  console.log('   ✅ Duplicate registration returned existing user profile correctly.');

  // 2. Fetch Balance
  console.log('💰 Querying balance...');
  const balRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/${tempTelegramId}/balance`, method: 'GET',
  });
  assert(balRes.statusCode === 200, `Expected 200, got ${balRes.statusCode}`);
  assert(balRes.body.balance === bonusAmount, `Expected balance to match bonus ${bonusAmount}, got ${balRes.body.balance}`);
  console.log(`   ✅ Balance query verified: ${balRes.body.balance} ETB`);

  // 3. Request Deposit
  console.log('💵 Requesting deposit of 150 ETB...');
  const depRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/${tempTelegramId}/deposit`, method: 'POST',
  }, { amount: 150 });
  assert(depRes.statusCode === 201, `Expected 201, got ${depRes.statusCode}`);
  assert(depRes.body.data.amount === 150, 'Amount mismatch');
  assert(depRes.body.data.status === 'pending', 'Status should be pending');
  console.log('   ✅ Deposit request successfully registered (pending).');

  // 4. Request Withdrawal (Insufficient)
  console.log('🏧 Requesting withdrawal of 50 ETB (should fail due to insufficient balance)...');
  const witResFail = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/${tempTelegramId}/withdrawal`, method: 'POST',
  }, { amount: 50 });
  assert(witResFail.statusCode === 400, `Expected 400, got ${witResFail.statusCode}`);
  console.log('   ✅ Insufficient withdrawal request was successfully rejected.');

  // Request Withdrawal (Valid)
  console.log('🏧 Requesting withdrawal of 5 ETB (should succeed)...');
  const witRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/${tempTelegramId}/withdrawal`, method: 'POST',
  }, { amount: 5 });
  assert(witRes.statusCode === 201, `Expected 201, got ${witRes.statusCode}`);
  assert(witRes.body.data.amount === 5, 'Amount mismatch');
  assert(witRes.body.data.status === 'pending', 'Status should be pending');
  console.log('   ✅ Withdrawal request successfully registered (pending).');

  // 5. Cleanup
  console.log('🧹 Cleaning up test player data...');
  await prisma.transaction.deleteMany({ where: { player: { telegramId: tempTelegramId } } });
  await prisma.pendingRequest.deleteMany({ where: { player: { telegramId: tempTelegramId } } });
  await prisma.player.deleteMany({ where: { telegramId: tempTelegramId } });

  console.log('🎉 Telegram Bot API Verification completed successfully! All checks passed!');
}

run()
  .catch(err => {
    console.error('❌ Verification crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
