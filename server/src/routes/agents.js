/**
 * Agent routes — agent management and player crediting
 * Agents are created by admins; they credit/debit players manually
 */

const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticate, authorize } = require('../middleware/auth');

// Agent CRUD (admin only)
router.get('/', authenticate, authorize('super_admin', 'admin'), agentController.list);
router.get('/stats', authenticate, authorize('super_admin', 'admin'), agentController.getStats);
router.get('/:id', authenticate, authorize('super_admin', 'admin'), agentController.getById);
router.get('/:id/transactions', authenticate, authorize('super_admin', 'admin'), agentController.getAgentTransactions);
router.post('/', authenticate, authorize('super_admin', 'admin'), agentController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), agentController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), agentController.remove);

// Agent wallet deposit/withdrawal (admin only)
router.post('/:id/wallet', authenticate, authorize('super_admin', 'admin'), agentController.walletChange);

// Agent credits a player (agent or admin)
router.post('/:agentId/credit-player', authenticate, authorize('super_admin', 'admin', 'agent'), agentController.creditPlayer);
router.post('/:agentId/debit-player', authenticate, authorize('super_admin', 'admin', 'agent'), agentController.debitPlayer);


module.exports = router;
