/**
 * Hardcoded Bot Engine - Pure Ethiopian Time-Based Shift (No Player Count Logic)
 */

'use strict';

const prisma      = require('../utils/prisma');
const botService  = require('./botService');

// Server port (must match the running Express instance so HTTP claim calls work)
const PORT = parseInt(process.env.PORT) || 3000;

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a random integer in the inclusive range [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pure Ethiopian time-based bot config.
 * Ethiopia is UTC+3. No player-count checks. No database reads.
 */
function getEthiopianTimeConfig() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const ethiopianHour = (utcHour + 3) % 24;

  const isDaytime = ethiopianHour >= 6 && ethiopianHour < 16;

  if (isDaytime) {
    return {
      timePeriod: `Ken 6 Se'at - Mata 4 Se'at (Daytime) [ET=${ethiopianHour}:00]`,
      botMin: 30,
      botMax: 40,
    };
  }

  return {
    timePeriod: `Mata 4 Se'at - Tewaht Ken 6 Se'at (Nighttime) [ET=${ethiopianHour}:00]`,
    botMin: 70,
    botMax: 80,
  };
}

/**
 * Ensure a bot player has enough balance to purchase cards in a game.
 * Each bot is topped up to afford up to 4 cards (hardcoded max per bot).
 */
async function _ensureBotBalance(botId, gameId) {
  const [bot, game] = await Promise.all([
    prisma.player.findUnique({ where: { id: botId } }),
    prisma.game.findUnique({ where: { id: gameId } }),
  ]);

  if (!bot || !game) return;

  const maxNeeded = game.cardPrice * 4; // hardcoded max 4 cards per bot
  const shortfall = maxNeeded - bot.balance;

  if (shortfall > 0) {
    const topUp = Math.ceil(shortfall + game.cardPrice);
    await botService.creditBot(botId, topUp, `Auto top-up for game #${gameId} participation`);
    console.log(`🤖 [BotEngine] Bot #${botId} topped up by ${topUp} ETB for game #${gameId}`);
  }
}

/**
 * Execute a single bot joining a game:
 *   1. Verify game is still in 'waiting' status
 *   2. Ensure sufficient balance
 *   3. Claim 1-4 cards via the existing HTTP claim endpoint
 *   4. Emit bot:joined Socket.IO event
 *
 * Returns null silently if the game has already started or the bot cannot claim any card.
 *
 * @param {object} bot    - Player record (isBot=true)
 * @param {number} gameId
 * @param {object} io     - Socket.IO server instance
 * @returns {Promise<{bot: object, claimed: object[]}|null>}
 */
