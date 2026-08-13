/**
 * Red Bingos Core Game Engine
 * Authoritative lifecycle management for lobby timer, draw loops, win checks, and payout.
 */

const prisma = require('../utils/prisma');
const cardGenerator = require('./cardGenerator');
const botEngine = require('./botEngine');
const winnerEngine = require('./winnerEngine');

// In-memory registry to track active timers and draw loops for games
const activeGames = new Map();

function tracePrizeUpdate() {}
function logPrizeTrace() {}

// Definition of standard Bingo patterns using grid indices (0-24 in column-major B-I-N-G-O order)
const WIN_PATTERNS = {
  row: [
    [0, 5, 10, 15, 20], // Row 0
    [1, 6, 11, 16, 21], // Row 1
    [2, 7, 12, 17, 22], // Row 2 (includes index 12 FREE space)
    [3, 8, 13, 18, 23], // Row 3
    [4, 9, 14, 19, 24]  // Row 4
  ],
  column: [
    [0, 1, 2, 3, 4],       // Col 0 (B)
    [5, 6, 7, 8, 9],       // Col 1 (I)
    [10, 11, 12, 13, 14],  // Col 2 (N) (includes index 12 FREE space)
    [15, 16, 17, 18, 19],  // Col 3 (G)
    [20, 21, 22, 23, 24]   // Col 4 (O)
  ],
  diagonal: [
    [0, 6, 12, 18, 24],    // TL to BR
    [20, 16, 12, 8, 4]     // TR to BL
  ],
  fourCorners: [
    [0, 4, 20, 24]         // Four corners
  ]
};

const PATTERN_ALIASES = {
  blackout: 'fourCorners',
  'four_corners': 'fourCorners',
  'four corners': 'fourCorners',
  'fourcorners': 'fourCorners',
};

function normalizePatternName(patternName) {
  if (!patternName || typeof patternName !== 'string') return null;
  const cleaned = patternName.trim();
  return PATTERN_ALIASES[cleaned] || cleaned;
}

function getEnabledPatterns(/*settings*/) {
  // Enforce production-ready canonical pattern set for Red Bingo:
  // exactly these four categories: row, column, diagonal, fourCorners.
  // Ignore any configured activePatterns to guarantee consistent gameplay and
  // to meet the requirement that a win requires two different pattern categories.
  return ['row', 'column', 'diagonal', 'fourCorners'];
}

function getCompletedPatterns(cardNumbers, drawnSet, enabledPatterns) {
  const completed = [];

  for (const patternName of enabledPatterns) {
    const configurations = WIN_PATTERNS[patternName];
    if (!configurations) continue;

    for (const config of configurations) {
      const isComplete = config.every((idx) => {
        const num = cardNumbers[idx];
        return num === 0 || drawnSet.has(num);
      });

      if (isComplete) {
        completed.push({
          pattern: patternName,
          winningNumbers: config.map((idx) => cardNumbers[idx]),
          indices: config,
        });
        break;
      }
    }
  }

  return completed;
}

/**
 * Checks if a card has enough distinct winning pattern categories covered by drawn numbers
 * @param {number[]} cardNumbers - 25 numbers on card
 * @param {Set<number>|number[]} drawnSet - Set or array of drawn numbers
 * @returns {object|null} win details if won, null otherwise
 */
function checkCardWin(cardNumbers, drawnSet) {
  const result = winnerEngine.validateWinner(cardNumbers, drawnSet);
  if (!result.isWinner) {
    return null;
  }

  return {
    patterns: result.matchedPatterns,
    pattern: result.matchedPatterns.join(','),
  };
}

/**
 * Starts the lobby countdown for a game
 * @param {number} gameId
 * @param {object} io - Socket.io server instance
 */
