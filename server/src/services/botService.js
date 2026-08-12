/**
 * Bot Service — Step 6.2
 *
 * A collection of pure, reusable methods that form the foundation of the
 * bot player system.  This module has NO side-effects at import time:
 * nothing is scheduled, no DB calls are made, no bots are joined to games.
 *
 * Every method delegates to existing services/infrastructure:
 *   - Card claiming  → HTTP POST to the same endpoint real players use
 *   - Wallet ops     → direct Prisma transactions (same pattern as agentController)
 *   - Configuration  → GameSettings singleton row (same as gameEngine.js)
 *
 * IMPORTANT: Do NOT add auto-scheduling, game-engine wiring, or Socket.IO
 * calls here.  That is the responsibility of a future integration step.
 */

'use strict';

const http    = require('http');
const prisma  = require('../utils/prisma');
const BOT_NAMES   = require('../config/botNames');
const BOT_AVATARS = require('../config/botAvatars');
const botConfig   = require('../config/botConfig');

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current hour (0-23) in UTC timezone
 * @returns {number} Current hour in UTC
 */
function _getCurrentUTCHour() {
  return new Date().getUTCHours();
}

/**
 * Determine bot count based on current UTC time
 * 09:00–18:59 UTC → 80 bots
 * 19:00–08:59 UTC → 40 bots
 * @returns {object} { min, max } bot player counts
 */
function _getTimeBotCount() {
  const hour = _getCurrentUTCHour();
  // 09:00–18:59 UTC (hours 9–18)
  if (hour >= 9 && hour <= 18) {
    return { min: 80, max: 80 };
  }
  // 19:00–08:59 UTC (hours 19–23, 0–8)
  return { min: 40, max: 40 };
}

/**
 * Pick a random element from an array.
 * @param {Array} arr
 * @returns {*}
 */
function _pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
 * Thin HTTP helper — mirrors the pattern used in verify_*.js scripts.
 * Posts JSON to localhost and resolves with { statusCode, body }.
 * @param {object} options  - Node http.request options
 * @param {object} body     - JSON body (optional)
 * @returns {Promise<{statusCode: number, body: any}>}
 */
function _httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers = options.headers || {};
      options.headers['Content-Type']   = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ statusCode: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. loadBotConfiguration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hardcoded bot configuration — database/game-settings overrides removed.
 */
