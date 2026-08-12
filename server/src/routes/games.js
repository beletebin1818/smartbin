/**
 * Game management routes (admin panel)
 */

const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const cardController = require('../controllers/cardController');
const { authenticate, authorize } = require('../middleware/auth');

// ── Public (no auth) — must be before /:id to avoid param capture ───────────
router.get('/public/lobby',    gameController.getLobbyGame);
router.get('/public/:id',      gameController.getPublicGame);
router.get('/public/settings', gameController.getPublicSettings);
router.patch('/public/:gameId/stake', gameController.updateLobbyStake);

// ── Admin routes (authenticated — super_admin/admin only) ───────────────
const adminAuth = [authenticate, authorize('super_admin', 'admin')];
const agentAuth = [authenticate, authorize('super_admin', 'admin', 'agent')];

router.get('/',          agentAuth, gameController.list);
router.post('/',         agentAuth, gameController.create);
router.get('/live',      agentAuth, gameController.live);
router.get('/settings',  adminAuth, gameController.getSettings);
router.put('/settings',  adminAuth, gameController.updateSettings);
router.get('/:id',       agentAuth, gameController.getOne);

// ── Player-facing card routes ─────────────────────────────────────────────────
router.get('/:gameId/cards',                     cardController.listCards);
router.post('/:gameId/cards/:cardNumber/claim',  cardController.claimCard);
router.delete('/:gameId/cards/:cardNumber/claim', cardController.unclaimCard);

module.exports = router;