async function startLobbyCountdown(gameId, io) {
  try {
    let secondsLeft = 30;
    console.log(`⏳ Starting lobby countdown for Game #${gameId} | Duration: ${secondsLeft}s`);

    stopGameLoops(gameId);

    const intervalId = setInterval(async () => {
      secondsLeft--;

      io.to(`game_${gameId}`).emit('lobby:tick', { gameId, secondsLeft });
      io.to('admin_room').emit('lobby:tick', { gameId, secondsLeft });
      // console.log(`🎲 Game #${gameId} lobby countdown tick: ${secondsLeft}s left`); // Removed to reduce console spam

      if (secondsLeft <= 0) {
        clearInterval(intervalId);
        activeGames.delete(gameId);
        await startGame(gameId, io);
      }
    }, 1000);

    activeGames.set(gameId, { type: 'lobby', intervalId, busy: false });
  } catch (err) {
    console.error(`❌ Error starting lobby countdown for Game #${gameId}:`, err);
  }
}

/**
 * Transition game from waiting/lobby to active drawing state
 */
async function startGame(gameId, io) {
  try {
    console.log(`⚡ Transitioning Game #${gameId} from lobby...`);

    // Retrieve the game
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        _count: {
          select: {
            sessions: true
          }
        }
      }
    });

    if (!game) {
      console.error(`❌ Game #${gameId} not found`);
      return;
    }

    // Read the authoritative claimed cards count (non-transactional to avoid long locks)
    const claimedCount = await prisma.bingoCard.count({ where: { gameId, playerId: { not: null } } });

    if (claimedCount === 0) {
      console.log(`⚠️  Game #${gameId} cancelled: No cards claimed.`);
      await prisma.game.update({ where: { id: gameId }, data: { status: 'cancelled' } });
      io.to(`game_${gameId}`).emit('game:status', { gameId, status: 'cancelled', message: 'Game cancelled due to no claims.' });
      io.to('admin_room').emit('game:status', { gameId, status: 'cancelled', message: 'Game cancelled due to no claims.' });
      // Auto-create next game to keep lobby alive
      await autoCreateNextGame(io);
      return;
    }

    // Load settings for house edge
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    const houseEdgePercent = settings ? settings.houseEdge : 10.0;

    // Calculate total pool and prize
    const totalPool = claimedCount * game.cardPrice;
    const houseCut = totalPool * (houseEdgePercent / 100.0);
    const finalPrize = totalPool - houseCut;

    // Atomically move the game into in_progress and set prize to the TOTAL POOL (not yet house-cut)
    // The actual house cut will be applied at payout time in handleGameWinners to avoid double-cut issues.
    tracePrizeUpdate('startGame:setPool', gameId, game.prize, totalPool, `claimedCount=${claimedCount}, houseEdge=${houseEdgePercent}%`);
    const updatedCount = await prisma.game.updateMany({
      where: { id: gameId, status: 'waiting' },
      data: { status: 'in_progress', prize: totalPool, startedAt: new Date() }
    });

    if (updatedCount.count === 0) {
      // Game status changed under us; fetch current state and bail out
      const current = await prisma.game.findUnique({ where: { id: gameId } });
      if (!current || current.status !== 'in_progress') {
        console.log(`⚠️ Game #${gameId} status changed concurrently; aborting start.`);
        return;
      }
    } else {
      // Log the atomic prize set
      try {
      } catch (e) { /* ignore logging failures */ }
    }

    const claimedCardsCount = claimedCount;

    console.log(`🎮 Game #${gameId} starting. Total cards: ${claimedCardsCount}. Prize pool: ${finalPrize} ETB`);

    // Notify room of game start
    io.to(`game_${gameId}`).emit('game:status', {
      gameId,
      status: 'in_progress',
      prize: finalPrize,
      message: 'Game started! Preparing drawing loop...'
    });
    io.to('admin_room').emit('game:status', {
      gameId,
      status: 'in_progress',
      prize: finalPrize,
      message: 'Game started! Preparing drawing loop...'
    });

    // Start drawing loop
    await startDrawLoop(gameId, io);
  } catch (err) {
    console.error(`❌ Error starting Game #${gameId}:`, err);
  }
}

/**
 * Executes the authoritative random number drawing loop
 */
async function startDrawLoop(gameId, io) {
  try {
    // 1. Clean up any existing interval loops for this game to prevent duplicate draw loops
    stopGameLoops(gameId);

    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    const intervalSeconds = settings ? settings.drawInterval : 4;

    console.log(`🎯 Drawing loop started for Game #${gameId} | Interval: ${intervalSeconds}s`);

    const intervalId = setInterval(async () => {
      await drawNextNumber(gameId, io);
    }, intervalSeconds * 1000);

    activeGames.set(gameId, { type: 'draw', intervalId, busy: false });
  } catch (err) {
    console.error(`❌ Error in draw loop registration for Game #${gameId}:`, err);
  }
}

/**
 * Autoritatively draws the next unique bingo number (1-75)
 */
async function drawNextNumber(gameId, io) {
  let activeState;
  try {
    // Prevent overlapping draws for the same game in-memory
    activeState = activeGames.get(gameId) || {};
    if (activeState.busy) {
      console.log(`⏳ Skipping overlapping draw for Game #${gameId}`);
      return;
    }

    activeState.busy = true;
    activeGames.set(gameId, activeState);

    // 1. Fetch current drawn list
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!game || game.status !== 'in_progress') {
      stopGameLoops(gameId);
      return;
    }

    // Deduplicate current drawn numbers array to guarantee state integrity
    const currentDrawn = Array.from(new Set(game.drawnNumbers || []));

    // 2. Handle edge case where all numbers are drawn (defensive)
    if (currentDrawn.length >= 75) {
      stopGameLoops(gameId);
      console.log(`⚠️ Game #${gameId} drawn all 75 numbers without a winner!`);
      await prisma.game.update({
        where: { id: gameId },
        data: { status: 'completed', endedAt: new Date() }
      });
      io.to(`game_${gameId}`).emit('game:completed', {
        gameId,
        winners: [],
        message: 'Game finished. No winner detected after 75 draws.'
      });
      io.to('admin_room').emit('game:completed', {
        gameId,
        winners: [],
        message: 'Game finished. No winner detected after 75 draws.'
      });
      // Auto-create next game to keep lobby alive
      await autoCreateNextGame(io);
      return;
    }

    // 3. Select next unique number from 1 to 75
    const pool = Array.from({ length: 75 }, (_, i) => i + 1).filter(num => !currentDrawn.includes(num));
    if (pool.length === 0) return;

    const nextNumber = pool[Math.floor(Math.random() * pool.length)];
    const newDrawn = [...currentDrawn, nextNumber];
    const newDrawIndex = game.drawIndex + 1;

    // 4. Optimistic locking via updateMany to prevent multi-process or concurrent duplicate draw updates
    const updateResult = await prisma.game.updateMany({
      where: {
        id: gameId,
        status: 'in_progress',
        drawIndex: game.drawIndex, // Only succeed if no other draw step updated drawIndex concurrently
      },
      data: {
        drawnNumbers: newDrawn,
        currentNumber: nextNumber,
        drawIndex: newDrawIndex
      }
    });

    if (updateResult.count === 0) {
      console.log(`⚠️ Game #${gameId} draw step concurrent conflict detected (drawIndex ${game.drawIndex}); skipping.`);
      return;
    }

    console.log(`🔮 Game #${gameId} drew: ${nextNumber} (Draw index: ${newDrawIndex})`);

    // 5. Broadcast draw event
    io.to(`game_${gameId}`).emit('game:draw', {
      gameId,
      number: nextNumber,
      drawnNumbers: newDrawn,
      drawIndex: newDrawIndex
    });
    io.to('admin_room').emit('game:draw', {
      gameId,
      number: nextNumber,
      drawnNumbers: newDrawn,
      drawIndex: newDrawIndex
    });

    // 6. Run win checker — pass previous and new draws so we can detect newly completed patterns
    await checkWinners(gameId, currentDrawn, newDrawn, io);
  } catch (err) {
    console.error(`❌ Error drawing number for Game #${gameId}:`, err);
  } finally {
    // Clear busy flag only if the activeGames entry still exists (stopGameLoops may have removed it)
    if (activeState && activeGames.has(gameId)) {
      const a = activeGames.get(gameId);
      if (a) {
        a.busy = false;
        activeGames.set(gameId, a);
      }
    }
  }
}

/**
 * Checks all claimed cards against the current drawn numbers list
 */
