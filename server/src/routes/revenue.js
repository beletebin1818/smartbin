/**
 * Revenue / platform wallet routes
 */

const express = require('express');
const router = express.Router();
const revenueController = require('../controllers/revenueController');
const { authenticate, authorize } = require('../middleware/auth');

const adminAuth = [authenticate, authorize('super_admin', 'admin', 'agent')];

// Overview — 7 summary cards computed live from the database
router.get('/', adminAuth, revenueController.overview);

// Paginated ledger with optional type filtering
router.get('/ledger', adminAuth, revenueController.ledger);

// Direct platform-wallet credit / debit
router.post('/wallet', adminAuth, revenueController.updateWallet);

module.exports = router;
