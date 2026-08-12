/**
 * AgentBankAccount Controller — CRUD for agent bank accounts
 */

const prisma = require('../utils/prisma');

async function listByAgent(req, res, next) {
  try {
    const agentId = parseInt(req.params.agentId);
    if (isNaN(agentId)) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID' });
    }

    const accounts = await prisma.agentBankAccount.findMany({
      where: { agentId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
}

async function listActiveByAgent(req, res, next) {
  try {
    const agentId = parseInt(req.params.agentId);
    if (isNaN(agentId)) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID' });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, status: true },
    });

    if (!agent || !agent.status) {
      return res.json({ success: true, data: [] });
    }

    const accounts = await prisma.agentBankAccount.findMany({
      where: { agentId, isActive: true },
      orderBy: [{ method: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const agentId = parseInt(req.params.agentId);
    if (isNaN(agentId)) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID' });
    }

    const { method, accountName, accountNumber, isActive, displayOrder } = req.body;
    if (!method || !accountName || !accountNumber) {
      return res.status(400).json({ success: false, message: 'method, accountName, and accountNumber are required' });
    }

    const account = await prisma.agentBankAccount.create({
      data: {
        agentId,
        method: String(method).trim(),
        accountName: String(accountName).trim(),
        accountNumber: String(accountNumber).trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder) || 0 : 0,
      },
    });

    return res.status(201).json({ success: true, data: account });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid account ID' });
    }

    const { method, accountName, accountNumber, isActive, displayOrder } = req.body;
    const updateData = {};
    if (method !== undefined) updateData.method = String(method).trim();
    if (accountName !== undefined) updateData.accountName = String(accountName).trim();
    if (accountNumber !== undefined) updateData.accountNumber = String(accountNumber).trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (displayOrder !== undefined) updateData.displayOrder = parseInt(displayOrder) || 0;

    const account = await prisma.agentBankAccount.update({
      where: { id },
      data: updateData,
    });

    return res.json({ success: true, data: account });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid account ID' });
    }

    await prisma.agentBankAccount.delete({ where: { id } });
    return res.json({ success: true, message: 'Bank account deleted' });
  } catch (err) { next(err); }
}

module.exports = {
  listByAgent,
  listActiveByAgent,
  create,
  update,
  remove,
};
