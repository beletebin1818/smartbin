/**
 * Game Controller — admin game list, live game view, and settings
 */

const prisma = require('../utils/prisma');
const cardGenerator = require('../services/cardGenerator');
const gameEngine = require('../services/gameEngine');
const botEngine = require('../services/botEngine');

// Helper function to calculate game stats
function calculateStats(game) {
  const sessions = game.sessions || [];

  const realSessions = sessions.filter((s) => {
    const player = s.player;
    if (!player) return false;
    if (player.isBot === false) return true;
    if (player.isBot === undefined || player.isBot === null) {
      return player.username ? true : false;
    }
    return false;
  });

  const botSessions = sessions.filter((s) => {
    const player = s.player;
    if (!player) return false;
    return player.isBot === true;
  });

  const humanContribution = realSessions.reduce((sum, s) => {
    const cardCount = s.cardCount || 1;
    const stake = s.bet > 0 ? s.bet : (game.cardPrice || 0);
    const totalBet = s.totalBet !== undefined && s.totalBet !== null && s.totalBet > 0 ? s.totalBet : (stake * cardCount);
    return sum + totalBet;
  }, 0);

  const realPlayerCards = realSessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
  const botCards = botSessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
  const totalClaimedCards = realPlayerCards + botCards;

  const allPlayerCount = new Set(
    sessions.map(s => s.playerId || s.player?.id).filter(Boolean)
  ).size;

  const uniqueRealPlayerCount = new Set(
    realSessions.map(s => s.playerId || s.player?.id).filter(Boolean)
  ).size;

  const totalCardsInParens = totalClaimedCards || game.totalCards || 0;
  const claimedEnrollment = Math.max(0, totalClaimedCards - 15);
  const fallbackEnrollment = Math.max(0, totalCardsInParens - 15);
  const totalEnrollmentCards = totalClaimedCards > 0 ? claimedEnrollment : fallbackEnrollment;

  return {
    ...game,
    calculatedStats: {
      totalPlayers: uniqueRealPlayerCount,
      totalPlayersInParens: allPlayerCount,
      totalCards: realPlayerCards,
      totalCardsInParens: totalCardsInParens,
      realPlayerCount: uniqueRealPlayerCount,
      totalEnrollmentCards: totalEnrollmentCards,
      botCount: allPlayerCount - uniqueRealPlayerCount,
      humanContribution: humanContribution,
    },
  };
}

