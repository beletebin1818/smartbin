/**
 * Agent Controller — agent management + player crediting/debiting
 */

const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');

// An agent counts as "live" if they authenticated within this window.
const LIVE_WINDOW_MS = 5 * 60 * 1000;

const AGENT_SELECT = {
  id: true, username: true, firstName: true, lastName: true,
  phoneNumber: true, balance: true, commissionRate: true, status: true,
  cbeAccount: true, cbeHolder: true, telebirrPhone: true, telebirrHolder: true,
  lastLoginAt: true, createdAt: true,
  admin: { select: { firstName: true, lastName: true } },
};

/**
 * Shape a raw Prisma Agent row (with `admin` relation loaded) into the
 * response format consumed by the Admin Dashboard. `reserved` defaults to 0
 * — callers that need the real reserved-funds figure should merge it in
 * via `attachReserved()`.
 */
function serializeAgent(agent, reservedMap = new Map()) {
  const now = Date.now();
  return {
    id: agent.id,
    username: agent.username,
    firstName: agent.firstName,
    lastName: agent.lastName,
    phoneNumber: agent.phoneNumber,
    balance: agent.balance,
    commissionRate: agent.commissionRate,
    status: agent.status,
    cbeAccount: agent.cbeAccount || null,
    cbeHolder: agent.cbeHolder || null,
    telebirrPhone: agent.telebirrPhone || null,
    telebirrHolder: agent.telebirrHolder || null,
    role: agent.role || 'agent',
    live: !!(agent.lastLoginAt && (now - new Date(agent.lastLoginAt).getTime()) < LIVE_WINDOW_MS),
    reserved: reservedMap.get(agent.id) || 0,
    registeredBy: agent.admin ? `${agent.admin.firstName} ${agent.admin.lastName}`.trim() : 'System',
    createdAt: agent.createdAt,
  };
}

/**
 * Reserved funds = sum of this agent's still-pending deposit/withdrawal
 * requests. Computed live from PendingRequest rather than stored, so it can
 * never drift out of sync with the Pending Requests page.
 */
async function attachReserved(agentIds) {
  if (agentIds.length === 0) return new Map();
  const reservedAgg = await prisma.pendingRequest.groupBy({
    by: ['agentId'],
    where: { status: 'pending', agentId: { in: agentIds } },
    _sum: { amount: true },
  });
  return new Map(reservedAgg.map((r) => [r.agentId, r._sum.amount || 0]));
}

