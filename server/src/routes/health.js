/**
 * Health check route — used by uptime monitors & ngrok verification
 */

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'Red Bingos Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime().toFixed(2) + 's',
  });
});

module.exports = router;
