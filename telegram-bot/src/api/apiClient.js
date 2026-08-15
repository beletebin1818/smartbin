/**
 * Thin API client wrapper to communicate with the Red Bingos backend server.
 * Delegates all database and transaction state management to the existing backend API.
 */

'use strict';

const axios = require('axios');

const BACKEND_API_URL = (process.env.BACKEND_API_URL || 'http://localhost:3000').trim();

const client = axios.create({
  baseURL: BACKEND_API_URL,
  timeout: 5000,
});

/**
 * Register or find player by Telegram credentials and shared phone number contact
 */
async function registerPlayer({ telegramId, phoneNumber, firstName, lastName }) {
  try {
    const res = await client.post('/api/bot/register', {
      telegramId,
      phoneNumber,
      firstName,
      lastName,
    });
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Get player balance by Telegram ID (returns detailed balance components)
 */
async function getPlayerBalance(telegramId) {
  try {
    const res = await client.get(`/api/bot/${telegramId}/balance`);
    return res.data; // { success, balance, availableBalance, pendingBalance, totalBalance }
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Request deposit for player (supports raw SMS and selected method)
 */
async function requestDeposit(telegramId, { amount, method, smsProof, receiptUrl, receiptMethod, receiptMethodMismatch }) {
  try {
    const payload = { amount, method, smsProof };
    if (receiptUrl) payload.receiptUrl = receiptUrl;
    if (receiptMethod) payload.receiptMethod = receiptMethod;
    if (receiptMethodMismatch !== undefined) payload.receiptMethodMismatch = receiptMethodMismatch;

    // Use a 30s timeout for deposits: the verification service fetches an external
    // receipt URL (up to 15s) before responding. The global 5s default is too short
    // for Telebirr, causing the bot to show an error even when the deposit succeeds.
    const res = await client.post(`/api/bot/${telegramId}/deposit`, payload, { timeout: 30000 });
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Request withdrawal for player (supports method)
 */
async function requestWithdrawal(telegramId, { amount, method, accountNumber, accountHolder }) {
  try {
    const res = await client.post(`/api/bot/${telegramId}/withdrawal`, { amount, method, accountNumber, accountHolder });
    return res.data;
  } catch (err) {
    const error = new Error(err.response?.data?.message || err.message);
    error.status = err.response?.status;
    error.data = err.response?.data;
    throw error;
  }
}

/**
 * Get global payment accounts (legacy - kept for backward compatibility)
 */
async function getPaymentAccounts() {
  try {
    const res = await client.get('/api/bot/payment-accounts');
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Get agent bank accounts for a player (for deposit flow)
 */
async function getAgentBankAccounts(telegramId) {
  try {
    const res = await client.get(`/api/bot/agent-bank-accounts/${telegramId}`);
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Get global bot settings (e.g. supportUsername)
 */
async function getSettings() {
  try {
    const res = await client.get('/api/bot/settings');
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Get player's withdrawable balance (winnings only) by Telegram ID
 */
async function getWithdrawableBalance(telegramId) {
  try {
    const res = await client.get(`/api/bot/${telegramId}/withdrawable-balance`);
    return res.data; // { success, withdrawableBalance, totalWinnings, totalWithdrawn }
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Check if player has a pending withdrawal request
 */
async function checkPendingWithdrawal(telegramId) {
  try {
    const res = await client.get(`/api/bot/${telegramId}/pending-withdrawal`);
    return res.data; // { hasPending: true/false, amount: X, submittedAt: date }
  } catch (err) {
    // Don't throw on 404 - player may not exist yet
    if (err.response?.status === 404) {
      return { hasPending: false, amount: 0, submittedAt: null };
    }
    throw new Error(err.response?.data?.message || err.message);
  }
}

/**
 * Check if player has a pending deposit request
 */
async function checkPendingDeposit(telegramId) {
  try {
    const res = await client.get(`/api/bot/${telegramId}/pending-deposit`);
    return res.data; // { hasPending: true/false, amount: X, submittedAt: date }
  } catch (err) {
    // Don't throw on 404 - player may not exist yet
    if (err.response?.status === 404) {
      return { hasPending: false, amount: 0, submittedAt: null };
    }
    throw new Error(err.response?.data?.message || err.message);
  }
}

module.exports = {
  registerPlayer,
  getPlayerBalance,
  getWithdrawableBalance,
  checkPendingWithdrawal,
  checkPendingDeposit,
  requestDeposit,
  requestWithdrawal,
  getPaymentAccounts,
  getAgentBankAccounts,
  getSettings,
};
