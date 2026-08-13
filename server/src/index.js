/**
 * Red Bingos — Express + Socket.io Server Entry Point
 *
 * Binds to 0.0.0.0:PORT so ngrok can tunnel it for Telegram testing.
 */

require('dotenv').config();

// ── Run Prisma migrations on every startup ───────────────
const { execSync } = require('child_process');
const _path = require('path');
const _schemaPath = _path.resolve(__dirname, '../prisma/schema.prisma');
console.log('🔄 Running Prisma migrations... schema:', _schemaPath);

// If a migration is stuck as "failed" (P3009), mark it as rolled-back so
// migrate deploy can retry it cleanly on this startup.
const _failedMigration = '20260813_add_processed_by_agent_to_pending_request';
try {
  execSync(
    `npx prisma migrate resolve --rolled-back "${_failedMigration}" --schema="${_schemaPath}"`,
    { stdio: 'inherit' }
  );
  console.log(`✅ Resolved stuck migration: ${_failedMigration}`);
} catch (_resolveErr) {
  // Ignore — only fails if migration wasn't actually stuck, which is fine
}

try {
  execSync(`npx prisma migrate deploy --schema="${_schemaPath}"`, { stdio: 'inherit' });
  console.log('✅ Prisma migrations complete.');
} catch (err) {
  console.error('⚠️  Prisma migrate deploy failed:', err.message);
}


const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server: SocketServer } = require('socket.io');
const path = require('path');

// ── Routes ──────────────────────────────────────────────
const healthRoute       = require('./routes/health');
const authRoute         = require('./routes/auth');
const deviceRoute       = require('./routes/devices');
const adminRoute        = require('./routes/admin');
const agentsRoute       = require('./routes/agents');
const agentBankAccountsRoute = require('./routes/agentBankAccounts');
const playersRoute      = require('./routes/players');
const gamesRoute        = require('./routes/games');
const pendingRoute      = require('./routes/pending');
const transactionsRoute = require('./routes/transactions');
const revenueRoute      = require('./routes/revenue');
const broadcastRoute    = require('./routes/broadcast');
const botRoutes         = require('./routes/botRoutes');
const telegramBotRoutes = require('./routes/telegramBotRoutes');
const paymentAccountsRoute = require('./routes/paymentAccounts');

// ── Middleware ───────────────────────────────────────────
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { 
  securityHeaders, 
  authLimiter, 
  apiLimiter, 
  requestSizeLimiter,
  validateOrigin,
  antiClickjacking 
} = require('./middleware/security');
const { extractDeviceInfo } = require('./middleware/deviceFingerprint');

// ── Sockets ──────────────────────────────────────────────
const { initSockets } = require('./sockets');
const gameEngine = require('./services/gameEngine');

// ─────────────────────────────────────────────────────────
//  App Setup
// ─────────────────────────────────────────────────────────
const app = express();

// Trust the first proxy (e.g. Cloudflare, ngrok) to properly resolve X-Forwarded-For for rate-limiting
app.set('trust proxy', 1);

const server = http.createServer(app);

// Socket.io — allow all origins, short ping intervals for Cloudflare Tunnel compatibility
// Cloudflare free tunnel has a 100s HTTP response timeout — keep pingTimeout well below that.
const io = new SocketServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,       // 30s — how long to wait for pong before disconnect
  pingInterval: 10000,      // 10s — how often to send ping
  upgradeTimeout: 10000,
  allowUpgrades: true,
  transports: ['polling', 'websocket'],
});

// ─────────────────────────────────────────────────────────
//  Global Middleware
// ─────────────────────────────────────────────────────────
// Enhanced CORS with origin whitelist and additional security
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : [
      'http://localhost:3000', 
      'http://localhost:3001', 
      'http://localhost:5173',
      'https://agency-shoppers-carbon-advocate.trycloudflare.com',
      'https://yacht-cancel-decision-dsc.trycloudflare.com'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Remove trailing slash for consistent comparison
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ''));
    
    // For development with Cloudflare tunnels, allow all origins
    // In production, you should restrict this to specific origins
    callback(null, true);
    
    // Uncomment below for strict CORS in production
    /*
    if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('CORS policy: Origin not allowed'));
    }
    */
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Forwarded-For', 'X-Refresh-Token'],
  exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24 hours
}));

// Security headers
app.use(securityHeaders);

// CSRF protection for state-changing requests
app.use(validateOrigin);
app.use(antiClickjacking);

// Request size limiter
app.use(requestSizeLimiter);

// Extract device fingerprint before rate limiting (must be before auth routes)
app.use((req, res, next) => {
  const deviceInfo = extractDeviceInfo(req);
  req.deviceFingerprint = deviceInfo.deviceFingerprint;
  req.deviceInfo = deviceInfo;
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Attach Socket.io instance to every request (useful in controllers later)
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ─────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────
// Health check (no rate limiting)
app.use('/health',             healthRoute);

// Auth routes with rate limiting applied in routes file
app.use('/api/auth',           authRoute);

// Device management routes
app.use('/api',                apiLimiter, deviceRoute);

// Admin and agent routes with rate limiting
app.use('/api/admin-users',    apiLimiter, adminRoute);
app.use('/api/agents',         apiLimiter, agentsRoute);
app.use('/api/agent-bank-accounts', apiLimiter, agentBankAccountsRoute);
app.use('/api/players',        apiLimiter, playersRoute);
app.use('/api/games',          apiLimiter, gamesRoute);
app.use('/api/pending',        apiLimiter, pendingRoute);
app.use('/api/transactions',   apiLimiter, transactionsRoute);
app.use('/api/revenue',        apiLimiter, revenueRoute);
app.use('/api/broadcast',      apiLimiter, broadcastRoute);
app.use('/api/admin/broadcast', apiLimiter, broadcastRoute);
app.use('/api/admin/bots',     apiLimiter, botRoutes);
app.use('/api/admin/payment-accounts', apiLimiter, paymentAccountsRoute);
app.use('/api/bot',            telegramBotRoutes);

// Serve mini-app static files
app.use(express.static(path.join(__dirname, '../mini-app/dist')));

// ─────────────────────────────────────────────────────────
//  404 + Error Handlers (must be last)
// ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─────────────────────────────────────────────────────────
//  Socket.io Events
// ─────────────────────────────────────────────────────────
initSockets(io);

// ─────────────────────────────────────────────────────────
//  Start Server
// ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Run: fuser -k ${PORT}/tcp`);
    process.exit(1);
  } else {
    throw err;
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        🎰  Red Bingos Backend            ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  HTTP   →  http://${HOST}:${PORT}         ║`);
  console.log(`║  WS     →  ws://${HOST}:${PORT}           ║`);
  console.log(`║  Health →  http://localhost:${PORT}/health ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Auto-create initial waiting game if none exists
  gameEngine.autoCreateNextGame(io);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully...');
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };
