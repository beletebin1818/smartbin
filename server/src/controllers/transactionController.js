/**
 * Transaction Controller — ledger history
 */

const prisma = require('../utils/prisma');

async function list(req, res, next) {
  try {
    const { type, page = 0, limit = 30 } = req.query;
    const skip = parseInt(page) * parseInt(limit);
    const where = type ? { type } : {};

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

async function playerHistory(req, res, next) {
  try {
    const playerId = parseInt(req.params.playerId);
    const { page = 0, limit = 20 } = req.query;
    const transactions = await prisma.transaction.findMany({
      where: { playerId },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: transactions });
  } catch (err) { next(err); }
}

async function agentHistory(req, res, next) {
  try {
    const agentId = parseInt(req.params.agentId);
    const { page = 0, limit = 20 } = req.query;
    const transactions = await prisma.transaction.findMany({
      where: { agentId },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: transactions });
  } catch (err) { next(err); }
}

module.exports = { list, playerHistory, agentHistory };
