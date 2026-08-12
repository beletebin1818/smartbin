/**
 * Pending Request Controller — deposit/withdrawal approvals
 */

const prisma = require('../utils/prisma');
const { sendTelegramMessage } = require('../utils/telegramNotify');
const { t } = require('../utils/i18n');

async function list(req, res, next) {
  try {
    const { type, status, page = 0, limit = 20, search, dateFrom, dateTo } = req.query;
    const skip = parseInt(page) * parseInt(limit);
    const where = {};
    if (type) where.type = type;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { player: { firstName: { contains: search, mode: 'insensitive' } } },
        { player: { lastName: { contains: search, mode: 'insensitive' } } },
        { player: { phoneNumber: { contains: search, mode: 'insensitive' } } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [requests, total] = await Promise.all([
      prisma.pendingRequest.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          player: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, balance: true } },
        agent: { select: { id: true, firstName: true, lastName: true, username: true } },
        // include the admin user who processed this request (if any)
        processedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
        // include the agent who processed this request (if any)
        processedByAgent: { select: { id: true, firstName: true, lastName: true, username: true } },
        depositVerification: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.pendingRequest.count({ where }),
    ]);

    return res.json({ success: true, data: requests, total });
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { amount, transactionId } = req.body;
    const request = await prisma.pendingRequest.findUnique({ where: { id }, include: { player: true, processedBy: true } });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request already ${request.status}` });
    }

    let finalAmount = request.amount;
    if (amount !== undefined && amount !== null) {
      finalAmount = parseFloat(amount);
      if (Number.isNaN(finalAmount) || finalAmount < 0) {
        return res.status(400).json({ success: false, message: 'Invalid override amount' });
      }
    }

    const isDeposit = request.type === 'deposit';

    // Find if there is an associated transaction created for this pending request
    const existingTx = await prisma.transaction.findFirst({
      where: { pendingRequestId: id }
    });

    let approveUpdateData = {
      status: 'approved',
      amount: finalAmount,
      transactionId: transactionId || request.transactionId,
      processedAt: new Date(),
    };
    if (req.user && req.user.id) {
      if (req.user.role === 'agent') {
        approveUpdateData.processedByAgentId = req.user.id;
      } else {
        approveUpdateData.processedById = req.user.id;
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update the PendingRequest status and amount if overridden, and optionally transactionId
      await tx.pendingRequest.update({
        where: { id },
        data: approveUpdateData,
      });

      // 2. Update the Player's balance
      await tx.player.update({
        where: { id: request.playerId },
        data: {
          balance: isDeposit ? { increment: finalAmount } : { decrement: finalAmount },
          ...(isDeposit ? { totalDeposited: { increment: finalAmount } } : { totalWithdrawn: { increment: finalAmount } }),
        },
      });

      // 3. Update or create the completed Transaction
      if (existingTx) {
        await tx.transaction.update({
          where: { id: existingTx.id },
          data: {
            amount: finalAmount,
            balanceBefore: request.player.balance,
            balanceAfter: isDeposit ? request.player.balance + finalAmount : request.player.balance - finalAmount,
            status: 'completed',
            note: `Approved pending ${request.type} request #${id}`,
          },
        });
      } else {
        await tx.transaction.create({
          data: {
            type: request.type,
            amount: finalAmount,
            balanceBefore: request.player.balance,
            balanceAfter: isDeposit ? request.player.balance + finalAmount : request.player.balance - finalAmount,
            note: `Approved pending ${request.type} request #${id}`,
            status: 'completed',
            playerId: request.playerId,
            agentId: request.agentId,
            pendingRequestId: id,
          },
        });
      }
    });

    // ── Real-time: notify admin dashboards + player's Telegram Mini App ──────
    const finalBalance = isDeposit
      ? request.player.balance + finalAmount
      : request.player.balance - finalAmount;

    if (req.io) {
      req.io.to('admin_room').emit('pending:updated', {
        id,
        type: request.type,
        status: 'approved',
        amount: finalAmount,
      });
      if (request.player?.telegramId) {
        req.io.to(`player_${request.player.telegramId}`).emit('balance:updated', {
          playerId: request.playerId,
          balance: finalBalance,
          requestId: id,
          type: request.type,
          status: 'approved',
        });
      }
      // ── Real-time: notify revenue dashboards ───────────────────────────────
      req.io.to('admin_room').emit('revenue:updated', {
        type: 'transaction',
        amount: finalAmount,
        requestId: id,
      });
      req.io.to('admin_room').emit('players:updated', {
        playerId: request.playerId,
        action: 'balance_updated',
        balance: finalBalance,
      });
    }

    // ── Real-time: notify player via Telegram Bot ─────────────────────────────
    if (request.player?.telegramId && !request.player.isBot) {
      const lang = request.player.language || 'am';
      if (request.type === 'withdrawal') {
        const text = '✅ እንኳን ደስ አለዎት! የገንዘብ ማውጫ ጥያቄዎ ተፈቅዷል። ገንዘቡ በቅርቡ ወደ መለያዎ ይላካል።';
        sendTelegramMessage(request.player.telegramId, text);
      } else {
        const key = 'deposit_approved';
        sendTelegramMessage(
          request.player.telegramId,
          t(key, lang, { amount: finalAmount.toFixed(2), balance: finalBalance.toFixed(2) })
        );
      }
    }

    return res.json({ success: true, message: `Request #${id} approved` });
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { note } = req.body;
    const request = await prisma.pendingRequest.findUnique({ where: { id }, include: { player: true, processedBy: true } });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request already ${request.status}` });
    }

    const existingTx = await prisma.transaction.findFirst({
      where: { pendingRequestId: id }
    });

      let rejectUpdateData = {
        status: 'rejected',
        note: note || request.note,
        processedAt: new Date(),
      };
      if (req.user && req.user.id) {
        if (req.user.role === 'agent') {
          rejectUpdateData.processedByAgentId = req.user.id;
        } else {
          rejectUpdateData.processedById = req.user.id;
        }
      }

    await prisma.$transaction(async (tx) => {
      await tx.pendingRequest.update({
        where: { id },
        data: rejectUpdateData,
      });

      if (existingTx) {
        await tx.transaction.update({
          where: { id: existingTx.id },
          data: { status: 'cancelled' },
        });
      }
    });

    // ── Real-time: notify admin dashboards + player's Telegram Mini App ───────
    if (req.io) {
      req.io.to('admin_room').emit('pending:updated', {
        id,
        type: request.type,
        status: 'rejected',
      });
      if (request.player?.telegramId) {
        req.io.to(`player_${request.player.telegramId}`).emit('pending:rejected', {
          playerId: request.playerId,
          requestId: id,
          type: request.type,
        });
      }
      // ── Real-time: notify revenue dashboards ───────────────────────────────
      req.io.to('admin_room').emit('revenue:updated', {
        type: 'transaction',
        amount: request.amount,
        requestId: id,
      });
    }

    // ── Real-time: notify player via Telegram Bot ─────────────────────────────
    if (request.player?.telegramId && !request.player.isBot) {
      const lang = request.player.language || 'am';
      if (request.type === 'withdrawal') {
        const text = '❌ ይቅርታ፣ የገንዘብ ማውጫ ጥያቄዎ ተቀባይነት አላገኘም። እባክዎ መረጃዎን ያረጋግጡ ወይም አስተዳዳሪውን ያነጋግሩ።';
        sendTelegramMessage(request.player.telegramId, text);
      } else {
        const key = request.type === 'deposit' ? 'deposit_rejected' : 'withdrawal_rejected';
        const reason = note ? `\nReason: ${note}` : '';
        sendTelegramMessage(
          request.player.telegramId,
          t(key, lang, { amount: request.amount.toFixed(2), reason })
        );
      }
    }

    return res.json({ success: true, message: `Request #${id} rejected` });
  } catch (err) { next(err); }
}

