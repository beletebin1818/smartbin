/**
 * Handler for the /play command.
 *
 * Sends an INLINE keyboard with a web_app button.
 * This is the only button type that guarantees Telegram populates
 * initData / initDataUnsafe (and therefore telegramId) in a private chat.
 *
 * A reply-keyboard webApp button in a private chat does NOT send initData —
 * that is why telegramId was always null when using the menu keyboard.
 */

'use strict';

const { Markup } = require('telegraf');
const { getLanguage } = require('./start');

async function handlePlay(ctx) {
  const MINI_APP_URL = process.env.MINI_APP_URL;

  if (!MINI_APP_URL || !MINI_APP_URL.startsWith('https://')) {
    console.error(
      '[bot] MINI_APP_URL is missing or not HTTPS. ' +
      `Current value: "${MINI_APP_URL || '(unset)'}"`
    );
    return ctx.reply('⚠️ Mini App URL is not configured. Please contact support.');
  }

  // Inline keyboard — this ALWAYS sends signed initData to the Mini App
  return ctx.reply(
    '🎰 ጨዋታ ለመጫወት ይጫኑ:',
    Markup.inlineKeyboard([
      [Markup.button.webApp('🎮 Play Smart Bingo', MINI_APP_URL)],
    ])
  );
}

module.exports = { handlePlay };