async function checkWinners(gameId, prevDrawnNumbers, newDrawnNumbers, io) {
  try {
    // Retrieve claimed cards that are not already marked as winner
    const claimedCards = await prisma.bingoCard.findMany({
      where: { gameId, playerId: { not: null }, isWinner: false },
      include: { player: true }
    });

    const prevSet = new Set(prevDrawnNumbers || []);
    const newSet = new Set(newDrawnNumbers || []);

    const winningCards = [];

    for (const card of claimedCards) {
      // Evaluate card patterns before and after current draw using winnerEngine
      const prevEval = winnerEngine.validateWinner(card, prevSet);
      const newEval = winnerEngine.validateWinner(card, newSet);

      const newlyCompleted = newEval.matchedPatterns.filter(p => !prevEval.matchedPatterns.includes(p));

      // If any newly completed patterns, broadcast real-time updates to sockets
      if (newlyCompleted.length > 0) {
        if (io) {
          io.to(`game_${gameId}`).emit('card:patterns', {
            gameId,
            cardId: card.id,
            cardNumber: card.cardNumber,
            playerId: card.playerId,
            completedPatterns: newEval.matchedPatterns,
            newlyCompletedPatterns: newlyCompleted,
            drawnNumbers: newDrawnNumbers
          });

          // Also notify Admin Dashboard
          io.to('admin_room').emit('card:patterns', {
            gameId,
            cardId: card.id,
            cardNumber: card.cardNumber,
            player: { id: card.playerId, username: card.player && (card.player.username || `${card.player.firstName}`) },
            completedPatterns: newEval.matchedPatterns,
            newlyCompletedPatterns: newlyCompleted,
            drawnNumbers: newDrawnNumbers
          });
        }

        console.log(`🔔 Game #${gameId} | Card #${card.cardNumber} completed patterns: ${newlyCompleted.join(', ')}`);
      }

      // Check if card satisfies the 2-pattern win rule
      if (newEval.isWinner) {
        const winResult = {
          patterns: newEval.matchedPatterns,
          pattern: newEval.matchedPatterns.join(','),
        };

        winningCards.push({ card, winResult });
      }
    }

    // If winners are detected, stop drawing and perform payouts
    if (winningCards.length > 0) {
      stopGameLoops(gameId);
      await handleGameWinners(gameId, winningCards, io);
    }
  } catch (err) {
    console.error(`❌ Error checking winners for Game #${gameId}:`, err);
  }
}

/**
 * Atomically marks winner, logs transaction, processes prize payout, and ends the game
 */
