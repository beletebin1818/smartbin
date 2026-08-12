/**
 * Admin user management routes
 * All routes require authentication + super_admin or admin role
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// Admin User CRUD
router.get('/', authenticate, authorize('super_admin'), adminController.list);
router.post('/', authenticate, authorize('super_admin'), adminController.create);
router.put('/:id', authenticate, authorize('super_admin'), adminController.update);
router.delete('/:id', authenticate, authorize('super_admin'), adminController.remove);

module.exports = router;
