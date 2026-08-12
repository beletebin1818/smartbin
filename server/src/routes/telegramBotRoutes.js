/**
 * Telegram Bot API routes — player registrations, balance retrievals,
 * and deposit/withdrawal requests initiated via Telegram chat commands.
 */

'use strict';

const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');

router.post('/register', telegramController.registerPlayer);
router.get('/payment-accounts', telegramController.getPaymentAccounts);
router.get('/agent-bank-accounts/:telegramId', telegramController.getAgentBankAccounts);
router.get('/settings', telegramController.getSettings);
router.get('/:telegramId/balance', telegramController.getBalance);
router.get('/:telegramId/withdrawable-balance', telegramController.getWithdrawableBalance);
router.get('/:telegramId/pending-withdrawal', telegramController.checkPendingWithdrawal);
router.get('/:telegramId/pending-deposit', telegramController.checkPendingDeposit);
router.get('/:telegramId/profile', telegramController.getProfile);
router.post('/:telegramId/deposit', telegramController.requestDeposit);
router.post('/:telegramId/withdrawal', telegramController.requestWithdrawal);

module.exports = router;
