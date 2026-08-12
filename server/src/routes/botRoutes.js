/**
 * Bot Management Routes — Step 6.4
 * All routes require authentication + super_admin or admin role
 */

'use strict';

const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const { authenticate, authorize } = require('../middleware/auth');

// Apply auth to all bot management routes
const adminAuth = [authenticate, authorize('super_admin', 'admin')];

// Static routes (must be placed before parameterized /:id routes)
router.get('/', adminAuth, botController.getStats);
router.get('/settings', adminAuth, botController.getSettings);
router.put('/settings', adminAuth, botController.updateSettings);
router.post('/create', adminAuth, botController.createBots);
router.post('/reset-balance', adminAuth, botController.resetBalance);

// Parameterized routes
router.get('/:id', adminAuth, botController.getBotProfile);
router.delete('/:id', adminAuth, botController.deleteBot);

module.exports = router;