async function list(req, res, next) {
  try {
    const {
      fullName, phone, statusFilter, liveFilter,
      page = 0, limit = 10,
    } = req.query;

    const where = {};
    if (fullName) {
      where.OR = [
        { firstName: { contains: fullName, mode: 'insensitive' } },
        { lastName: { contains: fullName, mode: 'insensitive' } },
      ];
    }
    if (phone) where.phoneNumber = { contains: phone, mode: 'insensitive' };
    if (statusFilter === 'active') where.status = true;
    else if (statusFilter === 'inactive') where.status = false;

    const rows = await prisma.agent.findMany({
      where,
      select: AGENT_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    let serialized = rows.map((r) => serializeAgent(r));
    if (liveFilter === 'live') serialized = serialized.filter((a) => a.live);
    else if (liveFilter === 'offline') serialized = serialized.filter((a) => !a.live);

    const total = serialized.length;
    const p = parseInt(page) || 0;
    const l = parseInt(limit) || 10;
    const pageItems = serialized.slice(p * l, p * l + l);

    const reservedMap = await attachReserved(pageItems.map((a) => a.id));
    const data = pageItems.map((a) => ({ ...a, reserved: reservedMap.get(a.id) || 0 }));

    return res.json({
      success: true,
      data,
      total,
      totalPages: Math.max(1, Math.ceil(total / l)),
    });
  } catch (err) { next(err); }
}

async function getStats(req, res, next) {
  try {
    const now = Date.now();
    const [totalAgents, agentsForLive, walletAgg, reservedAgg] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.findMany({ select: { lastLoginAt: true } }),
      prisma.agent.aggregate({ _sum: { balance: true } }),
      prisma.pendingRequest.aggregate({
        where: { status: 'pending', agentId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const liveAgents = agentsForLive.filter(
      (a) => a.lastLoginAt && (now - new Date(a.lastLoginAt).getTime()) < LIVE_WINDOW_MS
    ).length;

    return res.json({
      success: true,
      data: {
        totalAgents,
        liveAgents,
        totalWalletBalance: walletAgg._sum.balance || 0,
        totalReservedBalance: reservedAgg._sum.amount || 0,
      },
    });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const {
      username, password, firstName, lastName, phoneNumber, commissionRate, status,
      cbeAccount, cbeHolder, telebirrPhone, telebirrHolder, role,
    } = req.body;
    if (!username || !password || !firstName || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const hash = await bcrypt.hash(password, 10);
    const agent = await prisma.agent.create({
      data: {
        username, password: hash, firstName, lastName: lastName || '', phoneNumber,
        commissionRate: commissionRate !== undefined ? (parseFloat(commissionRate) || 0) : 0,
        status: status !== undefined ? Boolean(status) : true,
        cbeAccount: cbeAccount ? String(cbeAccount).trim() : null,
        cbeHolder: cbeHolder ? String(cbeHolder).trim() : null,
        telebirrPhone: telebirrPhone ? String(telebirrPhone).trim() : null,
        telebirrHolder: telebirrHolder ? String(telebirrHolder).trim() : null,
        role: role || 'agent',
        registeredBy: req.user.id,
      },
      select: AGENT_SELECT,
    });

    const syncAccounts = [];
    if (agent.cbeAccount) {
      syncAccounts.push({ agentId: agent.id, method: 'CBE', accountName: agent.cbeHolder || 'Agent CBE', accountNumber: agent.cbeAccount });
    }
    if (agent.telebirrPhone) {
      syncAccounts.push({ agentId: agent.id, method: 'TeleBirr', accountName: agent.telebirrHolder || 'Agent Telebirr', accountNumber: agent.telebirrPhone });
    }
    if (syncAccounts.length > 0) {
      await prisma.agentBankAccount.createMany({ data: syncAccounts });
    }

    if (req.io) {
      req.io.to('admin_room').emit('agents:updated', { id: agent.id, action: 'created' });
    }

    return res.status(201).json({ success: true, data: serializeAgent(agent) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Username or phone number already exists' });
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const {
      username, firstName, lastName, phoneNumber, status, password, commissionRate,
      cbeAccount, cbeHolder, telebirrPhone, telebirrHolder, role,
    } = req.body;
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (status !== undefined) updateData.status = Boolean(status);
    if (commissionRate !== undefined) updateData.commissionRate = parseFloat(commissionRate) || 0;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (cbeAccount !== undefined) updateData.cbeAccount = cbeAccount ? String(cbeAccount).trim() : null;
    if (cbeHolder !== undefined) updateData.cbeHolder = cbeHolder ? String(cbeHolder).trim() : null;
    if (telebirrPhone !== undefined) updateData.telebirrPhone = telebirrPhone ? String(telebirrPhone).trim() : null;
    if (telebirrHolder !== undefined) updateData.telebirrHolder = telebirrHolder ? String(telebirrHolder).trim() : null;
    if (role !== undefined) updateData.role = String(role).trim() || 'agent';

    const agent = await prisma.agent.update({ where: { id }, data: updateData, select: AGENT_SELECT });

    await prisma.agentBankAccount.deleteMany({ where: { agentId: id } });
    const syncAccounts = [];
    if (agent.cbeAccount) {
      syncAccounts.push({ agentId: id, method: 'CBE', accountName: agent.cbeHolder || 'Agent CBE', accountNumber: agent.cbeAccount });
    }
    if (agent.telebirrPhone) {
      syncAccounts.push({ agentId: id, method: 'TeleBirr', accountName: agent.telebirrHolder || 'Agent Telebirr', accountNumber: agent.telebirrPhone });
    }
    if (syncAccounts.length > 0) {
      await prisma.agentBankAccount.createMany({ data: syncAccounts });
    }

    if (req.io) {
      req.io.to('admin_room').emit('agents:updated', { id, action: 'updated' });
    }

    return res.json({ success: true, data: serializeAgent(agent) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Username or phone number already exists' });
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    await prisma.agent.delete({ where: { id } });

    if (req.io) {
      req.io.to('admin_room').emit('agents:updated', { id, action: 'deleted' });
    }

    return res.json({ success: true, message: 'Agent deleted' });
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({ success: false, message: 'Cannot delete an agent with existing players or transaction history' });
    }
    next(err);
  }
}

/**
 * Agent credits a player's balance (manual deposit model)
 * Body: { playerId, amount, note }
 */
async function creditPlayer(req, res, next) {
  try {
    const agentId = parseInt(req.params.agentId);
    const { playerId, amount, note } = req.body;

    if (!playerId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid playerId and amount required' });
    }

    const player = await prisma.player.findUnique({ where: { id: parseInt(playerId) } });
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });

    const [updatedPlayer, tx] = await prisma.$transaction([
      prisma.player.update({
        where: { id: player.id },
        data: { balance: { increment: amount }, totalDeposited: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          type: 'deposit',
          amount,
          balanceBefore: player.balance,
          balanceAfter: player.balance + amount,
          note: note || 'Manual deposit by agent',
          status: 'completed',
          playerId: player.id,
          agentId,
        },
      }),
      prisma.agent.update({
        where: { id: agentId },
        data: { balance: { decrement: amount }, totalDeposited: { increment: amount } },
      }),
    ]);

    if (req.io) {
      req.io.to('admin_room').emit('players:updated', {
        playerId: player.id,
        action: 'balance_updated',
        balance: updatedPlayer.balance,
      });
      if (updatedPlayer.telegramId) {
        req.io.to(`player_${updatedPlayer.telegramId}`).emit('balance:updated', {
          playerId: player.id,
          balance: updatedPlayer.balance,
          type: 'deposit',
          amount
        });
      }
    }

    return res.json({ success: true, message: `Credited ${amount} ETB to player`, newBalance: updatedPlayer.balance });
  } catch (err) { next(err); }
}

/**
 * Agent debits a player's balance (manual withdrawal model)
 * Body: { playerId, amount, note }
 */
async function debitPlayer(req, res, next) {
  try {
    const agentId = parseInt(req.params.agentId);
    const { playerId, amount, note } = req.body;

    if (!playerId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid playerId and amount required' });
    }

    const player = await prisma.player.findUnique({ where: { id: parseInt(playerId) } });
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });
    if (player.balance < amount) {
      return res.status(400).json({ success: false, message: 'Player has insufficient balance' });
    }

    const [updatedPlayer] = await prisma.$transaction([
      prisma.player.update({
        where: { id: player.id },
        data: { balance: { decrement: amount }, totalWithdrawn: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          type: 'withdrawal',
          amount,
          balanceBefore: player.balance,
          balanceAfter: player.balance - amount,
          note: note || 'Manual withdrawal by agent',
          status: 'completed',
          playerId: player.id,
          agentId,
        },
      }),
      prisma.agent.update({
        where: { id: agentId },
        data: { balance: { increment: amount }, totalWithdrawn: { increment: amount } },
      }),
    ]);

    if (req.io) {
      req.io.to('admin_room').emit('players:updated', {
        playerId: player.id,
        action: 'balance_updated',
        balance: updatedPlayer.balance,
      });
      if (updatedPlayer.telegramId) {
        req.io.to(`player_${updatedPlayer.telegramId}`).emit('balance:updated', {
          playerId: player.id,
          balance: updatedPlayer.balance,
          type: 'withdrawal',
          amount
        });
      }
    }

    return res.json({ success: true, message: `Debited ${amount} ETB from player`, newBalance: updatedPlayer.balance });
  } catch (err) { next(err); }
}

async function walletChange(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { type, amount, note } = req.body;

    if (!type || !['deposit', 'withdraw'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    if (type === 'withdraw' && agent.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient agent balance' });
    }

    const isDeposit = type === 'deposit';
    const txType = isDeposit ? 'agent_credit' : 'agent_debit';

    const [updatedAgent] = await prisma.$transaction([
      prisma.agent.update({
        where: { id },
        data: {
          balance: isDeposit ? { increment: numAmount } : { decrement: numAmount },
          ...(isDeposit ? { totalDeposited: { increment: numAmount } } : { totalWithdrawn: { increment: numAmount } }),
        },
        select: AGENT_SELECT,
      }),
      prisma.transaction.create({
        data: {
          type: txType,
          amount: numAmount,
          balanceBefore: agent.balance,
          balanceAfter: isDeposit ? agent.balance + numAmount : agent.balance - numAmount,
          note: note ? String(note).trim() : (isDeposit ? 'Admin agent wallet deposit' : 'Admin agent wallet withdrawal'),
          status: 'completed',
          agentId: agent.id,
        },
      }),
    ]);

    if (req.io) {
      req.io.to('admin_room').emit('agents:updated', { id, action: 'wallet_updated' });
    }

    return res.json({
      success: true,
      message: `Agent balance ${isDeposit ? 'credited' : 'debited'} successfully`,
      data: serializeAgent(updatedAgent),
    });
  } catch (err) { next(err); }
}

/**
 * Get single agent by ID with live reserved balance
 */
async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid agent ID' });

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: AGENT_SELECT,
    });

    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const reservedMap = await attachReserved([agent.id]);
    const data = serializeAgent(agent, reservedMap);

    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

function extractProofUrl(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/(https?:\/\/[^\s"'<>]+)/i);
  return match ? match[1] : null;
}

/**
 * Get detailed transaction history & stats summary for an agent
 */
async function getAgentTransactions(req, res, next) {
  try {
    const agentId = parseInt(req.params.id || req.params.agentId);
    if (isNaN(agentId)) return res.status(400).json({ success: false, message: 'Invalid agent ID' });

    const {
      type, // 'deposit' | 'withdrawal'
      status, // 'all' | 'confirmed' | 'rejected' | 'pending'
      dateFrom,
      dateTo,
      search,
      method, // filter by bank method (e.g., CBE, TeleBirr)
      minAmount, // filter: minimum amount
      maxAmount, // filter: maximum amount
      page = 0,
      limit = 10,
    } = req.query;

    // For Transaction table: match direct agentId or player's agentId
    const agentWhere = {
      OR: [
        { agentId: agentId },
        { player: { agentId: agentId } },
      ],
    };

    // For PendingRequest table: also match requests processed by this agent
    const prAgentWhere = {
      OR: [
        { agentId: agentId },
        { player: { agentId: agentId } },
        { processedByAgentId: agentId },
      ],
    };

    // Date range filter
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Boolean(dateFrom || dateTo);

    // Compute Summary Cards for this agent (within date range)
    // Include both Transaction table AND approved PendingRequests
    const confirmedDepositWhere = {
      ...agentWhere,
      type: { in: ['deposit', 'agent_credit'] },
      status: 'completed',
      ...(hasDate ? { createdAt: dateFilter } : {}),
    };
    const confirmedWithdrawalWhere = {
      ...agentWhere,
      type: { in: ['withdrawal', 'agent_debit'] },
      status: 'completed',
      ...(hasDate ? { createdAt: dateFilter } : {}),
    };
    // Also count approved PendingRequests processed by this agent
    const prDepositWhere = {
      ...prAgentWhere,
      type: 'deposit',
      status: 'approved',
      ...(hasDate ? { createdAt: dateFilter } : {}),
    };
    const prWithdrawalWhere = {
      ...prAgentWhere,
      type: 'withdrawal',
      status: 'approved',
      ...(hasDate ? { createdAt: dateFilter } : {}),
    };

    const [depAgg, depCount, wdAgg, wdCount, prDepAgg, prDepCount, prWdAgg, prWdCount] = await Promise.all([
      prisma.transaction.aggregate({ where: confirmedDepositWhere, _sum: { amount: true } }),
      prisma.transaction.count({ where: confirmedDepositWhere }),
      prisma.transaction.aggregate({ where: confirmedWithdrawalWhere, _sum: { amount: true } }),
      prisma.transaction.count({ where: confirmedWithdrawalWhere }),
      prisma.pendingRequest.aggregate({ where: prDepositWhere, _sum: { amount: true } }),
      prisma.pendingRequest.count({ where: prDepositWhere }),
      prisma.pendingRequest.aggregate({ where: prWithdrawalWhere, _sum: { amount: true } }),
      prisma.pendingRequest.count({ where: prWithdrawalWhere }),
    ]);

    const confirmedDepositsSum = (depAgg._sum.amount || 0) + (prDepAgg._sum.amount || 0);
    const confirmedDepositsCount = (depCount || 0) + (prDepCount || 0);
    const confirmedWithdrawalsSum = (wdAgg._sum.amount || 0) + (prWdAgg._sum.amount || 0);
    const confirmedWithdrawalsCount = (wdCount || 0) + (prWdCount || 0);
    const net = confirmedDepositsSum - confirmedWithdrawalsSum;

    // Filter for Transaction table
    const listWhere = { ...agentWhere };
    listWhere.pendingRequestId = null;

    if (type === 'deposit') {
      listWhere.type = { in: ['deposit', 'agent_credit'] };
    } else if (type === 'withdrawal') {
      listWhere.type = { in: ['withdrawal', 'agent_debit'] };
    }

    if (status === 'confirmed' || status === 'approved') {
      listWhere.status = 'completed';
    } else if (status === 'rejected' || status === 'cancelled') {
      listWhere.status = { in: ['cancelled', 'failed'] };
    } else if (status === 'pending') {
      listWhere.status = 'pending';
    }

    if (hasDate) {
      listWhere.createdAt = dateFilter;
    }

    if (search) {
      listWhere.OR = [
        ...(listWhere.OR || []),
        { player: { firstName: { contains: search, mode: 'insensitive' } } },
        { player: { lastName: { contains: search, mode: 'insensitive' } } },
        { player: { phoneNumber: { contains: search, mode: 'insensitive' } } },
        { note: { contains: search, mode: 'insensitive' } },
        { smsProof: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (method) {
      listWhere.method = { equals: method };
    }

    const minAmt = parseFloat(minAmount);
    const maxAmt = parseFloat(maxAmount);
    if (!isNaN(minAmt) || !isNaN(maxAmt)) {
      listWhere.amount = {};
      if (!isNaN(minAmt)) listWhere.amount.gte = minAmt;
      if (!isNaN(maxAmt)) listWhere.amount.lte = maxAmt;
    }

    // Filter for PendingRequest table (includes requests processed by this agent)
    const prWhere = { ...prAgentWhere };
    
    if (type === 'deposit') {
      prWhere.type = 'deposit';
    } else if (type === 'withdrawal') {
      prWhere.type = 'withdrawal';
    }

    if (status === 'confirmed' || status === 'approved') {
      prWhere.status = 'approved'; // Fetch approved from PendingRequests
    } else if (status === 'rejected' || status === 'cancelled') {
      prWhere.status = 'rejected';
    } else if (status === 'pending') {
      prWhere.status = 'pending';
    } else {
      prWhere.status = { in: ['pending', 'rejected', 'approved'] };
    }

    if (hasDate) {
      prWhere.createdAt = dateFilter;
    }

    if (search) {
      prWhere.OR = [
        ...(prWhere.OR || []),
        { player: { firstName: { contains: search, mode: 'insensitive' } } },
        { player: { lastName: { contains: search, mode: 'insensitive' } } },
        { player: { phoneNumber: { contains: search, mode: 'insensitive' } } },
        { note: { contains: search, mode: 'insensitive' } },
        { smsProof: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (method) {
      prWhere.method = { equals: method };
    }

    if (!isNaN(minAmt) || !isNaN(maxAmt)) {
      prWhere.amount = {};
      if (!isNaN(minAmt)) prWhere.amount.gte = minAmt;
      if (!isNaN(maxAmt)) prWhere.amount.lte = maxAmt;
    }

    const p = parseInt(page) || 0;
    const l = parseInt(limit) || 10;

    // Fetch IDs and merge for pagination
    const [txRecords, prRecords] = await Promise.all([
      prisma.transaction.findMany({ where: listWhere, select: { id: true, createdAt: true } }),
      prisma.pendingRequest.findMany({ where: prWhere, select: { id: true, createdAt: true } }),
    ]);

    const combined = [
      ...txRecords.map(r => ({ ...r, source: 'tx' })),
      ...prRecords.map(r => ({ ...r, source: 'pr' }))
    ];

    combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = combined.length;
    const sliced = combined.slice(p * l, p * l + l);

    const txIds = sliced.filter(r => r.source === 'tx').map(r => r.id);
    const prIds = sliced.filter(r => r.source === 'pr').map(r => r.id);

    const [txRows, prRows] = await Promise.all([
      txIds.length > 0 ? prisma.transaction.findMany({
        where: { id: { in: txIds } },
        include: {
          player: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, username: true } },
          agent: { select: { id: true, firstName: true, lastName: true, username: true } },
        }
      }) : [],
      prIds.length > 0 ? prisma.pendingRequest.findMany({
        where: { id: { in: prIds } },
        include: {
          player: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, username: true } },
          agent: { select: { id: true, firstName: true, lastName: true, username: true } },
          processedBy: { select: { id: true, username: true } },
          processedByAgent: { select: { id: true, username: true } },
          depositVerification: true
        }
      }) : [],
    ]);

    // Re-order the fetched records to match the sliced array
    const data = sliced.map(ref => {
      if (ref.source === 'tx') {
        const tx = txRows.find(t => t.id === ref.id);
        const proofSource = tx.smsProof || tx.note || '';
        const proofUrl = extractProofUrl(proofSource);
        let statusLabel = 'Approved';
        if (tx.status === 'pending') statusLabel = 'Pending';
        else if (['rejected', 'cancelled', 'failed'].includes(tx.status)) statusLabel = 'Rejected';

        const userName = tx.player
          ? `${tx.player.firstName || ''} ${tx.player.lastName || ''}`.trim() || tx.player.username || tx.player.phoneNumber || 'User'
          : (tx.agent ? `${tx.agent.firstName || ''} ${tx.agent.lastName || ''}`.trim() || 'Agent' : 'System');

        return {
          id: `TX-${tx.id}`,
          originalId: tx.id,
          source: 'tx',
          playerId: tx.playerId ? String(tx.playerId) : undefined,
          userName: userName,
          username: tx.player?.username || undefined,
          userPhone: tx.player?.phoneNumber || 'N/A',
          type: tx.type.includes('deposit') || tx.type.includes('credit') ? 'deposit' : 'withdrawal',
          amount: tx.amount,
          method: tx.method || 'Agent Direct',
          accountNumber: tx.accountNumber || undefined,
          accountHolder: tx.accountHolder || undefined,
          agentUsername: tx.agent?.username || undefined,
          date: tx.createdAt.toISOString(),
          status: statusLabel,
          transactionId: tx.id ? `TX-${tx.id}` : undefined,
          verification: proofUrl ? { status: 'VERIFIED', receiptUrl: proofUrl } : undefined,
        };
      } else {
        const pr = prRows.find(p => p.id === ref.id);
        const userName = pr.player
          ? `${pr.player.firstName || ''} ${pr.player.lastName || ''}`.trim() || pr.player.username || pr.player.phoneNumber || 'User'
          : 'User';

        let verificationObj = undefined;
        if (pr.type === 'deposit') {
          verificationObj = pr.depositVerification ? {
            status: pr.depositVerification.status,
            smsAmount: pr.depositVerification.smsAmount,
            receiptAmount: pr.depositVerification.receiptAmount,
            receiptUrl: pr.depositVerification.receiptUrl,
            mismatchFields: pr.depositVerification.mismatchFields,
          } : undefined;
        }

        return {
          id: String(pr.id), // Important: PR id as string for approve/reject actions
          originalId: pr.id,
          source: 'pr',
          playerId: pr.playerId ? String(pr.playerId) : undefined,
          userName: userName,
          username: pr.player?.username || undefined,
          userPhone: pr.player?.phoneNumber || 'N/A',
          type: pr.type,
          amount: pr.amount,
          method: pr.method || undefined,
          accountNumber: pr.accountNumber || undefined,
          accountHolder: pr.accountHolder || undefined,
          agentUsername: pr.processedByAgent?.username || pr.processedBy?.username || pr.agent?.username || undefined,
          date: pr.createdAt.toISOString(),
          status: pr.status.charAt(0).toUpperCase() + pr.status.slice(1),
          transactionId: pr.transactionId || undefined,
          verification: verificationObj,
        };
      }
    });

    return res.json({
      success: true,
      summary: {
        confirmedDepositsSum,
        confirmedDepositsCount,
        confirmedWithdrawalsSum,
        confirmedWithdrawalsCount,
        net,
      },
      data,
      total,
      totalPages: Math.max(1, Math.ceil(total / l)),
    });
  } catch (err) { next(err); }
}

module.exports = { list, getStats, getById, getAgentTransactions, create, update, remove, creditPlayer, debitPlayer, walletChange };


