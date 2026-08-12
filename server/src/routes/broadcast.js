/**
 * Broadcast / messaging routes
 */

const express = require('express');
const router = express.Router();
const broadcastController = require('../controllers/broadcastController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('super_admin', 'admin', 'agent'), broadcastController.list);
router.post('/', authenticate, authorize('super_admin', 'admin', 'agent'), broadcastController.send);
router.post('/send', authenticate, authorize('super_admin', 'admin', 'agent'), broadcastController.send);

module.exports = router;
