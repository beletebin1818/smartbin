/**
 * Telegram Controller � handles requests from the Telegram Bot service.
 * Performs database query operations via Prisma.
 */

'use strict';

const prisma = require('../utils/prisma');
const depositVerificationService = require('../services/depositVerificationService');

/**
 * Find or create a player based on telegramId and shared contact details.
 * Credits joining bonus if newly registered.
 */
async function registerPlayer(req, res, next) {
  try {
    const { telegramId, phoneNumber, firstName, lastName } = req.body;

    if (!telegramId || !phoneNumber || !firstName) {
      return res.status(400).json({ success: false, message: 'telegramId, phoneNumber, and firstName are required' });
    }

    // 1. Try to find by telegramId
    let player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (player) {
      return res.json({ success: true, isNew: false, data: player });
    }

    // 2. Try to find by phoneNumber
    player = await prisma.player.findUnique({
      where: { phoneNumber: String(phoneNumber) },
    });

    if (player) {
      // Link telegramId to existing player record created by agent/admin
      const updated = await prisma.player.update({
        where: { id: player.id },
        data: { telegramId: String(telegramId), firstName, lastName },
      });
      return res.json({ success: true, isNew: false, data: updated });
    }

    // 3. Newly registered player: Fetch joining bonus setting
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.gameSettings.create({ data: { id: 1 } });
    }
    const bonus = settings.initialJoinBonus || 10;

    // Create player and transaction atomically
    const newPlayer = await prisma.$transaction(async (tx) => {
      const created = await tx.player.create({
        data: {
          telegramId: String(telegramId),
          phoneNumber: String(phoneNumber),
          firstName,
          lastName,
          balance: bonus,
          totalDeposited: bonus,
        },
      });

      await tx.transaction.create({
        data: {
          type: 'bonus',
          amount: bonus,
          balanceBefore: 0,
          balanceAfter: bonus,
          note: 'Initial registration join bonus',
          status: 'completed',
          playerId: created.id,
          
        },
      });

      return created;
    });

    if (req.io) {
      req.io.to('admin_room').emit('players:updated', {
        playerId: newPlayer.id,
        action: 'created',
        fullName: `${newPlayer.firstName} ${newPlayer.lastName || ''}`.trim(),
        balance: newPlayer.balance,
      });
    }

    return res.status(201).json({ success: true, isNew: true, bonus, data: newPlayer });
  } catch (err) {
    next(err);
  }
}

/**
 * Get player balance by telegramId
 */
