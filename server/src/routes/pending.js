/**
 * Pending deposit/withdrawal request routes
 */

const express = require('express');
const router = express.Router();
const pendingController = require('../controllers/pendingController');
const { authenticate, authorize } = require('../middleware/auth');

const adminAuth = [authenticate, authorize('super_admin', 'admin', 'agent')];

// List all pending requests
router.get('/', adminAuth, pendingController.list);

// Get pending request stats
router.get('/stats', adminAuth, pendingController.getStats);

// Approve or reject a request
router.put('/:id/approve', adminAuth, pendingController.approve);
router.put('/:id/reject', adminAuth, pendingController.reject);

module.exports = router;
