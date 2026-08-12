/**
 * PaymentAccount Controller — CRUD operations for admins
 */

'use strict';

const prisma = require('../utils/prisma');

async function list(req, res, next) {
  try {
    const accounts = await prisma.paymentAccount.findMany({
      orderBy: { displayOrder: 'asc' },
    });
    return res.json({ success: true, data: accounts });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { method, accountName, accountNumber, isActive, displayOrder } = req.body;
    if (!method || !accountName || !accountNumber) {
      return res.status(400).json({ success: false, message: 'method, accountName, and accountNumber are required' });
    }

    const account = await prisma.paymentAccount.create({
      data: {
        method,
        accountName,
        accountNumber,
        isActive: isActive !== undefined ? isActive : true,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : 0,
      },
    });

    return res.status(201).json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const { method, accountName, accountNumber, receiptPattern, isActive, displayOrder } = req.body;

    const updateData = {};
    if (method !== undefined) updateData.method = method;
    if (accountName !== undefined) updateData.accountName = accountName;
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber;
    if (receiptPattern !== undefined) updateData.receiptPattern = receiptPattern;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (displayOrder !== undefined) updateData.displayOrder = parseInt(displayOrder);

    const account = await prisma.paymentAccount.update({
      where: { id },
      data: updateData,
    });

    return res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    await prisma.paymentAccount.delete({
      where: { id },
    });
    return res.json({ success: true, message: 'Payment account deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
};
