/**
 * Admin authentication routes
 * POST /api/auth/login     — admin/agent login → JWT + refresh token
 * POST /api/auth/logout    — revoke refresh token
 * POST /api/auth/refresh   — refresh access token (token rotation)
 * GET  /api/auth/me        — get current user info
 * POST /api/auth/validate-otp — validate OTP for device approval
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/security');

router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refreshToken);
router.get('/me', authenticate, authController.me);
router.post('/validate-otp', otpLimiter, authController.validateOtp);

module.exports = router;
