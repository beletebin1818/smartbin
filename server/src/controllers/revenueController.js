/**
 * Revenue Controller — platform wallet & revenue analytics
 *
 * Provides:
 *  - overview:   aggregate revenue summary mapped to the 7 dashboard cards
 *  - ledger:     paginated transaction history filtered by tab (transaction type group)
 *  - updateWallet: direct platform-wallet credit/debit from the Admin Dashboard
 */

const prisma = require('../utils/prisma');

// ─── Transaction-type → tab mapping ───────────────────────────────────────────
// Each wallet-ledger tab corresponds to one or more TransactionType values.
const TAB_TYPE_MAP = {
  game:   ['bet', 'win'],
  agent:  ['agent_credit', 'agent_debit'],
  player: ['deposit', 'withdrawal'],
  bonus:  ['bonus'],
  direct: ['refund'],
};

// ─── Source labels shown in the ledger table ──────────────────────────────────
const TAB_SOURCE_LABELS = {
  game:   'Game Share',
  agent:  'Agent Commission',
  player: 'Player Deposit',
  bonus:  'Bonus Grant',
  direct: 'Direct Transfer',
};

// ─── Type → credited/debited ──────────────────────────────────────────────────
const CREDITED_TYPES = new Set(['deposit', 'win', 'bonus', 'agent_credit']);
// everything else (withdrawal, bet, refund, agent_debit) is a debit

// ─── Overview ─────────────────────────────────────────────────────────────────

/**
 * GET /api/revenue
 *
 * Returns the 7 RevenueSummaryCard objects that the admin dashboard renders.
 * Every value is computed live from the database — no mock data.
 */
