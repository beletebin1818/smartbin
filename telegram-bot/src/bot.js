/**
 * Red Bingos Telegram Bot Entry Point
 * Handles player registration, command buttons, contact sharing,
 * and pending deposit/withdrawal requests.
 */

'use strict';

require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { t } = require('./utils/i18n');
const apiClient = require('./api/apiClient');

const { handleStart, getMenuKeyboard, getLanguage } = require('./handlers/start');
const { handlePlay } = require('./handlers/play');
const { handleBalance } = require('./handlers/balance');
const { handleDepositPrompt, handleDepositMethodSelection, handleDepositAccountSelection, handleDepositAmountInput, handleDepositSmsProof } = require('./handlers/deposit');
const { 
  handleWithdrawalPrompt, 
  handleWithdrawalAmountInput, 
  handleWithdrawalMethodSelection,
  handleWithdrawalAccountNumberInput,
  handleWithdrawalAccountHolderInput
} = require('./handlers/withdrawal');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.warn('⚠️ BOT_TOKEN is not defined in .env. Bot service running in idle/dry-run mode.');
}

const bot = new Telegraf(BOT_TOKEN || 'placeholder_token');

// Map to store temporary conversational states for users
// Key: telegramId (string), Value: { action: string }
const userStates = new Map();

// Localized helper prompt messages for conversational flows
const conversationPrompts = {
  am: {
    invalid_amount: "❌ ትክክለኛ የገንዘብ መጠን ያስገቡ። ለማቋረጥ /cancel ብለው ይጻፉ።",
    cancel_success: "✅ ጥያቄዎ ተሰርዟል።",
    help: "💡 ትዕዛዞች:\n/play - 🎮 መጫወት\n/balance - 💰 ሂሳብ ማየት\n/deposit - 💵 ተቀማጭ ጥያቄ\n/withdrawal - 🏧 ወጪ ጥያቄ\n/cancel - ❌ መሰረዝ",
  },
  en: {
    invalid_amount: "❌ Please enter a valid positive number. Type /cancel to abort.",
    cancel_success: "✅ Request cancelled successfully.",
    help: "💡 Commands:\n/play - 🎮 Play Game\n/balance - 💰 View Balance\n/deposit - 💵 Deposit Request\n/withdrawal - 🏧 Withdraw Request\n/cancel - ❌ Cancel Current Flow",
  }
};

// ── Persistent Commands List ─────────────────────────────────────────────
const botCommands = [
  { command: 'play', description: '🎮 Play Game' },
  { command: 'balance', description: '💰 Balance (ቀሪ ሂሳብ)' },
  { command: 'deposit', description: '💵 Deposit (ገንዘብ ለማስገባት)' },
  { command: 'withdrawal', description: '🏧 Withdrawal (ገንዘብ ወጪ)' },
];

// ── Commands Handlers ────────────────────────────────────────────────────
bot.start((ctx) => {
  userStates.delete(String(ctx.from.id));
  return handleStart(ctx);
});

bot.command('play', (ctx) => {
  userStates.delete(String(ctx.from.id));
  return handlePlay(ctx);
});

bot.command('balance', (ctx) => {
  userStates.delete(String(ctx.from.id));
  return handleBalance(ctx);
});

bot.command('deposit', (ctx) => {
  return handleDepositPrompt(ctx, userStates);
});

bot.command('withdrawal', (ctx) => {
  return handleWithdrawalPrompt(ctx, userStates);
});

bot.command('cancel', (ctx) => {
  const telegramId = String(ctx.from.id);
  const lang = getLanguage(ctx);
  userStates.delete(telegramId);
  return ctx.reply(conversationPrompts[lang].cancel_success, getMenuKeyboard(lang));
});

// ── Callback Query Action Listening (Handles inline payment buttons) ────
bot.action(/^deposit_method:(\w+)$/, async (ctx) => {
  try {
    const method = ctx.match[1];
    const telegramId = String(ctx.from.id);
    const state = userStates.get(telegramId);

    if (!state || state.action !== 'selecting_deposit_method') {
      return ctx.answerCbQuery(t('error_session_expired_deposit', getLanguage(ctx)));
    }

    await ctx.answerCbQuery();
    return handleDepositMethodSelection(ctx, userStates, method);
  } catch (err) {
    console.error('Error handling deposit method action:', err);
    return ctx.answerCbQuery('❌ Action failed.');
  }
});

bot.action(/^deposit_account:(\d+)$/, async (ctx) => {
  try {
    const accountId = ctx.match[1];
    const telegramId = String(ctx.from.id);
    const state = userStates.get(telegramId);

    if (!state || state.action !== 'selecting_deposit_account') {
      return ctx.answerCbQuery(t('error_session_expired_deposit', getLanguage(ctx)));
    }

    await ctx.answerCbQuery();
    return handleDepositAccountSelection(ctx, userStates, accountId);
  } catch (err) {
    console.error('Error handling deposit account action:', err);
    return ctx.answerCbQuery('❌ Action failed.');
  }
});

bot.action(/^withdrawal_method:(\w+)$/, async (ctx) => {
  try {
    const method = ctx.match[1];
    const telegramId = String(ctx.from.id);
    const state = userStates.get(telegramId);

    if (!state || state.action !== 'selecting_withdrawal_method') {
      return ctx.answerCbQuery(t('error_session_expired_withdrawal', getLanguage(ctx)));
    }

    await ctx.answerCbQuery();
    return handleWithdrawalMethodSelection(ctx, userStates, method);
  } catch (err) {
    console.error('Error handling withdrawal method action:', err);
    return ctx.answerCbQuery('❌ Action failed.');
  }
});

