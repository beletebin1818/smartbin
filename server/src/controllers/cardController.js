/**
 * Card Controller
 * Handles listing, claiming, and unclaiming/releasing Bingo cards.
 */

const prisma = require('../utils/prisma');

/**
 * Lightweight stats query for real-time updates.
 * Counts claimed cards and unique players directly from the database.
 */
async function calculateGameStats(game) {
  try {
    const cards = await prisma.bingoCard.findMany({
      where: { gameId: game.id, playerId: { not: null } },
      select: { playerId: true, player: { select: { isBot: true } } },
    });

    const totalClaimedCards = cards.length;
    const uniquePlayerIds = new Set(cards.map(c => c.playerId));
    const totalPlayersInParens = uniquePlayerIds.size;
    const realPlayerCount = cards.filter(c => !c.player?.isBot).length;
    const uniqueRealPlayers = new Set(
      cards.filter(c => !c.player?.isBot).map(c => c.playerId)
    );
    const botCount = totalPlayersInParens - uniqueRealPlayers.size;

    const totalCardsInParens = totalClaimedCards || game.totalCards || 0;
    const claimedEnrollment = Math.max(0, totalClaimedCards - 15);
    const fallbackEnrollment = Math.max(0, totalCardsInParens - 15);
    const totalEnrollmentCards = totalClaimedCards > 0 ? claimedEnrollment : fallbackEnrollment;

    return {
      totalPlayers: uniqueRealPlayers.size,
      totalPlayersInParens: totalPlayersInParens,
      totalCards: realPlayerCount,
      totalCardsInParens: totalCardsInParens,
      realPlayerCount: uniqueRealPlayers.size,
      totalEnrollmentCards: totalEnrollmentCards,
      botCount: botCount,
    };
  } catch (err) {
    console.error('[cardController] Failed to calculate game stats:', err.message);
    return null;
  }
}

/**
 * GET /api/games/:gameId/cards
 * Returns all cards for a game.
 * Hides the `numbers` and `markedCells` arrays for unclaimed or other players' cards.
 */
