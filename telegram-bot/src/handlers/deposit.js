/**
 * Handler for the /deposit command.
 * Flow: Select Method → Select Account → Paste SMS → Auto-extract amount → Submit
 * Amount is extracted from SMS automatically — user never types an amount.
 */

'use strict';

const { Markup } = require('telegraf');
const { getLanguage, getMenuKeyboard } = require('./start');
const { t } = require('../utils/i18n');
const apiClient = require('../api/apiClient');
const { escapeMarkdownV2 } = require('../utils/markdown');

// ─── Parse amount from SMS text ──────────────────────────────────────────────
function extractAmountFromSMS(text) {
  if (!text) return null;

  // 1. Specific transfer pattern (CBE & TeleBirr): "transferred ETB 588.00", "transferred ETB1624.00", "transferred 500 ETB"
  const transferredMatch = text.match(/transferred\s+(?:ETB\s*)?([\d,]+(?:\.\d+)?)/i);
  if (transferredMatch) return parseFloat(transferredMatch[1].replace(/,/g, ''));

  // 2. TeleBirr / Generic fallbacks: "ETB 500.00", "500.00 ETB", "Birr 500"
  const telebirrMatch =
    text.match(/ETB\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/([\d,]+(?:\.\d+)?)\s*ETB/i) ||
    text.match(/Birr\s*([\d,]+(?:\.\d+)?)/i);
  if (telebirrMatch) return parseFloat(telebirrMatch[1].replace(/,/g, ''));

  return null;
}

// ─── Parse receipt URL from SMS ───────────────────────────────────────────────
function parseReceiptLink(text) {
  if (!text || typeof text !== 'string') return null;

  const patterns = [
    { method: 'CBE',      regex: /(https:\/\/mbreciept\.cbe\.com\.et\/[^\s]+)/i },
    { method: 'TeleBirr', regex: /(https:\/\/transactioninfo\.ethiotelecom\.et\/receipt\/[^\s]+)/i },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match && match[1]) {
      const cleanUrl = match[1].replace(/[.,);]+$/, '');
      return { receiptUrl: cleanUrl, receiptMethod: pattern.method };
    }
  }
  return null;
}