async function handleGameWinners(gameId, winningCards, io) {
  try {
    console.log(`🏆 Winners found for Game #${gameId}! Count: ${winningCards.length}`);

    // Run inside database transaction to ensure payout integrity
    const payload = await prisma.$transaction(async (tx) => {
      // Fetch game to get cardPrice, drawIndex, currentNumber for winner display
      const gameRecord = await tx.game.findUnique({ 
        where: { id: gameId }, 
        select: { cardPrice: true, drawIndex: true, currentNumber: true, startedAt: true } 
      });
      const cardPrice = gameRecord?.cardPrice ?? 10;

      // Compute pool amount by summing all session bets for this game (authoritative source)
      const sessionAgg = await tx.gameSession.aggregate({
        where: { gameId },
        _sum: { totalBet: true }
      });
      const poolAmount = (sessionAgg && sessionAgg._sum && sessionAgg._sum.totalBet) ? parseFloat(sessionAgg._sum.totalBet) : 0;

      // Read settings inside transaction to compute house edge
      const settingsRec = await tx.gameSettings.findUnique({ where: { id: 1 } });
      const houseEdgePercent = settingsRec ? settingsRec.houseEdge : 10.0;

      // Compute final prize after house cut
      const houseCut = poolAmount * (houseEdgePercent / 100.0);
      const finalPrizeAmount = Math.max(0, poolAmount - houseCut);
      const splitPrize = finalPrizeAmount / winningCards.length;

      // 1. Mark cards as winner in DB
      for (const { card } of winningCards) {
        await tx.bingoCard.update({
          where: { id: card.id },
          data: { isWinner: true }
        });
      }

      // 2. Create GameWinner records, credit players, and create Transaction ledger entries
      // Group winning cards by playerId to avoid unique constraint violation on (gameId, playerId)
      const winnersByPlayer = new Map();
      for (const { card, winResult } of winningCards) {
        const pid = card.playerId;
        if (!winnersByPlayer.has(pid)) {
          winnersByPlayer.set(pid, { playerId: pid, cards: [], patterns: [] });
        }
        winnersByPlayer.get(pid).cards.push(card);
        winnersByPlayer.get(pid).patterns.push(...winResult.patterns);
      }

      const winnersInfo = [];

      for (const [pid, data] of winnersByPlayer) {
        const playerPrize = splitPrize * data.cards.length;
        const uniquePatterns = Array.from(new Set(data.patterns));
        const patternString = uniquePatterns.join(',');

        // Read player's balance inside transaction to capture balanceBefore
        const playerBefore = await tx.player.findUnique({ where: { id: pid } });
        const balanceBefore = playerBefore ? playerBefore.balance : 0;

        // Create one GameWinner record per player with game duration
        const gameDuration = gameRecord?.startedAt ? Math.floor((Date.now() - new Date(gameRecord.startedAt)) / 1000) : 0;
        const gameWinner = await tx.gameWinner.create({
          data: {
            gameId,
            playerId: pid,
            prize: playerPrize,
            cardNumbers: data.cards.map(c => c.numbers).flat(),
            winPattern: patternString,
            drawNumber: gameRecord.currentNumber ?? undefined,
            drawIndex: gameRecord.drawIndex,
            gameDuration,
            bingoCardId: data.cards[0].id
          }
        });

        // Credit player balance once per player
        const updatedPlayer = await tx.player.update({
          where: { id: pid },
          data: {
            balance: { increment: playerPrize },
            gamesWon: { increment: 1 }
          }
        });

        // Create transaction history entry
        await tx.transaction.create({
          data: {
            type: 'win',
            amount: playerPrize,
            balanceBefore: balanceBefore,
            balanceAfter: balanceBefore + playerPrize,
            note: `Won prize in Game #${gameId} (Patterns: ${patternString}, Cards: ${data.cards.map(c => c.cardNumber).join(',')})`,
            status: 'completed',
            playerId: pid
          }
        });

         // Add to list of winners
         winnersInfo.push({
           playerId: pid,
           telegramId: updatedPlayer.telegramId,
           newBalance: updatedPlayer.balance,
           username: data.cards[0].player.username || data.cards[0].player.firstName,
           firstName: data.cards[0].player.firstName,
           prize: playerPrize,
           cardNumber: data.cards.map(c => c.cardNumber).join(', '),
           winPattern: patternString,
           cardSnapshot: data.cards.map(c => c.numbers).flat(),
           cardPrice: cardPrice
         });
      }

      // 3. Increment gamesPlayed for all participants of the game
      const participants = await tx.gameSession.findMany({
        where: { gameId, status: 'active' }
      });

      for (const participant of participants) {
        await tx.player.update({
          where: { id: participant.playerId },
          data: { gamesPlayed: { increment: 1 } }
        });
        
        // Update session status
        const isWinner = winningCards.some(wc => wc.card.playerId === participant.playerId);
        await tx.gameSession.update({
          where: { id: participant.id },
          data: { status: isWinner ? 'won' : 'lost' }
        });
      }

      // 4. Complete the Game record (store final prize amount)
      const finalGame = await tx.game.update({
        where: { id: gameId },
        data: {
          status: 'completed',
          endedAt: new Date(),
          winnerCount: winningCards.length,
          prize: finalPrizeAmount
        }
      });

      // Count distinct players who participated in this game
      const distinctPlayers = await tx.gameSession.findMany({
        where: { gameId },
        select: { playerId: true },
        distinct: ['playerId'],
      });
      const totalPlayers = distinctPlayers.length;

      // Count total claimed cards in this game
      const totalCards = await tx.bingoCard.count({
        where: { gameId, playerId: { not: null } },
      });

      console.log(`[PRIZE TRACE] ${new Date().toISOString()} | handleGameWinners:setFinalPrize | Game #${gameId} | pool=${poolAmount} | houseCut=${houseCut} | finalPrize=${finalPrizeAmount} | winnerCount=${winningCards.length}`);
      return { finalGame, winnersInfo, totalPlayers, totalCards };
    });

    console.log(`✅ Game #${gameId} payouts complete. Broadcasted completion status.`);

    // 5. Broadcast final completed status (including totalPlayers and totalCards)
    io.to(`game_${gameId}`).emit('game:completed', {
      gameId,
      winners: payload.winnersInfo,
      prize: payload.finalGame.prize,
      drawnNumbers: payload.finalGame.drawnNumbers,
      endedAt: payload.finalGame.endedAt,
      totalPlayers: payload.totalPlayers,
      totalCards: payload.totalCards,
    });
    io.to('admin_room').emit('game:completed', {
      gameId,
      winners: payload.winnersInfo,
      prize: payload.finalGame.prize,
      drawnNumbers: payload.finalGame.drawnNumbers,
      endedAt: payload.finalGame.endedAt,
      totalPlayers: payload.totalPlayers,
      totalCards: payload.totalCards,
    });

    // 6. Auto-create next game to keep lobby alive
    await autoCreateNextGame(io);
 
    // ── Real-time: notify revenue dashboards and player dashboards ───────────
    if (io) {
      io.to('admin_room').emit('revenue:updated', {
        type: 'game_completed',
        gameId,
        prize: payload.finalGame.prize,
      });

      // Emit balance updates for winners
      for (const winner of payload.winnersInfo) {
        if (winner.telegramId) {
          io.to(`player_${winner.telegramId}`).emit('balance:updated', {
            playerId: winner.playerId,
            balance: winner.newBalance,
            type: 'win',
            amount: winner.prize
          });
        }
        io.to('admin_room').emit('players:updated', {
          playerId: winner.playerId,
          action: 'balance_updated',
          balance: winner.newBalance,
        });
      }
    }

  } catch (err) {
    console.error(`❌ Error handling winners payout for Game #${gameId}:`, err);
  }
}

