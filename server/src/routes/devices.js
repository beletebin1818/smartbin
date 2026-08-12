/**
 * Device Management Routes
 * Handles device approval, blocking, and security alerts
 */

const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { authenticate, authorize } = require('../middleware/auth');

// User device management
router.get('/devices', authenticate, deviceController.getMyDevices);
router.delete('/devices/:deviceId', authenticate, deviceController.deleteUserDevice);

// Security alerts
router.get('/security/alerts', authenticate, deviceController.getSecurityAlerts);
router.post('/security/alerts/:alertId/read', authenticate, deviceController.markAlertRead);

// Admin device management
router.post('/devices/:deviceId/approve', authenticate, authorize('super_admin', 'admin'), deviceController.approveUserDevice);
router.post('/devices/:deviceId/block', authenticate, authorize('super_admin', 'admin'), deviceController.blockUserDevice);
router.get('/admin/devices/pending', authenticate, authorize('super_admin', 'admin'), deviceController.getPendingDevices);

// Email-based device approval/blocking (public endpoints for email links)
router.get('/devices/:deviceId/approve-email', deviceController.approveDeviceByEmail);
router.get('/devices/:deviceId/block-email', deviceController.blockDeviceByEmail);

module.exports = router;
