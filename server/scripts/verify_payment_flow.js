/**
 * Scripts: verify_payment_flow.js
 *
 * Verifies balance calculation, payment accounts administration,
 * deposit/withdrawal endpoints, formatting, and database consistency.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { escapeMarkdownV2 } = require('../telegram-bot/src/utils/markdown');
const { t } = require('../telegram-bot/src/utils/i18n');

const prisma = new PrismaClient();

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

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function run() {
  console.log('🏁 Starting Payment Flow Verification...');

  // Ensure GameSettings supportUsername is set
  await prisma.gameSettings.upsert({
    where: { id: 1 },
    update: { supportUsername: '@REDBINGOTESTSUPPORT' },
    create: { id: 1, supportUsername: '@REDBINGOTESTSUPPORT' },
  });

  // Login as admin to get JWT
  console.log('🔑 Logging in as admin...');
  const loginRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/auth/login', method: 'POST',
  }, { username: 'john', password: 'johnadmin' });

  assert(loginRes.statusCode === 200, `Admin login failed (status: ${loginRes.statusCode})`);
  const token = loginRes.body.token;
  console.log('✅ Admin login successful!');

  // Clear any old test payment accounts
  await prisma.paymentAccount.deleteMany({
    where: { method: { in: ['TEST_CBE', 'TEST_TELEBIRR', 'TEST_UPDATED'] } }
  });

  // Test admin CRUD endpoints for payment accounts
  console.log('🛠️ Testing Payment Accounts CRUD...');
  
  // 1. Create CBE
  const createRes1 = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/payment-accounts', method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  }, {
    method: 'TEST_CBE',
    accountName: 'Amanuel Melese',
    accountNumber: '1000750568134',
    isActive: true,
    displayOrder: 1
  });
  assert(createRes1.statusCode === 201, `Create CBE failed: ${JSON.stringify(createRes1.body)}`);
  const cbeId = createRes1.body.data.id;

  // 2. Create TeleBirr
  const createRes2 = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/payment-accounts', method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  }, {
    method: 'TEST_TELEBIRR',
    accountName: 'Amanuel',
    accountNumber: '0999228484',
    isActive: true,
    displayOrder: 2
  });
  assert(createRes2.statusCode === 201, `Create TeleBirr failed: ${JSON.stringify(createRes2.body)}`);
  const teleId = createRes2.body.data.id;

  // 3. List
  const listRes = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/admin/payment-accounts', method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(listRes.statusCode === 200, `List failed: ${JSON.stringify(listRes.body)}`);
  const listData = listRes.body.data;
  assert(listData.some(acc => acc.id === cbeId), 'Listed accounts must include CBE');
  assert(listData.some(acc => acc.id === teleId), 'Listed accounts must include TeleBirr');
  console.log('   ✅ CBE and TeleBirr successfully created via Admin CRUD!');

  // 4. Update CBE
  const updateRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/admin/payment-accounts/${cbeId}`, method: 'PUT',
    headers: { Authorization: `Bearer ${token}` }
  }, {
    accountName: 'Amanuel Updated'
  });
  assert(updateRes.statusCode === 200, `Update CBE failed: ${JSON.stringify(updateRes.body)}`);
  assert(updateRes.body.data.accountName === 'Amanuel Updated', 'Account name must be updated');
  console.log('   ✅ Update operation works!');

  // Prepare a test player
  console.log('👤 Preparing test player...');
  const existingPlayer = await prisma.player.findFirst({
    where: { OR: [{ telegramId: 'test_payment_player' }, { phoneNumber: '+251999999999' }] }
  });

  if (existingPlayer) {
    const pid = existingPlayer.id;
    await prisma.gameWinner.deleteMany({ where: { playerId: pid } });
    await prisma.bingoCard.deleteMany({ where: { playerId: pid } });
    await prisma.gameSession.deleteMany({ where: { playerId: pid } });
    await prisma.transaction.deleteMany({ where: { playerId: pid } });
    await prisma.pendingRequest.deleteMany({ where: { playerId: pid } });
    await prisma.player.delete({ where: { id: pid } });
  }

  const player = await prisma.player.create({
    data: {
      telegramId: 'test_payment_player',
      firstName: 'Efrata',
      phoneNumber: '+251999999999',
      balance: 100,
    },
  });

  // Verify /api/bot/payment-accounts
  console.log('🤖 Verifying bot endpoints...');
  const botAccs = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/bot/payment-accounts', method: 'GET'
  });
  assert(botAccs.statusCode === 200, `Bot payment methods failed`);
  assert(botAccs.body.data.length >= 2, 'Must return active payment methods');

  // Verify /api/bot/settings
  const botSettings = await request({
    hostname: 'localhost', port: 3000,
    path: '/api/bot/settings', method: 'GET'
  });
  assert(botSettings.statusCode === 200, `Bot settings failed`);
  assert(botSettings.body.supportUsername === '@REDBINGOTESTSUPPORT', 'Must return custom supportUsername');

  // Verify /balance command output formatting
  console.log('💳 Testing /balance command formatting...');
  const balanceRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/test_payment_player/balance`, method: 'GET'
  });
  assert(balanceRes.statusCode === 200, `Get balance failed`);
  const details = balanceRes.body;
  assert(details.balance === 100, 'Original balance should be 100');
  assert(details.availableBalance === 100, 'Available balance should be 100');
  assert(details.pendingBalance === 0, 'Pending balance should be 0');

  // Check Amharic and English balance card formatting
  const replacements = {
    fullName: escapeMarkdownV2(details.fullName || 'Efrata'),
    availableBalance: escapeMarkdownV2(Number(details.availableBalance).toFixed(2)),
    pendingBalance: escapeMarkdownV2(Number(details.pendingBalance).toFixed(2)),
    totalBalance: escapeMarkdownV2(Number(details.totalBalance).toFixed(2)),
  };

  const amBalanceMsg = escapeMarkdownV2(t('balance_card', 'am', replacements), true);
  assert(amBalanceMsg.includes('💳 *ያለዎት ቀሪ ሒሳብ*'), 'Must contain Amharic title');
  assert(amBalanceMsg.includes('> ማውጣት የሚቻል: 100\\.00 ETB'), 'Must contain formatted available balance');
  assert(amBalanceMsg.includes('> ማውጣት የማይቻል: 0\\.00 ETB'), 'Must contain formatted pending balance');
  assert(amBalanceMsg.includes('> ጠቅላላ ሒሳብ: 100\\.00 ETB'), 'Must contain formatted total balance');
  console.log('   ✅ Amharic /balance output formatted correctly:');
  console.log(amBalanceMsg);

  // Test deposit SMS submission
  console.log('💵 Testing deposit flow...');
  const smsText = 'CBE Birr: You have received 200.00 ETB from John. Txn ID: FT260714.';
  const depositRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/test_payment_player/deposit`, method: 'POST'
  }, {
    amount: 0,
    method: 'TEST_CBE',
    smsProof: smsText
  });
  assert(depositRes.statusCode === 201, `Deposit submission failed: ${JSON.stringify(depositRes.body)}`);
  
  const pendingDepositReq = await prisma.pendingRequest.findFirst({
    where: { playerId: player.id, type: 'deposit', status: 'pending' }
  });
  assert(pendingDepositReq !== null, 'Pending deposit request must be created in DB');
  assert(pendingDepositReq.smsProof === smsText, 'SMS proof text must be stored in database');
  assert(pendingDepositReq.method === 'TEST_CBE', 'Selected payment method must be saved');

  const pendingDepositTx = await prisma.transaction.findFirst({
    where: { playerId: player.id, type: 'deposit', status: 'pending', pendingRequestId: pendingDepositReq.id }
  });
  assert(pendingDepositTx !== null, 'Pending deposit transaction must be created and linked');
  assert(pendingDepositTx.smsProof === smsText, 'Transaction must store SMS proof');
  console.log('   ✅ Pending deposit request and transaction successfully created in DB!');

  // Test withdrawal flow
  console.log('🏧 Testing withdrawal flow...');
  
  // 1. Rejection test: insufficient balance (withdrawing 150 when available is 100)
  const withdrawRejectRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/test_payment_player/withdrawal`, method: 'POST'
  }, {
    amount: 150.00,
    method: 'TEST_TELEBIRR'
  });
  assert(withdrawRejectRes.statusCode === 400, 'Withdrawal request of 150 must be rejected');
  assert(withdrawRejectRes.body.message.includes('Insufficient balance'), 'Must reject with insufficient balance message');
  
  const amRejectionMsg = escapeMarkdownV2(t('withdrawal_insufficient_balance', 'am', {
    requestedAmount: escapeMarkdownV2((150.00).toFixed(2)),
    availableBalance: escapeMarkdownV2((100.00).toFixed(2))
  }), true);
  assert(amRejectionMsg.includes('ገንዘብ ማውጣት አይቻልም'), 'Must contain Amharic header');
  assert(amRejectionMsg.includes('`150\\.00 ETB`'), 'Must display requested amount in monospace');
  assert(amRejectionMsg.includes('`100\\.00 ETB`'), 'Must display available balance in monospace');
  console.log('   ✅ Rejection message formatted correctly:');
  console.log(amRejectionMsg);

  // 2. Successful withdrawal request (withdrawing 40 when available is 100)
  const withdrawSuccessRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/test_payment_player/withdrawal`, method: 'POST'
  }, {
    amount: 40.00,
    method: 'TEST_TELEBIRR'
  });
  assert(withdrawSuccessRes.statusCode === 201, `Withdrawal request failed: ${JSON.stringify(withdrawSuccessRes.body)}`);
  
  const pendingWithdrawReq = await prisma.pendingRequest.findFirst({
    where: { playerId: player.id, type: 'withdrawal', status: 'pending' }
  });
  assert(pendingWithdrawReq !== null, 'Pending withdrawal request must exist in DB');
  assert(pendingWithdrawReq.amount === 40.00, 'Withdrawal amount must be 40');
  assert(pendingWithdrawReq.method === 'TEST_TELEBIRR', 'Withdrawal method must be TEST_TELEBIRR');

  // Verify balance recalculation with pending withdrawal
  console.log('📊 Verifying balance recalculation with pending withdrawal...');
  const balanceAfterWithdrawRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/bot/test_payment_player/balance`, method: 'GET'
  });
  const balanceAfter = balanceAfterWithdrawRes.body;
  assert(balanceAfter.balance === 100, 'Current account balance remains 100 until approved');
  assert(balanceAfter.availableBalance === 60, 'Available balance drops to 60 because of the 40 ETB pending withdrawal');
  assert(balanceAfter.pendingBalance === 40, 'Pending balance matches 40 ETB pending withdrawal');
  assert(balanceAfter.totalBalance === 100, 'Total balance is available + pending = 100');
  console.log('   ✅ Balance components computed correctly: available=60, pending=40, total=100');

  // Test admin approvals/rejections and transaction updates
  console.log('🏛️ Testing manual approvals...');
  
  // 1. Approve withdrawal request of 40.00
  const approveWithdrawRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/pending/${pendingWithdrawReq.id}/approve`, method: 'PUT',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert(approveWithdrawRes.statusCode === 200, `Approve withdrawal failed: ${JSON.stringify(approveWithdrawRes.body)}`);

  // Verify database: player balance decremented
  const updatedPlayer1 = await prisma.player.findUnique({ where: { id: player.id } });
  assert(updatedPlayer1.balance === 60, 'Player balance must be updated to 60 after approval');

  // Verify database: withdrawal transaction status updated to completed
  const completedWithdrawTx = await prisma.transaction.findFirst({
    where: { pendingRequestId: pendingWithdrawReq.id }
  });
  assert(completedWithdrawTx.status === 'completed', 'Withdrawal transaction must be completed');
  assert(completedWithdrawTx.balanceAfter === 60, 'Transaction balanceAfter must be 60');
  console.log('   ✅ Withdrawal successfully approved. Player balance decremented, audit transaction marked completed.');

  // 2. Approve deposit request (override amount to 150.00)
  const approveDepositRes = await request({
    hostname: 'localhost', port: 3000,
    path: `/api/pending/${pendingDepositReq.id}/approve`, method: 'PUT',
    headers: { Authorization: `Bearer ${token}` }
  }, {
    amount: 150.00
  });
  assert(approveDepositRes.statusCode === 200, `Approve deposit failed: ${JSON.stringify(approveDepositRes.body)}`);

  // Verify database: player balance incremented by 150 (60 + 150 = 210)
  const updatedPlayer2 = await prisma.player.findUnique({ where: { id: player.id } });
  assert(updatedPlayer2.balance === 210, 'Player balance must be updated to 210 after deposit approval');

  // Verify database: deposit transaction status updated to completed and amount updated to 150
  const completedDepositTx = await prisma.transaction.findFirst({
    where: { pendingRequestId: pendingDepositReq.id }
  });
  assert(completedDepositTx.status === 'completed', 'Deposit transaction must be completed');
  assert(completedDepositTx.amount === 150.00, 'Deposit transaction amount must be updated to 150');
  assert(completedDepositTx.balanceAfter === 210, 'Deposit transaction balanceAfter must be 210');
  console.log('   ✅ Deposit approved with override amount. Player balance incremented, audit transaction updated.');

  // Cleanup payment accounts
  await prisma.paymentAccount.delete({ where: { id: cbeId } });
  await prisma.paymentAccount.delete({ where: { id: teleId } });

  // Cleanup test transactions and requests
  await prisma.transaction.deleteMany({ where: { playerId: player.id } });
  await prisma.pendingRequest.deleteMany({ where: { playerId: player.id } });
  await prisma.player.delete({ where: { id: player.id } });

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  🎉  All payment flow checks passed!    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}

run()
  .catch(err => {
    console.error('❌ Verification script crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
