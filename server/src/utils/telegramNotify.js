/**
 * Telegram notification utility — pushes real-time messages to players via
 * the Telegram Bot HTTP API.
 *
 * Uses the same BOT_TOKEN as the Telegram Bot service (shared .env), so the
 * backend can notify a player directly (e.g. on deposit/withdrawal approval)
 * without duplicating bot logic or running a second bot instance.
 */

'use strict';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

/**
 * Send a plain text message to a player's Telegram chat.
 * Fails silently (logs a warning) so notification issues never break
 * the underlying approve/reject request flow.
 *
 * @param {string} telegramId - Telegram chat id of the player
 * @param {string} text       - message text to send
 */
async function sendTelegramMessage(telegramId, text) {
  if (!TELEGRAM_API || !telegramId) return;

  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`⚠️ Telegram sendMessage failed for ${telegramId}:`, data.description);
    }
  } catch (err) {
    console.error(`⚠️ Telegram sendMessage error for ${telegramId}:`, err.message);
  }
}

module.exports = { sendTelegramMessage };
