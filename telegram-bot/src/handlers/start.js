/**
 * Handler for the /start command.
 * Welcomes the player, determines language, checks registration status,
 * and requests contact verification if not registered.
 */

'use strict';

const { Markup } = require('telegraf');
const { t } = require('../utils/i18n');
const apiClient = require('../api/apiClient');

function getLanguage(ctx) {
  // Always default to Amharic. This bot has no explicit player language
  // selection feature — ctx.from.language_code reflects the Telegram app UI
  // language (often 'en' even for Amharic-speaking users) and must NOT be
  // used to pick the bot reply language.
  return 'am';
}

/**
 * Returns the standard reply keyboard containing the persistent menu options.
 *
 * NOTE: The Play button here is a plain text button (not webApp) because
 * reply-keyboard webApp buttons in private chats do NOT send initData to the
 * Mini App — telegramId will always be null if opened that way.
 * Instead, tapping "Play Game" sends /play which replies with an INLINE
 * keyboard webApp button — that DOES send signed initData every time.
 */
function getMenuKeyboard(lang) {
  return Markup.keyboard([
    [t('play_button', lang)],
    [t('balance_button', lang), t('deposit_button', lang)],
    [t('withdrawal_button', lang)],
  ]).resize();
}

async function handleStart(ctx) {
  try {
    const telegramId = String(ctx.from.id);
    const lang = getLanguage(ctx);
    const firstName = ctx.from.first_name || '';

    // Check if player is already registered
    try {
      const res = await apiClient.getPlayerBalance(telegramId);
      // Already registered: skip registration and display menu
      return ctx.reply(
        t('already_registered', lang, { balance: res.balance }),
        getMenuKeyboard(lang)
      );
    } catch (err) {
      // Player does not exist, ask for contact registration
      const prompt = t('welcome', lang, { name: firstName });
      const contactBtn = Markup.keyboard([
        [Markup.button.contactRequest(t('share_contact', lang))]
      ]).oneTime().resize();

      return ctx.reply(prompt, contactBtn);
    }
  } catch (err) {
    console.error('Error in start handler:', err);
    ctx.reply(t('error_start_failed', getLanguage(ctx)));
  }
}

module.exports = {
  handleStart,
  getMenuKeyboard,
  getLanguage,
};