async function loadBotConfiguration(gameId = null) {
  return {
    botsEnabled:     true,
    minBotPlayers:   0,
    maxBotPlayers:   0,
    botMinCards:     1,
    botMaxCards:     4,
    showBotLabels:   true,
    botJoinDelayMin: 500,
    botJoinDelayMax: 5000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. getAvailableBots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all bot players currently in the database.
 * Only returns records where `isBot = true`.
 *
 * @returns {Promise<object[]>} Array of Player records
 */
async function getAvailableBots() {
  return prisma.player.findMany({
    where: { isBot: true },
    orderBy: { id: 'asc' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. createBot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a single bot player.
 *
 * Assigns:
 *   - A random name from BOT_NAMES (avoids duplicates when possible)
 *   - A random avatar from BOT_AVATARS
 *   - A random starting balance in the configurable range
 *   - isBot = true
 *
 * Bots are stored as regular Player rows so all existing game logic
 * (card claiming, balance deductions, win payouts) works without changes.
 *
 * Because bots are real players they need a unique telegramId.  We use the
 * prefix "bot_" followed by a timestamp + random suffix — guaranteed unique.
 *
 * @param {object} [options={}]
 * @param {number} [options.minBalance=100]  - Minimum starting balance
 * @param {number} [options.maxBalance=1000] - Maximum starting balance
 * @returns {Promise<object>} The created Player record
 */
async function createBot({ minBalance = 100, maxBalance = 1000 } = {}) {
  // Collect names already used by bots to avoid duplicates
  const existingBots = await getAvailableBots();
  const usedNames = new Set(existingBots.map((b) => b.firstName));

  // Try to find an unused name; fall back to any random name if the pool is exhausted
  const unusedNames = BOT_NAMES.filter((n) => !usedNames.has(n));
  const chosenName  = unusedNames.length > 0 ? _pick(unusedNames) : _pick(BOT_NAMES);

  const avatar  = _pick(BOT_AVATARS);
  const balance = _randInt(minBalance, maxBalance);

  // Generate a unique telegramId for the bot
  const telegramId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const bot = await prisma.player.create({
    data: {
      telegramId,
      firstName:  chosenName,
      isBot:      true,
      botAvatar:  avatar,
      balance,
      // Bots start with their balance treated as "deposited" for accounting clarity
      totalDeposited: balance,
    },
  });

  return bot;
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. createBots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create `count` bot players sequentially.
 * Returns the array of created Player records.
 *
 * @param {number} count - Number of bots to create
 * @param {object} [options={}] - Passed through to createBot()
 * @returns {Promise<object[]>}
 */
async function createBots(count, options = {}) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('createBots: count must be a positive integer');
  }

  const created = [];
  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-await-in-loop
    const bot = await createBot(options);
    created.push(bot);
  }
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. ensureBotPool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the bot pool contains at least `targetCount` bot players.
 * Only creates the delta — never creates duplicates unnecessarily.
 *
 * @param {number} targetCount
 * @param {object} [options={}] - Passed through to createBots()
 * @returns {Promise<{ existing: number, created: object[], total: number }>}
 */
async function ensureBotPool(targetCount, options = {}) {
  if (!Number.isInteger(targetCount) || targetCount < 0) {
    throw new Error('ensureBotPool: targetCount must be a non-negative integer');
  }

  const existingCount = await prisma.player.count({ where: { isBot: true } });
  const deficit  = Math.max(0, targetCount - existingCount);

  let created = [];
  if (deficit > 0) {
    created = await createBots(deficit, options);
  }

  return {
    existing: existingCount,
    created,
    total: existingCount + created.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. assignRandomCards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Purchase between minCards and maxCards cards for a bot in a game.
 * Each bot claims 1-4 cards (hardcoded).
 *
 * IMPORTANT: This calls the SAME HTTP endpoint that real players use
 * (POST /api/games/:gameId/cards/:cardNumber/claim).  No card logic is
 * duplicated and all existing validations (balance check, max-cards limit,
 * game status check) are enforced automatically.
 *
 * The server must be running on localhost:PORT when this is called.
 *
 * @param {number} botId  - Player ID of the bot
 * @param {number} gameId - Game to join
 * @param {object} [options={}]
 * @param {number} [options.port=3000] - Port the server is listening on
 * @param {number} [options.minCards=1] - Minimum cards to claim
 * @param {number} [options.maxCards=4] - Maximum cards to claim
 * @returns {Promise<{ claimed: object[], skipped: number }>}
 */
async function assignRandomCards(botId, gameId, { port = parseInt(process.env.PORT) || 3000, minCards = 1, maxCards = 4, fastClaim = false } = {}) {
  // 1. Determine how many cards this bot will try to claim
  const cardCount = _randInt(Math.max(1, minCards), Math.max(1, maxCards));

  // 2. Fetch all unclaimed cards in this game
  const availableCards = await prisma.bingoCard.findMany({
    where:   { gameId, playerId: null },
    select:  { cardNumber: true },
    orderBy: { cardNumber: 'asc' },
  });

  if (availableCards.length === 0) {
    return { claimed: [], skipped: 0 };
  }

  // Shuffle available cards so different bots claim different cards
  const shuffled = [...availableCards].sort(() => Math.random() - 0.5);
  const toClaimCount = Math.min(cardCount, shuffled.length);

  const claimed  = [];
  let   skipped  = 0;

  for (let i = 0; i < toClaimCount; i++) {
    const { cardNumber } = shuffled[i];

    // Delay between card claims: fast in test mode, ~3-7 seconds otherwise
    if (i > 0) {
      const delay = fastClaim ? _randInt(50, 150) : _randInt(3000, 7000);
      console.log(`🤖 [BotService] Bot #${botId} waiting ${delay}ms before claiming card #${cardNumber} (${i + 1}/${toClaimCount})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // eslint-disable-next-line no-await-in-loop
    const res = await _httpRequest(
      {
        hostname: 'localhost',
        port,
        path:   `/api/games/${gameId}/cards/${cardNumber}/claim`,
        method: 'POST',
      },
      { playerId: botId },
    );

    if (res.statusCode === 200) {
      claimed.push({ cardNumber, ...res.body.data });
      console.log(`🤖 [BotService] Bot #${botId} claimed card #${cardNumber} (${i + 1}/${toClaimCount})`);
    } else {
      // Card may have been claimed by another bot concurrently — not an error
      skipped++;
    }
  }

  console.log(`🤖 [BotService] Bot #${botId} finished claiming: ${claimed.length} cards in ${toClaimCount} attempts`);

  return { claimed, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. creditBot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Credit a bot player's balance.
 * Wraps the exact same Prisma transaction pattern used in agentController.js
 * (creditPlayer) so the transaction ledger remains consistent.
 *
 * @param {number} botId  - Player ID of the bot
 * @param {number} amount - Amount to credit (ETB)
 * @param {string} [note='Bot balance credit'] - Transaction note
 * @returns {Promise<{ bot: object, transaction: object }>}
 */
async function creditBot(botId, amount, note = 'Bot balance credit') {
  if (!botId || amount <= 0) {
    throw new Error('creditBot: valid botId and a positive amount are required');
  }

  const bot = await prisma.player.findUnique({ where: { id: botId } });
  if (!bot) throw new Error(`creditBot: bot player #${botId} not found`);
  if (!bot.isBot) throw new Error(`creditBot: player #${botId} is not a bot`);

  const [updatedBot, tx] = await prisma.$transaction([
    prisma.player.update({
      where: { id: botId },
      data:  {
        balance:        { increment: amount },
        totalDeposited: { increment: amount },
      },
    }),
    prisma.transaction.create({
      data: {
        type:          'deposit',
        amount,
        balanceBefore: bot.balance,
        balanceAfter:  bot.balance + amount,
        note,
        status:        'completed',
        playerId:      botId,
      },
    }),
  ]);

  return { bot: updatedBot, transaction: tx };
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. debitBot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Debit a bot player's balance.
 * Wraps the exact same Prisma transaction pattern used in agentController.js
 * (debitPlayer).
 *
 * @param {number} botId  - Player ID of the bot
 * @param {number} amount - Amount to debit (ETB)
 * @param {string} [note='Bot balance debit'] - Transaction note
 * @returns {Promise<{ bot: object, transaction: object }>}
 */
async function debitBot(botId, amount, note = 'Bot balance debit') {
  if (!botId || amount <= 0) {
    throw new Error('debitBot: valid botId and a positive amount are required');
  }

  const bot = await prisma.player.findUnique({ where: { id: botId } });
  if (!bot) throw new Error(`debitBot: bot player #${botId} not found`);
  if (!bot.isBot) throw new Error(`debitBot: player #${botId} is not a bot`);
  if (bot.balance < amount) {
    throw new Error(`debitBot: insufficient balance (has ${bot.balance}, needs ${amount})`);
  }

  const [updatedBot, tx] = await prisma.$transaction([
    prisma.player.update({
      where: { id: botId },
      data:  {
        balance:       { decrement: amount },
        totalWithdrawn: { increment: amount },
      },
    }),
    prisma.transaction.create({
      data: {
        type:          'withdrawal',
        amount,
        balanceBefore: bot.balance,
        balanceAfter:  bot.balance - amount,
        note,
        status:        'completed',
        playerId:      botId,
      },
    }),
  ]);

  return { bot: updatedBot, transaction: tx };
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. getBotStatistics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return aggregate statistics for all bot players.
 *
 * "Online" bots are those with an active GameSession (status = 'active'),
 * which indicates they are currently inside a running game.
 *
 * @returns {Promise<object>}
 */
async function getBotStatistics() {
  // All bots
  const bots = await prisma.player.findMany({
    where: { isBot: true },
    select: {
      id:           true,
      balance:      true,
      gamesPlayed:  true,
      gamesWon:     true,
    },
  });

  // Count cards purchased by bots
  const cardCount = await prisma.bingoCard.count({
    where: {
      player: { isBot: true },
      playerId: { not: null },
    },
  });

  // "Online" = bot has an active session
  const activeSessions = await prisma.gameSession.findMany({
    where: {
      status: 'active',
      player: { isBot: true },
    },
    select: { playerId: true },
    distinct: ['playerId'],
  });

  const totalBalance   = bots.reduce((sum, b) => sum + b.balance, 0);
  const totalGamesPlayed = bots.reduce((sum, b) => sum + b.gamesPlayed, 0);
  const totalGamesWon    = bots.reduce((sum, b) => sum + b.gamesWon, 0);

  return {
    totalBots:         bots.length,
    totalBalance:      Math.round(totalBalance * 100) / 100,
    gamesPlayed:       totalGamesPlayed,
    gamesWon:          totalGamesWon,
    cardsPurchased:    cardCount,
    currentOnlineBots: activeSessions.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  loadBotConfiguration,
  getAvailableBots,
  createBot,
  createBots,
  ensureBotPool,
  assignRandomCards,
  creditBot,
  debitBot,
  getBotStatistics,
};