async function overview(req, res, next) {
  try {
    const [
      totalPlayers,
      totalAgents,
      totalGames,
      completedGames,
      depositAgg,
      withdrawalAgg,
      winAgg,
      betAgg,
      bonusPlayerAgg,
      bonusDirectAgg,
      agentCreditAgg,
      agentDebitAgg,
      refundDirectAgg,
    ] = await Promise.all([
      prisma.player.count(),
      prisma.agent.count(),
      prisma.game.count(),
      prisma.game.count({ where: { status: 'completed' } }),
      prisma.transaction.aggregate({ where: { type: 'deposit' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'withdrawal' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'win' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'bet' }, _sum: { amount: true } }),
      // bonus given to players (has a playerId)
      prisma.transaction.aggregate({
        where: { type: 'bonus', playerId: { not: null } },
        _sum: { amount: true },
      }),
      // bonus given directly to platform wallet (no playerId)
      prisma.transaction.aggregate({
        where: { type: 'bonus', playerId: null },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({ where: { type: 'agent_credit' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'agent_debit' }, _sum: { amount: true } }),
      // refunds on the platform wallet (no playerId)
      prisma.transaction.aggregate({
        where: { type: 'refund', playerId: null },
        _sum: { amount: true },
      }),
    ]);

    const totalDeposited    = depositAgg._sum.amount       || 0;
    const totalWithdrawn    = withdrawalAgg._sum.amount    || 0;
    const totalWinsPaid     = winAgg._sum.amount           || 0;
    const totalBets         = betAgg._sum.amount           || 0;
    const totalBonusPlayers = bonusPlayerAgg._sum.amount   || 0;
    const totalBonusDirect  = bonusDirectAgg._sum.amount   || 0;
    const totalAgentCredit  = agentCreditAgg._sum.amount   || 0;
    const totalAgentDebit   = agentDebitAgg._sum.amount    || 0;
    const totalRefundDirect = refundDirectAgg._sum.amount  || 0;

    const platformRevenue = totalBets - totalWinsPaid;
    const globalBalance   = totalDeposited - totalWithdrawn;

    // ── Build the 7 summary cards ──────────────────────────────────────────
    const summaryCards = [
      {
        id: 'wallet-balance',
        title: 'Wallet Balance',
        amount: globalBalance,
        currency: 'ETB',
        subtitle: `Total Credits: ${totalDeposited}, Total Debits: ${totalWithdrawn}`,
        iconType: 'wallet',
      },
      {
        id: 'game-share',
        title: 'Game Share Revenue',
        amount: platformRevenue,
        currency: 'ETB',
        subtitle: `Credits: ${totalBets}, Debits: ${totalWinsPaid}`,
        iconType: 'game',
      },
      {
        id: 'player-bonus',
        title: 'Player Joining Bonus',
        amount: -totalBonusPlayers,
        currency: 'ETB',
        subtitle: `Players Joined: ${totalPlayers}`,
        iconType: 'bonus',
      },
      {
        id: 'both-wallet',
        title: 'Both Wallet Change',
        amount: (totalAgentCredit - totalAgentDebit) + (totalDeposited - totalWithdrawn),
        currency: 'ETB',
        subtitle: `Credits: ${totalAgentCredit + totalDeposited}, Debits: ${totalAgentDebit + totalWithdrawn}`,
        iconType: 'arrows',
      },
      {
        id: 'agent-wallet',
        title: 'Agent Wallet Change',
        amount: totalAgentCredit - totalAgentDebit,
        currency: 'ETB',
        subtitle: `Credits: ${totalAgentCredit}, Debits: ${totalAgentDebit}`,
        iconType: 'agent',
      },
      {
        id: 'player-wallet',
        title: 'Player Wallet Change',
        amount: totalDeposited - totalWithdrawn,
        currency: 'ETB',
        subtitle: `Credits: ${totalDeposited}, Debits: ${totalWithdrawn}`,
        iconType: 'player',
      },
      {
        id: 'direct-revenue',
        title: 'Direct Revenue Change',
        amount: totalBonusDirect - totalRefundDirect,
        currency: 'ETB',
        subtitle: `Credits: ${totalBonusDirect}, Debits: ${totalRefundDirect}`,
        iconType: 'direct',
      },
    ];

    return res.json({ success: true, data: summaryCards });
  } catch (err) { next(err); }
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

/**
 * GET /api/revenue/ledger
 *
 * Query params:
 *   types  – comma-separated TransactionType values (e.g. "bet,win")
 *   page   – 0-indexed page number (default 0)
 *   limit  – page size (default 30)
 *
 * Returns paginated transactions with player/agent info, plus total count
 * so the frontend can compute totalPages.
 */
async function ledger(req, res, next) {
  try {
    const { types, page = 0, limit = 30 } = req.query;
    const skip = parseInt(page) * parseInt(limit);

    const where = {};
    if (types) {
      const typeList = types.split(',').map(t => t.trim()).filter(Boolean);
      if (typeList.length > 0) {
        where.type = { in: typeList };
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          player: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
          agent: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    return res.json({ success: true, data: transactions, total });
  } catch (err) { next(err); }
}

// ─── Update Wallet (direct platform-wallet adjustment) ────────────────────────

/**
 * POST /api/revenue/wallet
 *
 * Body: { type: 'credit' | 'debit', amount: number, description?: string }
 *
 * Creates a platform-level transaction (no player/agent) and emits a
 * `revenue:updated` socket event so every Admin Dashboard page — including
 * the Revenue page — refreshes in real time.
 */
async function updateWallet(req, res, next) {
  try {
    const { type, amount, description } = req.body;

    if (!type || !['credit', 'debit'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid type. Must be "credit" or "debit".' });
    }

    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive amount required.' });
    }

    // Map admin-facing type to a TransactionType
    //   credit → bonus  (money flowing into the platform wallet)
    //   debit  → refund  (money flowing out of the platform wallet)
    const txType = type === 'credit' ? 'bonus' : 'refund';
    const note = `Direct wallet ${type} by admin${description ? `: ${description}` : ''}`.trim();

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          type: txType,
          amount: parsedAmount,
          balanceBefore: 0,
          balanceAfter: 0,
          note,
          status: 'completed',
        },
      });
    });

    // ── Real-time: notify all admin dashboards ──────────────────────────────
    if (req.io) {
      req.io.to('admin_room').emit('revenue:updated', {
        type,
        amount: parsedAmount,
        description: description || '',
      });
    }

    return res.status(201).json({
      success: true,
      message: `Wallet ${type} of ${parsedAmount} ETB recorded successfully.`,
    });
  } catch (err) { next(err); }
}

module.exports = { overview, ledger, updateWallet, TAB_TYPE_MAP, TAB_SOURCE_LABELS, CREDITED_TYPES };