async function listCards(req, res, next) {
  try {
    const gameId = parseInt(req.params.gameId);
    // TODO: Once Telegram auth is wired up, get playerId from authenticated session.
    // For now, support reading it from query parameter or request header.
    const requestingPlayerId = req.query.playerId ? parseInt(req.query.playerId) : null;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    const cards = await prisma.bingoCard.findMany({
      where: { gameId },
      orderBy: { cardNumber: 'asc' },
    });

    // Expose numbers array ONLY to the player who claimed the card
    const sanitizedCards = cards.map((card) => {
      const isClaimed = card.playerId !== null;
      const isMine = requestingPlayerId !== null && card.playerId === requestingPlayerId;

      return {
        id: card.id,
        cardNumber: card.cardNumber,
        gameId: card.gameId,
        playerId: card.playerId,
        sessionId: card.sessionId,
        claimed: isClaimed,
        isMine: isMine,
        createdAt: card.createdAt,
        // Only show numbers and marked cells if it's the requester's own claimed card
        numbers: isMine ? card.numbers : undefined,
        markedCells: isMine ? card.markedCells : undefined,
      };
    });

    return res.json({ success: true, data: sanitizedCards });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/games/:gameId/cards/:cardNumber/claim
 * Claims a specific card for a player.
 */
async function claimCard(req, res, next) {
  try {
    const gameId = parseInt(req.params.gameId);
    const cardNumber = parseInt(req.params.cardNumber);
    
    // TODO: Verify playerId against the authenticated session instead of trusting the request body directly.
    const { playerId, stake } = req.body;

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'playerId is required' });
    }

    // Run inside transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check game existence and status
      const game = await tx.game.findUnique({
        where: { id: gameId },
      });

      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'waiting') {
        throw new Error('Cards can only be claimed when game is waiting to start');
      }

      // 2. Check player existence and status
      const player = await tx.player.findUnique({
        where: { id: parseInt(playerId) },
      });

      if (!player) {
        throw new Error('Player not found');
      }

      if (!player.status) {
        throw new Error('Player account is suspended');
      }

      // 3. Check player balance - use stake from request or fallback to game.cardPrice
      const cardPrice = stake ? parseFloat(stake) : game.cardPrice;
      if (player.balance < cardPrice) {
        throw new Error(`Insufficient balance. Card price is ${cardPrice} ETB, but balance is ${player.balance} ETB`);
      }

      // 4. Check max cards per player — hardcoded to 4, no database read
      const maxCards = 4;

      const currentlyClaimedCount = await tx.bingoCard.count({
        where: { gameId, playerId: player.id },
      });

      if (currentlyClaimedCount >= maxCards) {
        throw new Error(`You have reached the maximum allowed cards per player (${maxCards}) for this game`);
      }

      // 5. Check if specific card is available and lock/retrieve it
      const card = await tx.bingoCard.findUnique({
        where: {
          gameId_cardNumber: { gameId, cardNumber },
        },
      });

      if (!card) {
        throw new Error('Card not found in this game');
      }

      if (card.playerId !== null) {
        throw new Error('Card is already claimed by another player');
      }

      // 6. Retrieve or create GameSession for this player in this game
      let session = await tx.gameSession.findFirst({
        where: { gameId, playerId: player.id, status: 'active' },
      });

      console.log('[CARD CLAIM] Player info:', { 
        playerId: player.id, 
        isBot: player.isBot, 
        status: player.status,
        firstName: player.firstName,
        phoneNumber: player.phoneNumber 
      });

      if (session) {
        // Update existing session
        console.log('[CARD CLAIM] Updating existing session:', session.id);
        session = await tx.gameSession.update({
          where: { id: session.id },
          data: {
            cardCount: { increment: 1 },
            totalBet: { increment: cardPrice },
          },
        });
      } else {
        // Create new session
        console.log('[CARD CLAIM] Creating new session for player:', player.id);
        session = await tx.gameSession.create({
          data: {
            gameId,
            playerId: player.id,
            bet: cardPrice,
            cardCount: 1,
            totalBet: cardPrice,
            status: 'active',
          },
        });
        console.log('[CARD CLAIM] New session created:', session.id);
      }

      // 7. Update the card to associate it with the player and session
      const updatedCard = await tx.bingoCard.update({
        where: { id: card.id },
        data: {
          playerId: player.id,
          sessionId: session.id,
        },
      });

      // 8. Deduct player balance
      const updatedPlayer = await tx.player.update({
        where: { id: player.id },
        data: {
          balance: { decrement: cardPrice },
        },
      });

      // 9. Record transaction
      await tx.transaction.create({
        data: {
          type: 'bet',
          amount: cardPrice,
          balanceBefore: player.balance,
          balanceAfter: player.balance - cardPrice,
          note: `Claimed card #${cardNumber} in game #${gameId}`,
          status: 'completed',
          playerId: player.id,
        },
      });

      // 10. Increment prize pool of the game
      const updatedGame = await tx.game.update({
        where: { id: gameId },
        data: {
          prize: { increment: cardPrice },
        },
      });

      return { card: updatedCard, session, player: updatedPlayer, game: updatedGame };
    }, { maxWait: 10000, timeout: 15000 });

    // Broadcast card claimed to all players in the game room
    if (req.io) {
      req.io.to(`game_${gameId}`).emit('card:claimed', {
        gameId,
        cardNumber,
        playerId: result.card.playerId,
        isBot: result.player.isBot,
      });
      // ── Real-time: notify revenue dashboards ───────────────────────────────
      req.io.to('admin_room').emit('revenue:updated', {
        type: 'card_claimed',
        gameId,
        amount: result.session.bet,
      });
      // ── Real-time: notify lobby clients that stats have changed ──────────
      const stats = await calculateGameStats(result.game);
      req.io.to(`game_${gameId}`).emit('lobby:stats_updated', {
        gameId,
        stats,
      });
      // ── Real-time: notify admin players list ──────────
      req.io.to('admin_room').emit('players:updated', {
        playerId: result.card.playerId,
        action: 'balance_updated',
        balance: result.player.balance,
      });
    }

    return res.json({
      success: true,
      message: `Card #${cardNumber} successfully claimed`,
      data: {
        cardNumber: result.card.cardNumber,
        playerId: result.card.playerId,
        sessionId: result.card.sessionId,
        newBalance: result.player.balance,
        gamePrize: result.game.prize,
      },
    });
  } catch (err) {
    // If the error message is one of our custom ones, send a 400 bad request
    const clientErrors = [
      'Game not found',
      'Cards can only be claimed when game is waiting to start',
      'Player not found',
      'Player account is suspended',
      'Insufficient balance',
      'You have reached the maximum allowed cards per player',
      'Card not found in this game',
      'Card is already claimed by another player',
    ];
    
    if (clientErrors.some(msg => err.message.includes(msg))) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}

