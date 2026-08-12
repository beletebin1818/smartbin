/**
 * Payment accounts routes
 * CRUD operations for PaymentAccount, admin-only.
 */

'use strict';

const express = require('express');
const router = express.Router();
const paymentAccountController = require('../controllers/paymentAccountController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('super_admin', 'admin'), paymentAccountController.list);
router.post('/', authenticate, authorize('super_admin', 'admin'), paymentAccountController.create);
router.put('/:id', authenticate, authorize('super_admin', 'admin'), paymentAccountController.update);
router.delete('/:id', authenticate, authorize('super_admin', 'admin'), paymentAccountController.remove);

module.exports = router;