async function getBalance(req, res, next) {
  try {
    const { telegramId } = req.params;
    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
      select: { id: true, balance: true, status: true, firstName: true, lastName: true },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    // Query pending transactions to calculate available, pending, total balances
    const pendingTransactions = await prisma.transaction.findMany({
      where: { playerId: player.id, status: 'pending' },
      select: { type: true, amount: true }
    });

    let pendingWithdrawalsSum = 0;
    let pendingDepositsSum = 0;
    for (const tx of pendingTransactions) {
      if (tx.type === 'withdrawal') {
        pendingWithdrawalsSum += tx.amount;
      } else if (tx.type === 'deposit') {
        pendingDepositsSum += tx.amount;
      }
    }

    const availableBalance = Math.max(0, player.balance - pendingWithdrawalsSum);
    const pendingBalance = pendingWithdrawalsSum + pendingDepositsSum;
    const totalBalance = availableBalance + pendingBalance;

    return res.json({
      success: true,
      balance: player.balance,
      availableBalance,
      pendingBalance,
      totalBalance,
      fullName: `${player.firstName} ${player.lastName || ''}`.trim()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get player's withdrawable balance (winnings only).
 * withdrawable = SUM(win transactions) − SUM(completed withdrawal transactions), min 0.
 */
async function getWithdrawableBalance(req, res, next) {
  try {
    const { telegramId } = req.params;
    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
      select: { id: true, status: true },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    // Sum all completed 'win' type transactions
    const winAgg = await prisma.transaction.aggregate({
      where: { playerId: player.id, type: 'win', status: 'completed' },
      _sum: { amount: true },
    });
    const totalWinnings = winAgg._sum.amount || 0;

    // Sum all completed 'withdrawal' type transactions (already paid out)
    const withdrawalAgg = await prisma.transaction.aggregate({
      where: { playerId: player.id, type: 'withdrawal', status: 'completed' },
      _sum: { amount: true },
    });
    const totalWithdrawn = withdrawalAgg._sum.amount || 0;

    const withdrawableBalance = Math.max(0, totalWinnings - totalWithdrawn);

    return res.json({
      success: true,
      withdrawableBalance,
      totalWinnings,
      totalWithdrawn,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Request deposit (status: pending)
 */
async function requestDeposit(req, res, next) {
  try {
    const { telegramId } = req.params;
    const { amount, method, smsProof } = req.body;
    const parsedAmount = parseFloat(amount || 0);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ success: false, message: 'Valid non-negative deposit amount required' });
    }

    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    // Check for active pending deposit request - prevent duplicates
    const pendingDeposit = await prisma.pendingRequest.findFirst({
      where: {
        playerId: player.id,
        type: 'deposit',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingDeposit) {
      return res.status(409).json({
        success: false,
        message: 'የላኩት መልስ እስኪያገኝ ይጠበቁ።',
        hasPendingDeposit: true,
        pendingAmount: pendingDeposit.amount,
        pendingCreatedAt: pendingDeposit.createdAt,
      });
    }

    // Call verification service BEFORE creating pending request
    const verificationResult = await depositVerificationService.verifyDeposit(
      player.id,
      player.agentId,
      parsedAmount,
      req.body.method,
      req.body.smsProof,
      req.body.receiptUrl
    );

    if (!verificationResult.success) {
      return res.status(400).json({ success: false, message: verificationResult.message });
    }

    // Create PendingRequest and Transaction atomically
    const request = await prisma.$transaction(async (tx) => {
      const pendingReq = await tx.pendingRequest.create({
        data: {
          type: 'deposit',
          amount: parsedAmount,
          status: 'pending',
          playerId: player.id,
          agentId: player.agentId,
          method: req.body.method,
          smsProof: req.body.smsProof,
          note: req.body.smsProof ? `SMS proof: ${req.body.smsProof.substring(0, 100)}` : null,
        },
      });

      // Update DepositVerification to link to this PendingRequest
      await tx.depositVerification.update({
        where: { id: verificationResult.depositVerification.id },
        data: { pendingRequestId: pendingReq.id }
      });

      await tx.transaction.create({
        data: {
          type: 'deposit',
          amount: parsedAmount,
          balanceBefore: player.balance,
          balanceAfter: player.balance,
          status: 'pending',
          playerId: player.id,
          agentId: player.agentId,
          method: req.body.method,
          smsProof: req.body.smsProof,
          pendingRequestId: pendingReq.id,
          note: req.body.smsProof ? `SMS proof: ${req.body.smsProof.substring(0, 100)}` : `Pending deposit via ${req.body.method}`,
        },
      });

      return pendingReq;
    });

    // Real-time: notify the Admin Dashboard "Pending Requests" page instantly
    if (req.io) {
      req.io.to('admin_room').emit('pending:new', {
        id: request.id,
        type: 'deposit',
        amount: parsedAmount,
        playerName: `${player.firstName} ${player.lastName || ''}`.trim(),
      });
    }

    return res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

/**
 * Check if player has a pending withdrawal request
 */
async function checkPendingWithdrawal(req, res, next) {
  try {
    const { telegramId } = req.params;
    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
      select: { id: true, status: true },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    const pendingReq = await prisma.pendingRequest.findFirst({
      where: {
        playerId: player.id,
        type: 'withdrawal',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      hasPending: !!pendingReq,
      amount: pendingReq ? pendingReq.amount : 0,
      submittedAt: pendingReq ? pendingReq.createdAt : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Check if player has a pending deposit request
 */
async function checkPendingDeposit(req, res, next) {
  try {
    const { telegramId } = req.params;
    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
      select: { id: true, status: true },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    const pendingReq = await prisma.pendingRequest.findFirst({
      where: {
        playerId: player.id,
        type: 'deposit',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      hasPending: !!pendingReq,
      amount: pendingReq ? pendingReq.amount : 0,
      submittedAt: pendingReq ? pendingReq.createdAt : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Request withdrawal (status: pending)
 */
async function requestWithdrawal(req, res, next) {
  try {
    const { telegramId } = req.params;
    const { amount, method, accountNumber, accountHolder } = req.body;
    const parsedAmount = parseFloat(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive withdrawal amount required' });
    }

    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    // Check for pending withdrawal request - prevent duplicates
    const pendingWithdrawal = await prisma.pendingRequest.findFirst({
      where: {
        playerId: player.id,
        type: 'withdrawal',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingWithdrawal) {
      return res.status(409).json({
        success: false,
        message: 'የታመነ የዕድል መወድድ ታሪክ አለ። እባክዎ የቆየውን ዓውሃድ ያስገድግደው ወይም አንድ ሰው ማንበኛዎች ያነጋግሩ።',
        hasPendingWithdrawal: true,
        pendingAmount: pendingWithdrawal.amount,
        pendingCreatedAt: pendingWithdrawal.createdAt,
      });
    }

    // Compute withdrawable balance: only winnings minus already-completed withdrawals
    const winAgg = await prisma.transaction.aggregate({
      where: { playerId: player.id, type: 'win', status: 'completed' },
      _sum: { amount: true },
    });
    const totalWinnings = winAgg._sum.amount || 0;

    const withdrawalAgg = await prisma.transaction.aggregate({
      where: { playerId: player.id, type: 'withdrawal', status: 'completed' },
      _sum: { amount: true },
    });
    const totalWithdrawn = withdrawalAgg._sum.amount || 0;

    const withdrawableBalance = Math.max(0, totalWinnings - totalWithdrawn);

    if (parsedAmount > withdrawableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient withdrawable balance. Withdrawable (winnings only): ${withdrawableBalance.toFixed(2)} ETB`,
      });
    }

    // Create PendingRequest and Transaction atomically
    const request = await prisma.$transaction(async (tx) => {
      const pendingReq = await tx.pendingRequest.create({
        data: {
          type: 'withdrawal',
          amount: parsedAmount,
          status: 'pending',
          playerId: player.id,
          agentId: player.agentId,
          method,
          accountNumber,
          accountHolder,
          note: `Pending withdrawal via ${method}`,
        },
      });

      await tx.transaction.create({
        data: {
          type: 'withdrawal',
          amount: parsedAmount,
          balanceBefore: player.balance,
          balanceAfter: player.balance,
          status: 'pending',
          playerId: player.id,
          agentId: player.agentId,
          method,
          pendingRequestId: pendingReq.id,
          note: `Pending withdrawal via ${method}`,
        },
      });

      return pendingReq;
    });

    // Real-time: notify the Admin Dashboard "Pending Requests" page instantly
    if (req.io) {
      req.io.to('admin_room').emit('pending:new', {
        id: request.id,
        type: 'withdrawal',
        amount: parsedAmount,
        playerName: `${player.firstName} ${player.lastName || ''}`.trim(),
      });
    }

    return res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

/**
 * Get active payment accounts for the bot (legacy - kept for backward compatibility)
 */
async function getPaymentAccounts(req, res, next) {
  try {
    const accounts = await prisma.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    return res.json({ success: true, data: accounts });
  } catch (err) {
    next(err);
  }
}

/**
 * Get agent bank accounts for a player (for deposit flow)
 * Returns all active bank accounts from ALL active agents with status=true
 * (not just the player's assigned agent)
 */
async function getAgentBankAccounts(req, res, next) {
  try {
    const { telegramId } = req.params;
    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
      select: { id: true, status: true },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!player.status) {
      return res.status(403).json({ success: false, message: 'Player account is suspended' });
    }

    // Get all active agents (status = true)
    const activeAgents = await prisma.agent.findMany({
      where: { status: true },
      select: { id: true },
    });

    if (!activeAgents || activeAgents.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const activeAgentIds = activeAgents.map(a => a.id);

    // Get active bank accounts from ALL active agents
    const accounts = await prisma.agentBankAccount.findMany({
      where: {
        agentId: { in: activeAgentIds },
        isActive: true,
      },
      orderBy: [{ method: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return res.json({ success: true, data: accounts });
  } catch (err) {
    next(err);
  }
}

/**
 * Get bot game settings (e.g. supportUsername)
 */
async function getSettings(req, res, next) {
  try {
    let settings = await prisma.gameSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.gameSettings.create({ data: { id: 1 } });
    }
    return res.json({
      success: true,
      supportUsername: settings.supportUsername || '@REDBINGOSUPPORT',
      winningLineCount: settings.winningLineCount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get public player profile by telegramId (for Mini App identity lookup)
 */
async function getProfile(req, res, next) {
  try {
    const { telegramId } = req.params;
    const player = await prisma.player.findUnique({
      where: { telegramId: String(telegramId) },
      select: { id: true, firstName: true, lastName: true, username: true, balance: true, status: true },
    });

    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    return res.json({ success: true, data: player });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerPlayer,
  getBalance,
  getProfile,
  getWithdrawableBalance,
  checkPendingWithdrawal,
  checkPendingDeposit,
  requestDeposit,
  requestWithdrawal,
  getPaymentAccounts,
  getAgentBankAccounts,
  getSettings,
};
