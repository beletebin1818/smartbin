/**
 * Agent Bank Account routes — CRUD for agent bank accounts
 */

const express = require('express');
const router = express.Router();
const agentBankAccountController = require('../controllers/agentBankAccountController');
const { authenticate, authorize } = require('../middleware/auth');

// List all bank accounts for an agent (admin only)
router.get('/agents/:agentId/bank-accounts', authenticate, authorize('super_admin', 'admin'), agentBankAccountController.listByAgent);

// List active bank accounts for an agent (public - for bot deposit flow)
router.get('/agents/:agentId/bank-accounts/active', agentBankAccountController.listActiveByAgent);

// Create bank account for an agent (admin only)
router.post('/agents/:agentId/bank-accounts', authenticate, authorize('super_admin', 'admin'), agentBankAccountController.create);

// Update bank account (admin only)
router.put('/bank-accounts/:id', authenticate, authorize('super_admin', 'admin'), agentBankAccountController.update);

// Delete bank account (admin only)
router.delete('/bank-accounts/:id', authenticate, authorize('super_admin', 'admin'), agentBankAccountController.remove);

module.exports = router;
