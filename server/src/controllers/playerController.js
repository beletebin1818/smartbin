/**
 * Player Controller — admin panel player management
 */

const prisma = require('../utils/prisma');

function parseInteger(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildPlayerFilters(query) {
  const { fullName, username, phone, telegramId, minPoints } = query;
  const where = {};
  const or = [];

  if (fullName) {
    const value = String(fullName).trim();
    if (value) {
      or.push(
        { firstName: { contains: value, mode: 'insensitive' } },
        { lastName: { contains: value, mode: 'insensitive' } },
      );
    }
  }

  if (username) {
    const value = String(username).trim();
    if (value) {
      or.push({ username: { contains: value, mode: 'insensitive' } });
    }
  }

  if (phone) {
    const value = String(phone).trim();
    if (value) {
      or.push({ phoneNumber: { contains: value } });
    }
  }
 
  if (telegramId) {
    const value = String(telegramId).trim();
    if (value) {
      or.push({ telegramId: { contains: value } });
    }
  }
 
  if (or.length > 0) {
    where.OR = or;
  }
 
  // Always show only real human players in the admin player list.
  // Bot players and other non-human/test accounts are excluded here.
  where.isBot = false;
  where.telegramId = { not: '' };
 
  const minPointsValue = parseInteger(minPoints, -1);
  if (minPointsValue >= 0) {
    where.gamesWon = { gte: minPointsValue };
  }
 
  return where;
}

function getPlayerListOrderBy(sortField, sortDirection) {
  switch (sortField) {
    case 'fullName':
      return [
        { firstName: sortDirection },
        { lastName: sortDirection },
      ];
    case 'balance':
      return { balance: sortDirection };
    case 'gamesPlayed':
      return { gamesPlayed: sortDirection };
    case 'points':
      return { gamesWon: sortDirection };
    case 'joinedAt':
    default:
      return { registeredAt: sortDirection };
  }
}

async function list(req, res, next) {
  try {
    const page = Math.max(0, parseInteger(req.query.page, 0));
    const limit = Math.max(1, parseInteger(req.query.limit, 20));
    const where = buildPlayerFilters(req.query);
    const sortField = String(req.query.sortField || 'joinedAt');
    const sortDirection = req.query.sortDirection === 'asc' ? 'asc' : 'desc';

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        skip: page * limit,
        take: limit,
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          balance: true,
          gamesPlayed: true,
          gamesWon: true,
          language: true,
          status: true,
          registeredAt: true,
          agent: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: getPlayerListOrderBy(sortField, sortDirection),
      }),
      prisma.player.count({ where }),
    ]);

    const payload = players.map((player) => ({
      id: player.id,
      telegramId: player.telegramId,
      username: player.username,
      fullName: `${player.firstName} ${player.lastName ?? ''}`.trim(),
      phone: player.phoneNumber,
      balance: player.balance,
      gamesPlayed: player.gamesPlayed,
      points: player.gamesWon,
      joinedAt: player.registeredAt,
      status: player.status,
      language: player.language,
      agent: player.agent ? `${player.agent.firstName} ${player.agent.lastName}`.trim() : null,
    }));

    return res.json({ success: true, data: payload, total, page, limit });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const id = parseInteger(req.params.id, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid player id' });
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    return res.json({ success: true, data: player });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const id = parseInteger(req.params.id, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid player id' });
    }

    const { status } = req.body;
    if (typeof status !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Status must be boolean' });
    }

    const player = await prisma.player.update({
      where: { id },
      data: { status },
      select: { id: true, status: true, telegramId: true },
    });

    if (req.io) {
      req.io.to('admin_room').emit('players:updated', {
        playerId: player.id,
        action: 'status_changed',
        status: player.status,
      });
      if (player.telegramId) {
        req.io.to(`player_${player.telegramId}`).emit('player:status_updated', {
          playerId: player.id,
          status: player.status,
        });
      }
    }

    return res.json({ success: true, data: player });
  } catch (err) {
    next(err);
  }
}

async function updateBalance(req, res, next) {
  try {
    const id = parseInteger(req.params.id, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid player id' });
    }

    const balance = Number(req.body.balance);
    if (Number.isNaN(balance)) {
      return res.status(400).json({ success: false, message: 'Balance must be a valid number' });
    }

    const player = await prisma.player.update({
      where: { id },
      data: { balance },
      select: { id: true, balance: true, telegramId: true },
    });

    if (req.io) {
      req.io.to('admin_room').emit('players:updated', {
        playerId: player.id,
        action: 'balance_updated',
        balance: player.balance,
      });
      if (player.telegramId) {
        req.io.to(`player_${player.telegramId}`).emit('balance:updated', {
          playerId: player.id,
          balance: player.balance,
        });
      }
    }

    return res.json({ success: true, data: player });
  } catch (err) {
    next(err);
  }
}