/**
 * Automatically creates the next waiting game to keep the lobby alive.
 * On server restart, resumes timers for any game already in waiting/in_progress state.
 */
async function autoCreateNextGame(io) {
  try {
    // Check if there's already a waiting game
    const existingWaiting = await prisma.game.findFirst({
      where: { status: 'waiting' }
    });

    if (existingWaiting) {
      // Game exists but its in-memory timer was wiped on restart — resume it
      if (!activeGames.has(existingWaiting.id)) {
        console.log(`♻️  Resuming lobby countdown for existing Game #${existingWaiting.id}`);
        startLobbyCountdown(existingWaiting.id, io);
      } else {
        console.log('ℹ️ Waiting game already exists and timer is active, skipping auto-create');
      }
      return existingWaiting;
    }

    // Also resume any in_progress game whose draw loop was lost on restart
    const existingInProgress = await prisma.game.findFirst({
      where: { status: 'in_progress' }
    });
    if (existingInProgress && !activeGames.has(existingInProgress.id)) {
      console.log(`♻️  Resuming draw loop for in-progress Game #${existingInProgress.id}`);
      await startDrawLoop(existingInProgress.id, io);
    }

    if (existingWaiting) return existingWaiting;

    // Get settings for default game configuration
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.gameSettings.create({ data: { id: 1 } });
    }

    const cardPrice = settings.minBet || 10;
    const totalCards = settings.totalCards || 400;

    // Create the game record
    const game = await prisma.$transaction(async (tx) => {
      const newGame = await tx.game.create({
        data: {
          cardPrice: parseFloat(cardPrice),
          totalCards: parseInt(totalCards),
          mode: 'automatic',
          prize: 0,
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
    botEngine.scheduleBotJoins(game.id, io);

    // Start countdown timer immediately
    startLobbyCountdown(game.id, io);

    console.log(`🎮 Auto-created Game #${game.id} with ${totalCards} cards`);
    return game;
  } catch (err) {
    console.error('❌ Error auto-creating next game:', err);
  }
}

/**
 * Clean up active timers/loops for a game
 */
function stopGameLoops(gameId) {
  const activeObj = activeGames.get(gameId);
  if (activeObj) {
    clearInterval(activeObj.intervalId);
    activeGames.delete(gameId);
    console.log(`⏹️ Stopped engine loops for Game #${gameId}`);
  }
}

module.exports = {
  startLobbyCountdown,
  startGame,
  stopGameLoops,
  checkCardWin, // Exposed for unit tests
  autoCreateNextGame
};