/**
 * DELETE /api/games/:gameId/cards/:cardNumber/claim
 * Releases/unclaims a claimed card. Only allowed if game is in 'waiting' status.
 */
async function unclaimCard(req, res, next) {
  try {
    const gameId = parseInt(req.params.gameId);
    const cardNumber = parseInt(req.params.cardNumber);

    // TODO: Verify playerId against the authenticated session instead of trusting the request body directly.
    const playerId = req.body.playerId || req.query.playerId;

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'playerId is required' });
    }

    // Run inside transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check if card exists and is claimed by this player
      const card = await tx.bingoCard.findFirst({
        where: { gameId, cardNumber, playerId: parseInt(playerId) },
      });

      if (!card) {
        throw new Error('Card is not claimed by you or does not exist');
      }

      // 2. Find the associated GameSession
      const session = await tx.gameSession.findUnique({
        where: { id: card.sessionId },
      });

      if (!session) {
        throw new Error('Game session not found for this card');
      }

      // 3. Check game status
      const game = await tx.game.findUnique({
        where: { id: gameId },
      });

      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'waiting') {
        throw new Error('Cards can only be released when game is waiting to start');
      }

      if (!session) {
        throw new Error('Game session not found for this card');
      }

      // 4. Update BingoCard to set playerId and sessionId to null
      const updatedCard = await tx.bingoCard.update({
        where: { id: card.id },
        data: {
          playerId: null,
          sessionId: null,
        },
      });

      // 5. Update or delete GameSession
      if (session.cardCount <= 1) {
        // Delete session if this was the only card
        await tx.gameSession.delete({
          where: { id: session.id },
        });
      } else {
        // Decrement card count and bet - use session's bet
        await tx.gameSession.update({
          where: { id: session.id },
          data: {
            cardCount: { decrement: 1 },
            totalBet: { decrement: session.bet },
          },
        });
      }

      // 6. Refund the player
      const player = await tx.player.findUnique({
        where: { id: parseInt(playerId) },
      });

      const refundAmount = session.bet;
      const updatedPlayer = await tx.player.update({
        where: { id: player.id },
        data: {
          balance: { increment: refundAmount },
        },
      });

      // 7. Record transaction
      await tx.transaction.create({
        data: {
          type: 'refund',
          amount: refundAmount,
          balanceBefore: player.balance,
          balanceAfter: player.balance + refundAmount,
          note: `Released card #${cardNumber} in game #${gameId}`,
          status: 'completed',
          playerId: player.id,
        },
      });

      // 8. Decrement prize pool of the game
      const updatedGame = await tx.game.update({
        where: { id: gameId },
        data: {
          prize: { decrement: refundAmount },
        },
      });

      console.log(`[PRIZE TRACE] ${new Date().toISOString()} | unclaimCard | Game #${gameId} | oldPrize=${game.prize} | newPrize=${updatedGame.prize} | decrement=${refundAmount}`);
      return { card: updatedCard, player: updatedPlayer, game: updatedGame, session };
     });

    // Broadcast card unclaimed to all players in the game room
    if (req.io) {
      req.io.to(`game_${gameId}`).emit('card:unclaimed', {
        gameId,
        cardNumber,
      });
      // ── Real-time: notify revenue dashboards ───────────────────────────────
      req.io.to('admin_room').emit('revenue:updated', {
        type: 'card_unclaimed',
        gameId,
        amount: result.session.bet,
      });
      // ── Real-time: notify lobby clients that stats have changed ──────────
      const stats = await calculateGameStats(result.game);
      req.io.to(`game_${gameId}`).emit('lobby:stats_updated', {
        gameId,
        stats,
      });
      // ── Real-time: notify admin players list ──────────
      req.io.to('admin_room').emit('players:updated', {
        playerId: result.player.id,
        action: 'balance_updated',
        balance: result.player.balance,
      });
    }

    return res.json({
      success: true,
      message: `Card #${cardNumber} successfully released`,
      data: {
        cardNumber: result.card.cardNumber,
        newBalance: result.player.balance,
        gamePrize: result.game.prize,
      },
    });
  } catch (err) {
    const clientErrors = [
      'Game not found',
      'Cards can only be released when game is waiting to start',
      'Card is not claimed by you or does not exist',
      'Game session not found for this card',
    ];

    if (clientErrors.some(msg => err.message.includes(msg))) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}

module.exports = {
  listCards,
  claimCard,
  unclaimCard,
};