async function updateLanguage(req, res, next) {
  try {
    const id = parseInteger(req.params.id, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid player id' });
    }

    const { language } = req.body;
    if (!['am', 'en'].includes(language)) {
      return res.status(400).json({ success: false, message: 'Language must be "am" or "en"' });
    }

    const player = await prisma.player.update({ where: { id }, data: { language } });
    return res.json({ success: true, data: { id: player.id, language: player.language } });
  } catch (err) {
    next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const playerWhere = { isBot: false, telegramId: { not: '' } };
    const [totalPlayers, balanceAggregate, gamesPlayedAggregate] = await Promise.all([
      prisma.player.count({ where: playerWhere }),
      prisma.player.aggregate({ where: playerWhere, _sum: { balance: true } }),
      prisma.player.aggregate({ where: playerWhere, _sum: { gamesPlayed: true } }),
    ]);

    const totalWalletBalance = balanceAggregate._sum.balance || 0;
    const totalGamesPlayed = gamesPlayedAggregate._sum.gamesPlayed || 0;
    const avgGamesPerPlayer = totalPlayers > 0 ? totalGamesPlayed / totalPlayers : 0;

    return res.json({
      success: true,
      data: {
        totalPlayers,
        totalWalletBalance,
        totalGamesPlayed,
        avgGamesPerPlayer: Number(avgGamesPerPlayer.toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getTelegramPhoto(req, res, next) {
  try {
    const id = parseInteger(req.params.id, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid player id' });
    }

    const player = await prisma.player.findUnique({
      where: { id },
      select: { id: true, telegramId: true },
    });

    if (!player || !player.telegramId) {
      return res.json({ success: true, photoUrl: null });
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      return res.json({ success: true, photoUrl: null });
    }

    const photosRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${player.telegramId}&limit=1`
    );
    const photosData = await photosRes.json();

    if (!photosData.ok || !photosData.result || photosData.result.total_count === 0) {
      return res.json({ success: true, photoUrl: null });
    }

    const photos = photosData.result.photos[0];
    const largestPhoto = photos[photos.length - 1];
    const fileId = largestPhoto.file_id;

    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();

    if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
      return res.json({ success: true, photoUrl: null });
    }

    const photoUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    return res.json({ success: true, photoUrl });
  } catch (err) {
    return res.json({ success: true, photoUrl: null });
  }
}

async function getPlayerGames(req, res, next) {
  try {
    const id = parseInteger(req.params.id, null);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid player id' });
    }

    const { dateFrom, dateTo, winStatus } = req.query;

    const sessionWhere = {
      playerId: id,
    };

    const gameWhere = {};

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        gameWhere.createdAt = { ...(gameWhere.createdAt || {}), gte: from };
      }
    }

    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        gameWhere.createdAt = { ...(gameWhere.createdAt || {}), lte: to };
      }
    }

    if (Object.keys(gameWhere).length > 0) {
      sessionWhere.game = gameWhere;
    }

    if (winStatus === 'win') {
      sessionWhere.status = 'won';
    } else if (winStatus === 'loss') {
      sessionWhere.status = 'lost';
    }

    const sessions = await prisma.gameSession.findMany({
      where: sessionWhere,
      include: {
        game: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            endedAt: true,
            createdAt: true,
            cardPrice: true,
            winnerCount: true,
            _count: { select: { sessions: true } },
          },
        },
        cards: {
          select: {
            id: true,
            cardNumber: true,
            isWinner: true,
          },
          orderBy: { cardNumber: 'asc' },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const data = sessions.map((session) => {
      const cardsPlayed = session.cards.map((c) => c.cardNumber);
      const isWinner = session.status === 'won' || session.cards.some((c) => c.isWinner);

      return {
        gameId: session.game.id,
        sessionId: session.id,
        startTime: session.game.startedAt || session.game.createdAt || session.joinedAt,
        endTime: session.game.endedAt || session.game.createdAt,
        cardsPlayed,
        status: session.game.status,
        sessionStatus: session.status,
        result: isWinner ? 'win' : 'loss',
        bet: session.totalBet || (session.bet * session.cardCount),
        totalPlayers: session.game._count.sessions,
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getOne,
  updateStatus,
  updateBalance,
  updateLanguage,
  getStats,
  getTelegramPhoto,
  getPlayerGames,
};

