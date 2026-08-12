/**
 * Player routes — player management for admin panel
 */

const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('super_admin', 'admin', 'agent'), playerController.list);
router.get('/stats', authenticate, authorize('super_admin', 'admin', 'agent'), playerController.getStats);
router.get('/:id', authenticate, authorize('super_admin', 'admin', 'agent'), playerController.getOne);
router.get('/:id/telegram-photo', authenticate, playerController.getTelegramPhoto);
router.get('/:id/games', authenticate, playerController.getPlayerGames);
router.put('/:id/status', authenticate, authorize('super_admin', 'admin', 'agent'), playerController.updateStatus);
router.put('/:id/balance', authenticate, authorize('super_admin', 'admin', 'agent'), playerController.updateBalance);
router.put('/:id/language', authenticate, playerController.updateLanguage);


module.exports = router;
