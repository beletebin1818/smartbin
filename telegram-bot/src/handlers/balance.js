/**
 * Handler for the /balance command.
 * Fetches the user's current balance from the backend API.
 */

'use strict';

const apiClient = require('../api/apiClient');
const { getLanguage } = require('./start');
const { t } = require('../utils/i18n');
const { escapeMarkdownV2 } = require('../utils/markdown');

async function handleBalance(ctx) {
  try {
    const telegramId = String(ctx.from.id);
    const lang = getLanguage(ctx);

    // Fetch general player balance info (for pendingBalance and fullName)
    const res = await apiClient.getPlayerBalance(telegramId);

    // Reuse the exact same withdrawable-balance calculation used by /withdrawal
    // by calling the existing backend endpoint via the API client.
    const w = await apiClient.getWithdrawableBalance(telegramId);

    // Total balance in the database (admin page balance)
    const dbBalance = Number(res.balance || 0);
    
    // Raw withdrawable amount based on winnings
    const rawWithdrawable = Number(w.withdrawableBalance || 0);

    // Withdrawable cannot exceed the total balance
    const withdrawable = Math.min(dbBalance, rawWithdrawable);
    
    // Non-withdrawable is whatever is left (e.g. deposited funds)
    const nonWithdrawable = dbBalance - withdrawable;

    // Format variables and escape them for MarkdownV2
    const replacements = {
      fullName: escapeMarkdownV2(res.fullName || ''),
      availableBalance: escapeMarkdownV2(withdrawable.toFixed(2)),
      pendingBalance: escapeMarkdownV2(nonWithdrawable.toFixed(2)),
      totalBalance: escapeMarkdownV2(dbBalance.toFixed(2)),
    };

    // Get the localized message template with replaced variables
    const template = t('balance_card', lang, replacements);

    // Escape final message keeping blockquotes, bolding, and monospace backticks
    const finalMessage = escapeMarkdownV2(template, true);

    return ctx.reply(finalMessage, { parse_mode: 'MarkdownV2' });
  } catch (err) {
    const lang = getLanguage(ctx);
    if (err.message && err.message.includes('suspended')) {
      return ctx.reply(t('account_suspended', lang));
    }
    // If not registered, prompt registration
    return ctx.reply(t('error_not_registered', lang));
  }
}

module.exports = { handleBalance };