// ─── Step 1: Show payment method buttons ─────────────────────────────────────
async function handleDepositPrompt(ctx, userStates) {
  try {
    const lang = getLanguage(ctx);
    const telegramId = String(ctx.from.id);

    // Check if user already has a pending deposit request
    const pendingRes = await apiClient.checkPendingDeposit(telegramId);
    if (pendingRes && pendingRes.hasPending) {
      return ctx.reply('የላኩት መልስ እስኪያገኝ ይጠበቁ።');
    }

    const res = await apiClient.getAgentBankAccounts(telegramId);
    const accounts = res.data || [];

    if (accounts.length === 0) {
      return ctx.reply(t('error_no_payment_methods', lang));
    }

    const accountsByMethod = {};
    accounts.forEach(acc => {
      if (!accountsByMethod[acc.method]) accountsByMethod[acc.method] = [];
      accountsByMethod[acc.method].push(acc);
    });

    userStates.set(telegramId, { action: 'selecting_deposit_method', accountsByMethod });

    const buttons = Object.keys(accountsByMethod).map(method => [
      Markup.button.callback(method, `deposit_method:${method}`)
    ]);

    return ctx.reply(t('deposit_select_method', lang), Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error('[DEPO] Error in deposit prompt:', err);
    return ctx.reply(t('error_deposit_process_failed', getLanguage(ctx)));
  }
}

// ─── Step 2: Show accounts for selected method ───────────────────────────────
async function handleDepositMethodSelection(ctx, userStates, method) {
  try {
    const lang = getLanguage(ctx);
    const telegramId = String(ctx.from.id);
    const state = userStates.get(telegramId);

    if (!state || state.action !== 'selecting_deposit_method') {
      return ctx.answerCbQuery(t('error_session_expired_deposit', lang));
    }

    const accounts = state.accountsByMethod[method] || [];
    if (accounts.length === 0) {
      return ctx.reply(t('error_payment_method_not_found', lang));
    }

    const defaultAccount = accounts[0];

    userStates.set(telegramId, {
      action: 'selecting_deposit_account',
      method,
      accounts,
    });

    return handleDepositAccountSelection(ctx, userStates, defaultAccount.id);
  } catch (err) {
    console.error('Error handling deposit method selection:', err);
    return ctx.reply(t('error_deposit_process_failed', getLanguage(ctx)));
  }
}

// ─── Step 3: Account selected → ask for SMS directly (NO amount step) ────────
async function handleDepositAccountSelection(ctx, userStates, accountId) {
  try {
    const lang = getLanguage(ctx);
    const telegramId = String(ctx.from.id);
    const state = userStates.get(telegramId);

    if (!state || state.action !== 'selecting_deposit_account') {
      return ctx.answerCbQuery(t('error_session_expired_deposit', lang));
    }

    const account = state.accounts.find(acc => acc.id === parseInt(accountId));
    if (!account) {
      return ctx.reply(t('error_payment_method_not_found', lang));
    }

    const resSettings = await apiClient.getSettings();
    const supportUsername = resSettings.supportUsername || '@REDBINGOSUPPORT';

    // Jump directly to waiting for SMS — no amount step
    userStates.set(telegramId, {
      action: 'waiting_for_deposit_sms',
      method: state.method,
      accountId: account.id,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
    });

    // Show bank info and immediately ask for SMS
    const methodEsc   = escapeMarkdownV2(state.method);
    const nameEsc     = escapeMarkdownV2(account.accountName);
    const numberEsc   = escapeMarkdownV2(account.accountNumber);
    const supportEsc  = escapeMarkdownV2(supportUsername);

    const message = lang === 'am'
      ? `🏦 *${methodEsc} አካውንት*\n\n` +
        `👤 *ስም:* ${nameEsc}\n` +
        `🔢 *አካውንት ቁጥር:* ${numberEsc}\n\n` +
        `📋 *መመሪያ:*\n` +
        `1\\. ከላይ ባለው አካውንት ላይ ገንዘቡን ይላኩ\\.\n` +
        `2\\. ብሩን ሲልኩ ከባንኩ የሚደርስዎን ሙሉ SMS ጽሑፍ ቁጥቅ ይድርጉ\\.\n` +
        `3\\. አሁን ከታቹ ባለው ቦታ ላይ ያለጥፉ \\(paste\\) ያድርጉ\\.\n\n` +
        `📩 *እባክዎን የደረሰዎትን ሙሉ SMS መልዕክት ይለጥፉ\\!*\n\n` +
        `_የምዝናዎ ጥያቄ ካለ ${supportEsc} ያግኙን_`
      : `🏦 *${methodEsc} Account*\n\n` +
        `👤 *Name:* ${nameEsc}\n` +
        `🔢 *Account:* ${numberEsc}\n\n` +
        `📋 *Instructions:*\n` +
        `1\\. Send money to the account above\\.\n` +
        `2\\. After sending, copy the full SMS you received from the bank\\.\n` +
        `3\\. Paste it below\\.\n\n` +
        `📩 *Paste your full SMS message now\\!*\n\n` +
        `_Contact ${supportEsc} for support_`;

    return ctx.reply(message, { parse_mode: 'MarkdownV2' });
  } catch (err) {
    console.error('Error handling deposit account selection:', err);
    return ctx.reply(t('error_deposit_process_failed', getLanguage(ctx)));
  }
}

// ─── Step 4: SMS received → extract amount and submit ────────────────────────
async function handleDepositSmsProof(ctx, userStates, state) {
  try {
    const lang = getLanguage(ctx);
    const telegramId = String(ctx.from.id);
    const smsProofText = ctx.message.text;

    // Auto-extract amount from SMS
    const extractedAmount = extractAmountFromSMS(smsProofText);

    if (!extractedAmount || extractedAmount <= 0) {
      const errMsg = lang === 'am'
        ? '❌ SMS ውስጥ የገንዘብ መጠን ማግኘት አልተቻለም።\n\nእባክዎ ከ CBE ወይም TeleBirr የደረሰዎትን ሙሉ SMS ጽሑፍ ይለጥፉ።\n\nለምሳሌ:\n"Dear Efrata... You have successfully transferred ETB1624.00..."'
        : '❌ Could not find an amount in your SMS.\n\nPlease paste the complete SMS you received from CBE or TeleBirr.\n\nExample:\n"Dear ... You have successfully transferred ETB1624.00..."';
      return ctx.reply(errMsg);
    }

    // Try to parse a receipt link from the SMS
    const receipt = parseReceiptLink(smsProofText);
    const normalizedSelectedMethod = String(state.method || '').trim().toLowerCase();
    const normalizedReceiptMethod  = String(receipt?.receiptMethod || '').trim().toLowerCase();
    const receiptMethodMismatch    = receipt ? (normalizedSelectedMethod !== normalizedReceiptMethod) : false;

    try {
      await apiClient.requestDeposit(telegramId, {
        amount: extractedAmount,
        method: state.method,
        smsProof: smsProofText,
        receiptUrl: receipt?.receiptUrl || null,
        receiptMethod: receipt?.receiptMethod || null,
        receiptMethodMismatch,
      });

      userStates.delete(telegramId);

      const successMsg = lang === 'am'
        ? `✅ ተቀማጭ ጥያቄዎ ተልኳል!\n\n💰 መጠን: *${extractedAmount} ETB*\n\nአስኪያጁ ሲያፀድቅ ሂሳብዎ ይዘምናል።`
        : `✅ Deposit request submitted!\n\n💰 Amount: *${extractedAmount} ETB*\n\nYour balance will update once the agent approves.`;

      return ctx.reply(successMsg, { parse_mode: 'Markdown', ...getMenuKeyboard(lang) });
    } catch (apiErr) {
      console.error('Error submitting deposit:', apiErr);
      const errMsg = apiErr?.response?.data?.message || apiErr?.message;
      if (errMsg && (errMsg.includes('የላኩት መልስ እስኪያገኝ ይጠበቁ') || apiErr?.response?.status === 409)) {
        userStates.delete(telegramId);
        return ctx.reply('የላኩት መልስ እስኪያገኝ ይጠበቁ።');
      }
      if (errMsg && errMsg.includes('already been submitted')) {
        return ctx.reply(
          lang === 'am'
            ? '⚠️ ይህ ደረሰኝ ቀደም ብሎ ቀርቧል። ሌላ ደረሰኝ ይጠቀሙ።'
            : '⚠️ This receipt has already been submitted. Please use a different receipt.',
          getMenuKeyboard(lang)
        );
      }
      return ctx.reply(t('error_sms_submit_failed', lang));
    }
  } catch (err) {
    console.error('Error handling SMS proof:', err);
    return ctx.reply(t('error_sms_submit_failed', getLanguage(ctx)));
  }
}

// Keep for backward compat (no longer used in flow but exported)
async function handleDepositAmountInput(ctx, userStates, amount, state) {
  // This step is now skipped — amount comes from SMS
  return handleDepositSmsProof(ctx, userStates, state);
}

module.exports = {
  handleDepositPrompt,
  handleDepositMethodSelection,
  handleDepositAccountSelection,
  handleDepositAmountInput,
  handleDepositSmsProof,
};
