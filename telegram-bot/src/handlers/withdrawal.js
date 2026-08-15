/**
 * Handler for the /withdrawal command.
 * Manages the withdrawal amount prompt, balance check, rejection templates,
 * bank selection buttons, and request submission.
 * Uses agent-specific bank accounts.
 */

'use strict';

const { Markup } = require('telegraf');
const { getLanguage, getMenuKeyboard } = require('./start');
const { t } = require('../utils/i18n');
const apiClient = require('../api/apiClient');

function normalizeMethodName(method) {
  if (!method) return 'CBE';
  const str = String(method).trim();
  const lower = str.toLowerCase();
  if (lower.includes('tele')) return 'TeleBirr';
  if (lower.includes('cbe')) return 'CBE';
  return str;
}

async function handleWithdrawalPrompt(ctx, userStates) {
  const telegramId = String(ctx.from.id);
  const lang = getLanguage(ctx);

  try {
    // Fetch the live withdrawable balance (winnings only) from backend
    const res = await apiClient.getWithdrawableBalance(telegramId);
    const withdrawable = Number(res.withdrawableBalance || 0);
    const formatted = withdrawable.toFixed(2);

    // Check for pending withdrawal before starting the flow
    const pendingCheck = await apiClient.checkPendingWithdrawal(telegramId);
    if (pendingCheck.hasPending) {
      const pendingMsg = t('withdrawal_has_pending', lang, {
        amount: pendingCheck.amount.toFixed(2),
        submittedAt: pendingCheck.submittedAt,
      });
      return ctx.reply(pendingMsg, getMenuKeyboard(lang));
    }

    // If below minimum threshold, reply with the exact rejection template and STOP
    if (withdrawable < 100) {
      const msg = t('withdrawal_insufficient_balance', lang, { withdrawableBalance: formatted });
      return ctx.reply(msg);
    }

    // Otherwise prompt user to enter the amount
    userStates.set(telegramId, { action: 'waiting_for_withdrawal_amount' });
    return ctx.reply(t('withdrawal_enter_amount', lang));
  } catch (err) {
    console.error('Error fetching withdrawable balance:', err);
    return ctx.reply(t('error_withdrawal_process_failed', getLanguage(ctx)), getMenuKeyboard(getLanguage(ctx)));
  }
}