async function _joinBotToGame(bot, gameId, io, options = {}) {
  try {
    // Guard: only join if the game is still accepting cards
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game || game.status !== 'waiting') {
      console.log(
        `🤖 [BotEngine] Bot #${bot.id} (${bot.firstName}) skipped ` +
        `— game #${gameId} status is "${game ? game.status : 'not found'}"`,
      );
      return null;
    }

    // Ensure the bot can afford up to 4 cards
    await _ensureBotBalance(bot.id, gameId);

    // Claim 1-4 cards through the SAME endpoint used by real players
    const { claimed, skipped } = await botService.assignRandomCards(bot.id, gameId, {
      port: PORT,
      minCards: 1,
      maxCards: 4,
      fastClaim: options.fastClaim || false,
    });

    if (claimed.length === 0) {
      console.log(
        `🤖 [BotEngine] Bot #${bot.id} (${bot.firstName}) ` +
        `claimed 0 cards in game #${gameId} (skipped=${skipped})`,
      );
      return null;
    }

    console.log(
      `🤖 [BotEngine] Bot #${bot.id} (${bot.firstName}) joined game #${gameId} ` +
      `and claimed ${claimed.length} card(s): [${claimed.map((c) => c.cardNumber).join(', ')}]`,
    );

    // ── Emit bot:joined to the game room ─────────────────────────────────────
    io.to(`game_${gameId}`).emit('bot:joined', {
      botId:        bot.id,
      username:     bot.firstName,
      avatar:       bot.botAvatar,
      claimedCards: claimed.map((c) => c.cardNumber),
      isBot:        true,
    });

    return { bot, claimed };
  } catch (err) {
    console.error(
      `🤖 [BotEngine] Error joining bot #${bot.id} to game #${gameId}: ${err.message}`,
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate bot lobby population for a newly created game.
 *
 * This is a fire-and-forget async function — it is called without awaiting
 * from gameController so the HTTP response to the admin is not delayed.
 *
 * Flow:
 *   1. Get bot target from hardcoded Ethiopian time-based config
 *   2. Ensure the bot pool contains enough bots (create only the delta)
 *   3. Select a random subset of existing bots not already in this game
 *   4. Schedule each bot to join with a random delay [500ms, 5000ms]
 *
 * @param {number} gameId
 * @param {object} io - Socket.IO server instance
 */
const scheduledGames = new Set();

async function scheduleBotJoins(gameId, io) {
  try {
    if (scheduledGames.has(gameId)) {
      console.log(`🤖 [BotEngine] Game #${gameId} already has bot joins scheduled. Skipping.`);
      return;
    }
    scheduledGames.add(gameId);
    if (scheduledGames.size > 100) {
      const firstVal = scheduledGames.values().next().value;
      scheduledGames.delete(firstVal);
    }

    const [settings, game] = await Promise.all([
      prisma.gameSettings.findUnique({ where: { id: 1 } }),
      prisma.game.findUnique({ where: { id: gameId } }),
    ]);

    const botsEnabled = game?.botsEnabled ?? settings?.botsEnabled ?? true;
    if (!botsEnabled) {
      console.log(`🤖 [BotEngine] Game #${gameId}: bots are disabled in settings/game override`);
      return;
    }

    let target;
    let customDelays = false;
    let minDelay = 500;
    let maxDelay = 5000;

    const minBot = game?.minBotPlayers != null ? game.minBotPlayers : settings?.minBotPlayers;
    const maxBot = game?.maxBotPlayers != null ? game.maxBotPlayers : settings?.maxBotPlayers;

    if (minBot !== undefined && maxBot !== undefined && (minBot > 0 || maxBot > 0)) {
      target = _randInt(minBot, maxBot);
      customDelays = true;
      minDelay = game?.botJoinDelayMin ?? settings?.botJoinDelayMin ?? 100;
      maxDelay = game?.botJoinDelayMax ?? settings?.botJoinDelayMax ?? 500;
    } else {
      const timeConfig = getEthiopianTimeConfig();
      target = _randInt(timeConfig.botMin, timeConfig.botMax);
    }

    console.log(
      `🤖 [BotEngine] Game #${gameId}: bot target=${target}, customDelays=${customDelays}`,
    );

    if (target === 0) {
      console.log(
        `🤖 [BotEngine] Game #${gameId}: no bots needed`,
      );
      return;
    }

    const botsNeeded = target;

    // ── Ensure the bot pool is large enough ────────────────────────────────
    const poolResult = await botService.ensureBotPool(botsNeeded, {
      minBalance: 500,
      maxBalance: 3000,
    });

    console.log(
      `🤖 [BotEngine] Game #${gameId}: bot pool ready ` +
      `(existing=${poolResult.existing}, newly created=${poolResult.created.length}, total=${poolResult.total})`,
    );

    // ── Select candidates — exclude bots already in this game ─────────────
    const botsAlreadyIn = await prisma.gameSession.findMany({
      where: { gameId, player: { isBot: true } },
      select: { playerId: true },
    });
    const alreadyInIds = new Set(botsAlreadyIn.map((s) => s.playerId));

    const candidates = await prisma.player.findMany({
      where: { isBot: true, id: { notIn: Array.from(alreadyInIds) } },
      take: target,
    });

    if (candidates.length === 0) {
      console.log(`🤖 [BotEngine] Game #${gameId}: no eligible bot candidates found`);
      return;
    }

    candidates.forEach((bot, index) => {
      let delay;
      if (customDelays) {
        delay = minDelay + (index * 30);
      } else {
        const lobbySeconds = settings?.lobbySeconds ?? 15;
        // Dynamically scale join stagger window so they all join in the first 30% of lobby or 3s max
        const totalJoinWindowMs = Math.min(3000, (lobbySeconds * 1000) * 0.3);
        const staggerDelay = totalJoinWindowMs / candidates.length;
        const botJoinStartDelay = 200; // ms — allow first bot to join quickly
        delay = botJoinStartDelay + Math.floor(staggerDelay * index);
      }

      console.log(
        `🤖 [BotEngine] Bot #${bot.id} (${bot.firstName}) scheduled to join game #${gameId} in ${delay}ms`,
      );

      setTimeout(async () => {
        // Enforce fastClaim: true so DB card claims complete very quickly
        await _joinBotToGame(bot, gameId, io, { fastClaim: true });
      }, delay);
    });
  } catch (err) {
    // This function is called fire-and-forget — log the error but never throw
    console.error(`🤖 [BotEngine] Unexpected error scheduling bots for game #${gameId}:`, err);
  }
}

module.exports = { scheduleBotJoins };
