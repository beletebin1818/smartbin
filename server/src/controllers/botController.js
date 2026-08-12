/**
 * Bot Controller — Step 6.4
 * Handles bot statistics, profiles, bulk creation, deactivation, setting updates, and balance resets.
 */

'use strict';

const prisma = require('../utils/prisma');
const botService = require('../services/botService');

/**
 * GET /api/admin/bots
 * Return aggregate bot statistics
 */
async function getStats(req, res, next) {
  try {
    const totalBots = await prisma.player.count({
      where: { isBot: true },
    });

    const onlineBots = await prisma.player.count({
      where: {
        isBot: true,
        gameSessions: {
          some: { status: 'active' },
        },
      },
    });

    const agg = await prisma.player.aggregate({
      where: { isBot: true },
      _sum: {
        balance: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    const cardsPurchased = await prisma.bingoCard.count({
      where: {
        player: { isBot: true },
        playerId: { not: null },
      },
    });

    const totalBalances = agg._sum.balance || 0;
    const totalGamesPlayed = agg._sum.gamesPlayed || 0;
    const totalGamesWon = agg._sum.gamesWon || 0;
    const winRate = totalGamesPlayed > 0 ? (totalGamesWon / totalGamesPlayed) : 0;

    return res.json({
      success: true,
      data: {
        totalBots,
        onlineBots,
        offlineBots: Math.max(0, totalBots - onlineBots),
        currentBalances: Math.round(totalBalances * 100) / 100,
        gamesPlayed: totalGamesPlayed,
        gamesWon: totalGamesWon,
        cardsPurchased,
        winRate,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/bots/:id
 * Return complete bot profile with recent games & transactions
 */
async function getBotProfile(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bot ID' });
    }

    const bot = await prisma.player.findFirst({
      where: { id, isBot: true },
      include: {
        gameSessions: {
          take: 10,
          orderBy: { joinedAt: 'desc' },
          include: {
            game: {
              select: { id: true, status: true, prize: true },
            },
          },
        },
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!bot) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const winRate = bot.gamesPlayed > 0 ? (bot.gamesWon / bot.gamesPlayed) : 0;

    return res.json({
      success: true,
      data: {
        id: bot.id,
        username: bot.username || bot.firstName,
        firstName: bot.firstName,
        lastName: bot.lastName,
        avatar: bot.botAvatar,
        balance: bot.balance,
        status: bot.status ? 'active' : 'inactive',
        statistics: {
          gamesPlayed: bot.gamesPlayed,
          gamesWon: bot.gamesWon,
          winRate,
        },
        recentGames: bot.gameSessions.map(gs => ({
          sessionId: gs.id,
          gameId: gs.gameId,
          bet: gs.bet,
          cardCount: gs.cardCount,
          totalBet: gs.totalBet,
          status: gs.status,
          joinedAt: gs.joinedAt,
          gameStatus: gs.game?.status,
          gamePrize: gs.game?.prize,
        })),
        transactions: bot.transactions,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/bots/create
 * Bulk create bot players
 * Body: { count }
 */
async function createBots(req, res, next) {
  try {
    const count = parseInt(req.body.count);
    if (Number.isNaN(count) || count <= 0) {
      return res.status(400).json({ success: false, message: 'Count must be a positive integer' });
    }

    const bots = await botService.createBots(count);

    console.log(`[Audit] Bot created - Count: ${count}`);

    return res.status(201).json({
      success: true,
      message: `Successfully created ${count} bot(s)`,
      data: bots.map(b => ({
        id: b.id,
        username: b.firstName,
        avatar: b.botAvatar,
        balance: b.balance,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/bots/:id
 * Soft-delete or deactivate a bot
 */
async function deleteBot(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid bot ID' });
    }

    const bot = await prisma.player.findFirst({
      where: { id, isBot: true },
    });

    if (!bot) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const updated = await prisma.player.update({
      where: { id },
      data: { status: false },
    });

    console.log(`[Audit] Bot deleted - ID: ${id}`);

    return res.json({
      success: true,
      message: 'Bot deactivated successfully',
      data: { id: updated.id, status: 'inactive' },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/bots/reset-balance
 * Reset one or all bot balances to settings.initialJoinBonus or custom body balance.
 * Body: { id, balance }
 */
async function resetBalance(req, res, next) {
  try {
    const targetId = req.body.id ? parseInt(req.body.id) : null;
    let customBalance = req.body.balance !== undefined ? parseFloat(req.body.balance) : null;

    if (customBalance !== null && (Number.isNaN(customBalance) || customBalance < 0)) {
      return res.status(400).json({ success: false, message: 'Balance must be a non-negative number' });
    }

    // Load GameSettings for initialJoinBonus if custom balance is not provided
    if (customBalance === null) {
      const settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
      customBalance = settings ? settings.initialJoinBonus : 10;
    }

    // Determine target bots
    const targetBots = await prisma.player.findMany({
      where: {
        isBot: true,
        ...(targetId !== null && { id: targetId }),
      },
    });

    if (targetId !== null && targetBots.length === 0) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    const updatedBots = [];

    // Reset balance atomically per bot using transactions
    for (const bot of targetBots) {
      const diff = customBalance - bot.balance;
      if (diff === 0) {
        updatedBots.push(bot);
        continue;
      }

      const [updatedBot] = await prisma.$transaction([
        prisma.player.update({
          where: { id: bot.id },
          data: {
            balance: customBalance,
            ...(diff > 0
              ? { totalDeposited: { increment: diff } }
              : { totalWithdrawn: { increment: Math.abs(diff) } }
            ),
          },
        }),
        prisma.transaction.create({
          data: {
            type: diff > 0 ? 'deposit' : 'withdrawal',
            amount: Math.abs(diff),
            balanceBefore: bot.balance,
            balanceAfter: customBalance,
            note: 'Admin balance reset adjustment',
            status: 'completed',
            playerId: bot.id,
          },
        }),
      ]);
      updatedBots.push(updatedBot);
    }

    console.log(`[Audit] Balance reset - Target ID: ${targetId || 'All'}, New Balance: ${customBalance}`);

    return res.json({
      success: true,
      message: targetId !== null
        ? `Successfully reset balance for bot #${targetId} to ${customBalance} ETB`
        : `Successfully reset balance for all ${updatedBots.length} bot(s) to ${customBalance} ETB`,
      data: updatedBots.map(b => ({ id: b.id, username: b.firstName, balance: b.balance })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/bots/settings
 * Return current bot configuration settings
 */
async function getSettings(req, res, next) {
  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.gameSettings.create({ data: { id: 1 } });
    }

    return res.json({
      success: true,
      data: {
        botsEnabled: settings.botsEnabled,
        minBotPlayers: settings.minBotPlayers,
        maxBotPlayers: settings.maxBotPlayers,
        botMinCards: settings.botMinCards,
        botMaxCards: settings.botMaxCards,
        showBotLabels: settings.showBotLabels,
        botJoinDelayMin: settings.botJoinDelayMin,
        botJoinDelayMax: settings.botJoinDelayMax,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/bots/settings
 * Update bot settings with validations
 */
async function updateSettings(req, res, next) {
  try {
    const settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      await prisma.gameSettings.create({ data: { id: 1 } });
    }

    const {
      botsEnabled,
      minBotPlayers,
      maxBotPlayers,
      botMinCards,
      botMaxCards,
      showBotLabels,
      botJoinDelayMin,
      botJoinDelayMax,
    } = req.body;

    const parsedMinPlayers = minBotPlayers !== undefined ? parseInt(minBotPlayers, 10) : undefined;
    const parsedMaxPlayers = maxBotPlayers !== undefined ? parseInt(maxBotPlayers, 10) : undefined;
    const parsedMinCards = botMinCards !== undefined ? parseInt(botMinCards, 10) : undefined;
    const parsedMaxCards = botMaxCards !== undefined ? parseInt(botMaxCards, 10) : undefined;
    const parsedMinDelay = botJoinDelayMin !== undefined ? parseInt(botJoinDelayMin, 10) : undefined;
    const parsedMaxDelay = botJoinDelayMax !== undefined ? parseInt(botJoinDelayMax, 10) : undefined;

    if (parsedMinPlayers !== undefined && Number.isNaN(parsedMinPlayers)) {
      return res.status(400).json({ success: false, message: 'Invalid minBotPlayers' });
    }
    if (parsedMaxPlayers !== undefined && Number.isNaN(parsedMaxPlayers)) {
      return res.status(400).json({ success: false, message: 'Invalid maxBotPlayers' });
    }
    if (parsedMinCards !== undefined && Number.isNaN(parsedMinCards)) {
      return res.status(400).json({ success: false, message: 'Invalid botMinCards' });
    }
    if (parsedMaxCards !== undefined && Number.isNaN(parsedMaxCards)) {
      return res.status(400).json({ success: false, message: 'Invalid botMaxCards' });
    }
    if (parsedMinDelay !== undefined && Number.isNaN(parsedMinDelay)) {
      return res.status(400).json({ success: false, message: 'Invalid botJoinDelayMin' });
    }
    if (parsedMaxDelay !== undefined && Number.isNaN(parsedMaxDelay)) {
      return res.status(400).json({ success: false, message: 'Invalid botJoinDelayMax' });
    }

    if (parsedMinDelay !== undefined && parsedMinDelay < 0) {
      return res.status(400).json({ success: false, message: 'botJoinDelayMin cannot be negative' });
    }
    if (parsedMaxDelay !== undefined && parsedMaxDelay < 0) {
      return res.status(400).json({ success: false, message: 'botJoinDelayMax cannot be negative' });
    }

    const finalMinPlayers = parsedMinPlayers !== undefined ? parsedMinPlayers : settings.minBotPlayers;
    const finalMaxPlayers = parsedMaxPlayers !== undefined ? parsedMaxPlayers : settings.maxBotPlayers;
    if (finalMinPlayers > finalMaxPlayers) {
      return res.status(400).json({ success: false, message: 'minBotPlayers must be less than or equal to maxBotPlayers' });
    }

    const finalMinCards = parsedMinCards !== undefined ? parsedMinCards : settings.botMinCards;
    const finalMaxCards = parsedMaxCards !== undefined ? parsedMaxCards : settings.botMaxCards;
    if (finalMinCards > finalMaxCards) {
      return res.status(400).json({ success: false, message: 'botMinCards must be less than or equal to botMaxCards' });
    }

    const finalMinDelay = parsedMinDelay !== undefined ? parsedMinDelay : settings.botJoinDelayMin;
    const finalMaxDelay = parsedMaxDelay !== undefined ? parsedMaxDelay : settings.botJoinDelayMax;
    if (finalMinDelay > finalMaxDelay) {
      return res.status(400).json({ success: false, message: 'botJoinDelayMin must be less than or equal to botJoinDelayMax' });
    }

    const updated = await prisma.gameSettings.update({
      where: { id: 1 },
      data: {
        ...(botsEnabled !== undefined && { botsEnabled: !!botsEnabled }),
        ...(parsedMinPlayers !== undefined && { minBotPlayers: parsedMinPlayers }),
        ...(parsedMaxPlayers !== undefined && { maxBotPlayers: parsedMaxPlayers }),
        ...(parsedMinCards !== undefined && { botMinCards: parsedMinCards }),
        ...(parsedMaxCards !== undefined && { botMaxCards: parsedMaxCards }),
        ...(showBotLabels !== undefined && { showBotLabels: !!showBotLabels }),
        ...(parsedMinDelay !== undefined && { botJoinDelayMin: parsedMinDelay }),
        ...(parsedMaxDelay !== undefined && { botJoinDelayMax: parsedMaxDelay }),
      },
    });

    return res.json({
      success: true,
      message: 'Bot settings updated successfully',
      data: {
        botsEnabled: updated.botsEnabled,
        minBotPlayers: updated.minBotPlayers,
        maxBotPlayers: updated.maxBotPlayers,
        botMinCards: updated.botMinCards,
        botMaxCards: updated.botMaxCards,
        showBotLabels: updated.showBotLabels,
        botJoinDelayMin: updated.botJoinDelayMin,
        botJoinDelayMax: updated.botJoinDelayMax,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  getBotProfile,
  createBots,
  deleteBot,
  resetBalance,
  getSettings,
  updateSettings,
};