async function handleWithdrawalAmountInput(ctx, userStates, amount) {
  const lang = getLanguage(ctx);
  const telegramId = String(ctx.from.id);

  try {
    // Always re-fetch the real withdrawable balance live from backend
    const res = await apiClient.getWithdrawableBalance(telegramId);
    const withdrawable = Number(res.withdrawableBalance || 0);
    const formattedWithdrawable = withdrawable.toFixed(2);
    const formattedRequested = Number(amount).toFixed(2);

    // Validate requested amount: must be >=100 and <= withdrawable
    if (amount < 100 || amount > withdrawable) {
      const baseMsg = t('withdrawal_insufficient_balance', lang, { withdrawableBalance: formattedWithdrawable });
      const requestedLine = `\nየተጠየቀ መጠን: \`${formattedRequested} ETB\``;
      const finalMsg = `${baseMsg}${requestedLine}\n\n${t('withdrawal_enter_amount', lang)}`;

      userStates.set(telegramId, { action: 'waiting_for_withdrawal_amount' });
      return ctx.reply(finalMsg);
    }

    // Fetch agent bank accounts for this player
    const resAccounts = await apiClient.getAgentBankAccounts(telegramId);
    const accounts = resAccounts.data || [];

    if (accounts.length === 0) {
      userStates.delete(telegramId);
      return ctx.reply(t('error_no_payment_methods', lang), getMenuKeyboard(lang));
    }

    // Group accounts by normalized method to deduplicate buttons (e.g. Telebirr vs TeleBirr)
    const accountsByMethod = {};
    accounts.forEach(acc => {
      const normMethod = normalizeMethodName(acc.method);
      if (!accountsByMethod[normMethod]) {
        accountsByMethod[normMethod] = [];
      }
      accountsByMethod[normMethod].push(acc);
    });

    // Generate buttons for each unique provider
    const buttons = Object.keys(accountsByMethod).map(method => [
      Markup.button.callback(method, `withdrawal_method:${method}`)
    ]);

    // Save state with grouped accounts
    userStates.set(telegramId, {
      action: 'selecting_withdrawal_method',
      amount: Number(amount),
      accountsByMethod
    });

    return ctx.reply(t('withdrawal_select_method', lang), Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error('Error handling withdrawal amount input:', err);
    userStates.delete(telegramId);
    return ctx.reply(t('error_withdrawal_process_failed', getLanguage(ctx)), getMenuKeyboard(getLanguage(ctx)));
  }
}

async function handleWithdrawalMethodSelection(ctx, userStates, method) {
  try {
    const lang = getLanguage(ctx);
    const telegramId = String(ctx.from.id);
    const state = userStates.get(telegramId);

    if (!state || state.action !== 'selecting_withdrawal_method') {
      return ctx.answerCbQuery(t('error_session_expired_withdrawal', getLanguage(ctx)));
    }

    const normMethod = normalizeMethodName(method);
    const accounts = state.accountsByMethod[normMethod] || state.accountsByMethod[method] || [];

    if (accounts.length === 0 && Object.keys(state.accountsByMethod || {}).length === 0) {
      userStates.delete(telegramId);
      return ctx.reply(t('error_payment_method_not_found', lang), getMenuKeyboard(lang));
    }

    // Instead of submitting immediately, we prompt for player's account details
    userStates.set(telegramId, {
      action: 'waiting_for_withdrawal_account_number',
      amount: state.amount,
      method: normMethod
    });

    if (normMethod === 'TeleBirr') {
      return ctx.reply('እባክዎ የቴሌብር ስልክ ቁጥርዎን ያስገቡ።');
    } else {
      return ctx.reply('እባክዎ የCBE አካውንት ቁጥርዎን ያስገቡ።');
    }
  } catch (err) {
    console.error('Error handling withdrawal method callback:', err);
    userStates.delete(String(ctx.from.id));
    return ctx.reply(t('error_withdrawal_submit_failed', getLanguage(ctx)), getMenuKeyboard(getLanguage(ctx)));
  }
}

async function handleWithdrawalAccountNumberInput(ctx, userStates, accountNumber) {
  const telegramId = String(ctx.from.id);
  const state = userStates.get(telegramId);
  const lang = getLanguage(ctx);

  if (!accountNumber || accountNumber.trim() === '') {
    const normMethod = normalizeMethodName(state?.method);
    if (normMethod === 'TeleBirr') {
      return ctx.reply('❌ እባክዎ ትክክለኛ የቴሌብር ስልክ ቁጥር ያስገቡ።');
    }
    return ctx.reply('❌ እባክዎ ትክክለኛ የCBE አካውንት ቁጥር ያስገቡ።');
  }

  userStates.set(telegramId, {
    action: 'waiting_for_withdrawal_account_holder',
    amount: state.amount,
    method: state.method,
    accountNumber: accountNumber.trim()
  });

  return ctx.reply('እባክዎ የአካውንቱን ባለቤት ሙሉ ስም ያስገቡ።');
}

async function handleWithdrawalAccountHolderInput(ctx, userStates, accountHolder) {
  const telegramId = String(ctx.from.id);
  const state = userStates.get(telegramId);
  const lang = getLanguage(ctx);

  if (!accountHolder || accountHolder.trim() === '') {
    return ctx.reply('❌ እባክዎ ትክክለኛ ስም ያስገቡ።');
  }

  try {
    await apiClient.requestWithdrawal(telegramId, {
      amount: state.amount,
      method: state.method,
      accountNumber: state.accountNumber,
      accountHolder: accountHolder.trim()
    });

    userStates.delete(telegramId);
    return ctx.reply('የገንዘብ ማውጣት ጥያቄዎ ተቀብለናል። በቅርቡ በወኪላችን ታይቶ ምላሽ ይሰጠዋል።', getMenuKeyboard(lang));
  } catch (apiErr) {
    if (apiErr.status === 409 || (apiErr.data && apiErr.data.hasPendingWithdrawal)) {
      const errorMsg = apiErr.message || 'የታመነ የዕድል መወድድ ታሪክ አለ። እባክዎ የቆየውን ዓውሃድ ያስገድግደው ወይም አንድ ሰው ማንበኛዎች ያነጋግሩ።';
      userStates.delete(telegramId);
      return ctx.reply(errorMsg, getMenuKeyboard(lang));
    }
    console.error('Error submitting withdrawal:', apiErr);
    userStates.delete(telegramId);
    return ctx.reply(t('error_withdrawal_submit_failed', lang), getMenuKeyboard(lang));
  }
}

module.exports = {
  handleWithdrawalPrompt,
  handleWithdrawalAmountInput,
  handleWithdrawalMethodSelection,
  handleWithdrawalAccountNumberInput,
  handleWithdrawalAccountHolderInput,
};