async function getStats(req, res, next) {
    try {
      const { type, dateFrom, dateTo, search } = req.query;

      const dateFilter = {};
      if (dateFrom || dateTo) {
        dateFilter.date = {};
        if (dateFrom) dateFilter.date.gte = new Date(`${dateFrom}T00:00:00.000Z`);
        if (dateTo) dateFilter.date.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }

      const searchFilter = search ? {
        OR: [
          { userName: { contains: search, mode: 'insensitive' } },
          { userPhone: { contains: search, mode: 'insensitive' } },
          { accountNumber: { contains: search, mode: 'insensitive' } },
        ]
      } : {};

      const baseFilter = { ...dateFilter, ...searchFilter };
      if (type) baseFilter.type = type;

      const [pendingDeposits, pendingWithdrawals, totalDepositAmount, totalWithdrawalAmount] = await Promise.all([
        prisma.pendingRequest.count({ where: { ...baseFilter, status: 'pending', type: 'deposit' } }),
        prisma.pendingRequest.count({ where: { ...baseFilter, status: 'pending', type: 'withdrawal' } }),
        prisma.pendingRequest.aggregate({
          where: { ...baseFilter, status: 'approved', type: 'deposit' },
          _sum: { amount: true },
        }),
        prisma.pendingRequest.aggregate({
          where: { ...baseFilter, status: 'approved', type: 'withdrawal' },
          _sum: { amount: true },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          pendingDeposits,
          pendingWithdrawals,
          totalDepositAmount: totalDepositAmount._sum.amount || 0,
          totalWithdrawalAmount: totalWithdrawalAmount._sum.amount || 0,
        },
      });
    } catch (err) { next(err); }
  }

module.exports = { list, approve, reject, getStats };
