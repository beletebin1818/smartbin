/**
 * Transaction ledger routes
 */

const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('super_admin', 'admin', 'agent'), transactionController.list);
router.get('/player/:playerId', authenticate, authorize('super_admin', 'admin', 'agent'), transactionController.playerHistory);
router.get('/agent/:agentId', authenticate, authorize('super_admin', 'admin', 'agent'), transactionController.agentHistory);

module.exports = router;