// ── Keyboard Text Listening (Handles custom keyboard tapping) ──────────
bot.hears(['🎮 Play Game', '🎮 ጨዋታ ጀምር', '🎮 ጨዋታ ለመጀመር'], (ctx) => {
  userStates.delete(String(ctx.from.id));
  return handlePlay(ctx);
});

bot.hears(['💰 Balance', '💰 ሂሳብ'], (ctx) => {
  userStates.delete(String(ctx.from.id));
  return handleBalance(ctx);
});

bot.hears(['💵 Deposit', '💵 ተቀማጭ', '💵 ገንዘብ ገቢ'], (ctx) => {
  return handleDepositPrompt(ctx, userStates);
});

bot.hears(['🏧 Withdraw', '🏧 ወጪ', '🏧 ገንዘብ ወጪ'], (ctx) => {
  return handleWithdrawalPrompt(ctx, userStates);
});

// ── Contact Sharing Handler (Registration flow) ──────────────────────────
bot.on('contact', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const lang = getLanguage(ctx);
    const contact = ctx.message.contact;

    // Verify contact matches current telegram sender ID to prevent spoofing
    if (String(contact.user_id) !== telegramId) {
      return ctx.reply(t('error_own_contact_only', getLanguage(ctx)));
    }

    // Call the backend registration API
    const res = await apiClient.registerPlayer({
      telegramId,
      phoneNumber: contact.phone_number,
      firstName: contact.first_name || ctx.from.first_name,
      lastName: contact.last_name || ctx.from.last_name,
    });

    if (res.isNew) {
      return ctx.reply(
        t('register_success', lang, { amount: res.bonus }),
        getMenuKeyboard(lang)
      );
    } else {
      return ctx.reply(
        t('already_registered', lang, { balance: res.data.balance }),
        getMenuKeyboard(lang)
      );
    }
  } catch (err) {
    console.error('Error during contact registration:', err);
    ctx.reply(t('error_registration_failed', getLanguage(ctx)));
  }
});

// ── Messages Handler (Conversational inputs for amounts) ─────────────────
bot.on('text', async (ctx) => {
  const telegramId = String(ctx.from.id);
  const lang = getLanguage(ctx);
  const state = userStates.get(telegramId);

  if (!state) {
    // Default reply if no active conversational flow exists
    return ctx.reply(conversationPrompts[lang].help, getMenuKeyboard(lang));
  }

  // 1. Handling deposit SMS proof (accepts raw text — amount auto-extracted)
  if (state.action === 'waiting_for_deposit_sms') {
    return handleDepositSmsProof(ctx, userStates, state);
  }

// 3. Handling withdrawal amount input
  if (state.action === 'waiting_for_withdrawal_amount') {
    const amount = parseFloat(ctx.message.text);
    if (Number.isNaN(amount) || amount <= 0) {
      return ctx.reply(conversationPrompts[lang].invalid_amount);
    }
    return handleWithdrawalAmountInput(ctx, userStates, amount);
  }

  // 4. Handling withdrawal account number input
  if (state.action === 'waiting_for_withdrawal_account_number') {
    return handleWithdrawalAccountNumberInput(ctx, userStates, ctx.message.text);
  }

  // 5. Handling withdrawal account holder input
  if (state.action === 'waiting_for_withdrawal_account_holder') {
    return handleWithdrawalAccountHolderInput(ctx, userStates, ctx.message.text);
  }

  // Default reply if state action is unrecognized or waiting for button selection
  return ctx.reply(conversationPrompts[lang].help, getMenuKeyboard(lang));
});

// ── Bot Launch ───────────────────────────────────────────────────────────
if (BOT_TOKEN && BOT_TOKEN !== 'placeholder_token') {
  // Register the bot's native command menu once when the bot starts.
  bot.telegram.setMyCommands(botCommands)
    .then(() => console.log('✅ Telegram command menu registered.'))
    .catch((err) => {
      console.error('❌ Failed to register Telegram command menu:', err.message);
    });

  console.log('🤖 Telegram Bot is running successfully...');
  console.log('📍 Bot Token:', BOT_TOKEN.substring(0, 10) + '...' + BOT_TOKEN.substring(BOT_TOKEN.length - 4));
  console.log('🔗 API Endpoint: https://api.telegram.org/bot' + BOT_TOKEN.substring(0, 10) + '...');

  // ── Polling with 409 Conflict retry ──────────────────────────────────────
  // Render rolling deploys start the new instance before killing the old one.
  // Telegram only allows ONE polling connection — the 409 Conflict error means
  // the old instance is still running. We wait and retry until it clears.
  async function startPollingWithRetry() {
    while (true) {
      try {
        await bot.startPolling({ dropPendingUpdates: false, allowedUpdates: undefined });
        break; // Polling ended cleanly (e.g. SIGTERM) — exit loop
      } catch (err) {
        if (err.response && err.response.error_code === 409) {
          console.warn('⚠️ 409 Conflict: another bot instance is still running. Retrying in 15s...');
          await new Promise((resolve) => setTimeout(resolve, 15000));
        } else {
          console.error('❌ Polling error:', err.message);
          throw err; // Re-throw non-409 errors so Render can restart
        }
      }
    }
  }

  startPollingWithRetry().catch((err) => {
    console.error('❌ Fatal polling error:', err.message);
    process.exit(1);
  });

} else {
  console.log('🤖 Telegram Bot running in Dry Run mode (no real Telegram connection).');
  console.log('⚠️  BOT_TOKEN is not set in .env file');
}


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ── Health check HTTP server ──────────────────────────────────────────────
// Render requires a Web Service to bind to a port. The bot uses long polling
// and doesn't need HTTP, but this tiny server satisfies Render's port scan.
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('🤖 Telegram Bot is running.\n');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Health server listening on port ${PORT}`);
});

module.exports = { bot };