async function list(req, res, next) {
  try {
    const { page = 0, limit = 20, status } = req.query;
    const skip = parseInt(page) * parseInt(limit);
    const where = status ? { status } : {};

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        skip,
        take: parseInt(limit),
        select: {
          id: true, status: true, prize: true, cardPrice: true,
          totalCards: true, winnerCount: true, mode: true,
          startedAt: true, endedAt: true, createdAt: true,
          _count: { select: { sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.game.count({ where }),
    ]);

    return res.json({ success: true, data: games, total });
  } catch (err) { next(err); }
}

async function live(req, res, next) {
  try {
    const game = await prisma.game.findFirst({
      where: { status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
      include: {
        sessions: {
          select: {
            id: true,
            bet: true,
            cardCount: true,
            totalBet: true,
            status: true,
            joinedAt: true,
            playerId: true,
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                isBot: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!game) {
      const waitingGame = await prisma.game.findFirst({
        where: { status: 'waiting' },
        include: {
          sessions: {
            select: {
              id: true,
              bet: true,
              cardCount: true,
              totalBet: true,
              status: true,
              joinedAt: true,
              playerId: true,
              player: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phoneNumber: true,
                  isBot: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (waitingGame) {
        const gameWithStats = calculateStats(waitingGame);
        return res.json({ success: true, data: gameWithStats });
      }

      return res.json({ success: true, data: null });
    }

    const gameWithStats = calculateStats(game);
    return res.json({ success: true, data: gameWithStats });
  } catch (err) {
    console.error('❌ [gameController.live] Error:', err);
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        sessions: { include: { player: { select: { id: true, firstName: true, lastName: true } }, cards: true } },
        winners: { include: { player: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    return res.json({ success: true, data: game });
  } catch (err) { next(err); }
}

async function getSettings(req, res, next) {
  try {
    // Ensure singleton row exists
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.gameSettings.create({ data: { id: 1 } });
    }
    return res.json({ success: true, data: settings });
  } catch (err) { next(err); }
}

async function updateSettings(req, res, next) {
  try {
    const {
      minBet, maxBet, maxPlayers, maxCardsPerPlayer, totalCards, initialJoinBonus,
      winningLineCount, allowJoinCancel, allowAutoBets, allowManualBets,
      gameStatus, lobbySeconds, drawInterval, supportUsername,
      joinWindowDuration, idleTimeoutMinutes, autoRestartNextGame, announceBetweenGames,
      defaultCommissionRate, minimumAgentPayout, maximumAgentPayout,
      agentWithdrawalCooldown, allowAgentRegistration, requireAgentApproval,
      botDifficulty, numberOfBots, platformName, maxConcurrentGames,
      sessionTimeoutMins, maintenanceMode, debugLogging,
    } = req.body;

    if (winningLineCount !== undefined) {
      const parsedWinningLineCount = parseInt(winningLineCount, 10);
      if (Number.isNaN(parsedWinningLineCount) || parsedWinningLineCount < 1 || parsedWinningLineCount > 4) {
        return res.status(400).json({
          success: false,
          message: 'Winning Line Count must be a whole number between 1 and 4',
        });
      }
    }

    const settings = await prisma.gameSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...req.body },
      update: {
        ...(minBet !== undefined && { minBet }),
        ...(maxBet !== undefined && { maxBet }),
        ...(maxPlayers !== undefined && { maxPlayers }),
        ...(maxCardsPerPlayer !== undefined && { maxCardsPerPlayer }),
        ...(totalCards !== undefined && { totalCards }),
        ...(initialJoinBonus !== undefined && { initialJoinBonus }),
        ...(winningLineCount !== undefined && { winningLineCount }),
        ...(allowJoinCancel !== undefined && { allowJoinCancel }),
        ...(allowAutoBets !== undefined && { allowAutoBets }),
        ...(allowManualBets !== undefined && { allowManualBets }),
        ...(gameStatus !== undefined && { gameStatus }),
        ...(lobbySeconds !== undefined && { lobbySeconds }),
        ...(drawInterval !== undefined && { drawInterval }),
        ...(supportUsername !== undefined && { supportUsername }),
        ...(joinWindowDuration !== undefined && { joinWindowDuration }),
        ...(idleTimeoutMinutes !== undefined && { idleTimeoutMinutes }),
        ...(autoRestartNextGame !== undefined && { autoRestartNextGame }),
        ...(announceBetweenGames !== undefined && { announceBetweenGames }),
        ...(defaultCommissionRate !== undefined && { defaultCommissionRate }),
        ...(minimumAgentPayout !== undefined && { minimumAgentPayout }),
        ...(maximumAgentPayout !== undefined && { maximumAgentPayout }),
        ...(agentWithdrawalCooldown !== undefined && { agentWithdrawalCooldown }),
        ...(allowAgentRegistration !== undefined && { allowAgentRegistration }),
        ...(requireAgentApproval !== undefined && { requireAgentApproval }),
        ...(botDifficulty !== undefined && { botDifficulty }),
        ...(numberOfBots !== undefined && { numberOfBots }),
        ...(platformName !== undefined && { platformName }),
        ...(maxConcurrentGames !== undefined && { maxConcurrentGames }),
        ...(sessionTimeoutMins !== undefined && { sessionTimeoutMins }),
        ...(maintenanceMode !== undefined && { maintenanceMode }),
        ...(debugLogging !== undefined && { debugLogging }),
      },
    });

    return res.json({ success: true, data: settings });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { cardPrice = 50, totalCards = 100, mode = 'automatic', prize = 0 } = req.body;

    if (totalCards <= 0 || totalCards > 1000) {
      return res.status(400).json({ success: false, message: 'totalCards must be between 1 and 1000' });
    }

    // Run creation inside a transaction
    const game = await prisma.$transaction(async (tx) => {
      // Create the game record
      const newGame = await tx.game.create({
        data: {
          cardPrice: parseFloat(cardPrice),
          totalCards: parseInt(totalCards),
          mode,
          prize: parseFloat(prize),
          status: 'waiting',
        },
      });

      // Generate card pool array
      const cards = cardGenerator.generateCardPool(newGame.id, parseInt(totalCards));

      // Bulk insert cards
      await tx.bingoCard.createMany({
        data: cards,
      });

      return newGame;
    });

    // Schedule bot joins if enabled
    botEngine.scheduleBotJoins(game.id, req.io);

    // Start countdown timer immediately
    gameEngine.startLobbyCountdown(game.id, req.io);

    return res.status(201).json({
      success: true,
      message: `Game #${game.id} created with a pool of ${totalCards} cards`,
      data: game,
    });
  } catch (err) {
    next(err);
  }
}

async function getPublicGame(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid game ID' });
    }
    console.log(`[gameController.getPublicGame] Fetching game ${id}...`);
    
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        sessions: {
          include: {
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                isBot: true,
                status: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!game) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    // Calculate stats similar to getLobbyGame
    const sessions = game.sessions || [];
    const allCardCount = sessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
    const allPlayerCount = new Set(sessions.map(s => s.playerId)).size;
    const realSessions = sessions.filter(session => {
      const player = session?.player;
      if (!player) return false;
      if (player.isBot === false) return true;
      if (player.isBot === undefined || player.isBot === null) {
        return player.username ? true : false;
      }
      return false;
    });

    // Count unique real players only
    const uniqueRealPlayerCount = new Set(
      realSessions.map(s => s.playerId || s.player?.id).filter(Boolean)
    ).size;

    const realPlayerCards = realSessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
    const botSessions = sessions.filter(s => s.player?.isBot === true);
    const botCards = botSessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
    const totalClaimedCards = realPlayerCards + botCards;

    const totalCardsInParens = totalClaimedCards || game.totalCards || 0;
    const claimedEnrollment = Math.max(0, totalClaimedCards - 15);
    const fallbackEnrollment = Math.max(0, totalCardsInParens - 15);
    const totalEnrollmentCards = totalClaimedCards > 0 ? claimedEnrollment : fallbackEnrollment;

    const gameWithStats = {
      ...game,
      calculatedStats: {
        totalPlayers: uniqueRealPlayerCount,
        totalPlayersInParens: allPlayerCount,
        totalCards: realPlayerCards,
        totalCardsInParens: totalCardsInParens,
        realPlayerCount: uniqueRealPlayerCount,
        totalEnrollmentCards: totalEnrollmentCards,
        botCount: allPlayerCount - uniqueRealPlayerCount,
      },
    };

    return res.json({ success: true, data: gameWithStats });
  } catch (err) {
    console.error('❌ [gameController.getPublicGame] Error:', err);
    next(err);
  }
}

async function getLobbyGame(req, res, next) {
  try {
    console.log(' [gameController.getLobbyGame] Fetching lobby game...');
    // Get waiting game with sessions
    const waitingGame = await prisma.game.findFirst({
      where: { status: 'waiting' },
      orderBy: { createdAt: 'desc' },
      include: {
        sessions: {
          include: {
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                isBot: true,
                status: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get live game with sessions
    const liveGame = await prisma.game.findFirst({
      where: { status: 'in_progress' },
      include: {
        sessions: {
          include: {
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                isBot: true,
                status: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(' [gameController.getLobbyGame] Games found:', {
      waitingGame: waitingGame?.id,
      liveGame: liveGame?.id,
    });

    const game = waitingGame ?? null;
    const liveGameForRedirect = liveGame ?? null;

    console.log(' [gameController.getLobbyGame] Selected game:', {
      id: game?.id,
      status: game?.status,
      reason: waitingGame ? 'waiting game for lobby' : 'no waiting game'
    });

    if (!game && !liveGameForRedirect) {
      console.log(' [gameController.getLobbyGame] No game found');
      return res.json({ success: true, data: null, game: null, liveGame: null });
    }

    // Calculate stats for the waiting game (for lobby card selection)
    let calculatedStats = null;
    if (game) {
      // Get sessions for this game
      const sessions = await prisma.gameSession.findMany({
        where: { gameId: game.id },
        include: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              isBot: true,
              status: true,
              username: true,
            },
          },
        },
      });

      console.log(' [gameController.getLobbyGame] Sessions count:', sessions.length);

      const realSessions = sessions.filter(s => {
        const player = s.player;
        if (!player) return false;
        if (player.isBot === false) return true;
        if (player.isBot === undefined || player.isBot === null) {
          return player.username ? true : false;
        }
        return false;
      });

      const botSessions = sessions.filter(s => s.player?.isBot === true);

      const realPlayerCards = realSessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
      const botCards = botSessions.reduce((sum, s) => sum + (s.cardCount || 1), 0);
      const totalClaimedCards = realPlayerCards + botCards;

      const totalCardsInParens = totalClaimedCards || game.totalCards || 0;
      const claimedEnrollment = Math.max(0, totalClaimedCards - 15);
      const fallbackEnrollment = Math.max(0, totalCardsInParens - 15);
      const totalEnrollmentCards = totalClaimedCards > 0 ? claimedEnrollment : fallbackEnrollment;

      const allPlayerCount = new Set(
        sessions.map(s => s.playerId || s.player?.id).filter(Boolean)
      ).size;

      const uniqueRealPlayerCount = new Set(
        realSessions.map(s => s.playerId || s.player?.id).filter(Boolean)
      ).size;

      console.log(' [gameController.getLobbyGame] Stats calculated:', {
        realPlayerCards,
        botCards,
        totalClaimedCards,
        totalCardsInParens,
        totalEnrollmentCards,
        allPlayerCount,
        realPlayerCount: uniqueRealPlayerCount,
      });

       calculatedStats = {
         totalPlayers: uniqueRealPlayerCount,
         totalPlayersInParens: allPlayerCount,
         totalCards: realPlayerCards,
         totalCardsInParens: totalCardsInParens,
         realPlayerCount: uniqueRealPlayerCount,
         totalEnrollmentCards: totalEnrollmentCards,
         botCount: allPlayerCount - uniqueRealPlayerCount,
       };
    }

    console.log(' [gameController.getLobbyGame] Returning lobby data');
    return res.json({ 
      success: true, 
      data: game ? { ...game, calculatedStats } : null, 
      game: game ? { ...game, calculatedStats } : null, 
      liveGame: liveGameForRedirect ? { ...liveGameForRedirect, calculatedStats } : null 
    });
  } catch (err) {
    console.error(' [gameController.getLobbyGame] Error:', err);
    next(err);
  }
}

/**
 * PATCH /api/games/public/:gameId/stake
 * Update card price for a waiting lobby game (player stake selector).
 * Only allowed while no cards have been claimed yet.
 */
async function updateLobbyStake(req, res, next) {
  try {
    const gameId = parseInt(req.params.gameId);
    const { cardPrice } = req.body;

    if (cardPrice === undefined || cardPrice === null || Number.isNaN(parseFloat(cardPrice))) {
      return res.status(400).json({ success: false, message: 'cardPrice is required' });
    }

    const stake = parseFloat(cardPrice);

    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) settings = await prisma.gameSettings.create({ data: { id: 1 } });

    if (stake < settings.minBet || stake > settings.maxBet) {
      return res.status(400).json({
        success: false,
        message: `Stake must be between ${settings.minBet} and ${settings.maxBet} ETB`,
      });
    }

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }
    if (game.status !== 'waiting') {
      return res.status(400).json({ success: false, message: 'Stake can only be changed before the game starts' });
    }

    const claimedCount = await prisma.bingoCard.count({
      where: { gameId, playerId: { not: null } },
    });
    if (claimedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Stake cannot be changed after cards have been claimed',
      });
    }

    const updated = await prisma.game.update({
      where: { id: gameId },
      data: { cardPrice: stake },
    });

    if (req.io) {
      req.io.to(`game_${gameId}`).emit('game:stake_updated', { gameId, cardPrice: stake });
    }

    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

async function getPublicSettings(req, res, next) {
  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      console.log('[getPublicSettings] Creating default settings');
      settings = await prisma.gameSettings.create({ data: { id: 1 } });
    }
    // Only expose fields the mini-app needs
    return res.json({
      success: true,
      data: {
        id: settings.id,
        minBet: settings.minBet ?? 10,
        maxBet: settings.maxBet ?? 1000,
        maxCardsPerPlayer: settings.maxCardsPerPlayer ?? 5,
        lobbySeconds: settings.lobbySeconds ?? 30,
        drawInterval: settings.drawInterval ?? 3,
        houseEdge: settings.houseEdge ?? 0.1,
        winningLineCount: settings.winningLineCount ?? 1,
      },
    });
  } catch (err) {
    console.error('[getPublicSettings] Error:', err);
    // Return default settings on error
    return res.json({
      success: true,
      data: {
        id: 1,
        minBet: 10,
        maxBet: 1000,
        maxCardsPerPlayer: 5,
        lobbySeconds: 30,
        drawInterval: 3,
        houseEdge: 0.1,
        winningLineCount: 1,
      },
    });
  }
}

module.exports = { list, live, getLobbyGame, getPublicGame, getPublicSettings, updateLobbyStake, getOne, getSettings, updateSettings, create };
