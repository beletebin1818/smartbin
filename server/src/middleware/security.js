/**
 * Security Middleware
 * Implements modern security best practices including:
 * - Security headers (Helmet-like functionality)
 * - Rate limiting
 * - Request validation
 * - CSRF protection
 */

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

/**
 * Security Headers Middleware
 * Adds OWASP recommended security headers with enhanced protection
 */
function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy - enhanced
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (enhanced)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);
  
  // HSTS (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Permissions policy (enhanced)
  const permissionsPolicy = [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', ');
  
  res.setHeader('Permissions-Policy', permissionsPolicy);
  
  // Additional security headers
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Cache control for sensitive endpoints
  if (req.path.startsWith('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
}

/**
 * Rate Limiter for OTP Validation
 * More lenient than auth limiter since OTP is time-limited and single-use
 */
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 OTP validation attempts per hour
  keyGenerator: (req) => {
    const key = req.deviceFingerprint || req.ip || 'anonymous';
    console.log('🔒 OTP rate limiter key:', key);
    return key;
  },
  message: { 
    success: false, 
    message: 'Too many verification attempts. Please try again later.',
    rateLimitExceeded: true,
    remainingAttempts: 0
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    console.log('⚠️ OTP rate limit exceeded for:', req.deviceFingerprint || req.ip);
    res.status(429).json({
      success: false, 
      message: 'Too many verification attempts. Please try again later.',
      rateLimitExceeded: true,
      remainingAttempts: 0
    });
  },
});

/**
 * Rate Limiter for Authentication Routes
 * Device-based rate limiting (5 attempts per 3 hours per device)
 */
const authLimiter = rateLimit({
  windowMs: 3 * 60 * 60 * 1000, // 3 hours
  max: process.env.NODE_ENV === 'production' ? 5 : 1000, // 5 in prod, 1000 in dev
  keyGenerator: (req) => {
    const key = req.deviceFingerprint || req.ip || 'anonymous';
    console.log('🔒 Rate limiter key:', key);
    return key;
  },
  message: { 
    success: false, 
    message: 'Too many login attempts. Please try again later.',
    rateLimitExceeded: true,
    remainingAttempts: 0
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    console.log('⚠️ Rate limit exceeded for:', req.deviceFingerprint || req.ip);
    res.status(429).json({
      success: false, 
      message: 'Too many login attempts. Please try again later.',
      rateLimitExceeded: true,
      remainingAttempts: 0
    });
  },
});

/**
 * Rate Limiter for API Routes
 * General API rate limiting
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5000 : 50000, // Increased for admin dashboard usage
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate Limiter for Sensitive Operations
 * Stricter limits for operations like password changes, payments, etc.
 */
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 10 : 1000, // 10 in prod, 1000 in dev
  message: { success: false, message: 'Too many sensitive operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Request Size Limiter
 * Prevents large payload attacks
 */
function requestSizeLimiter(req, res, next) {
  const contentLength = req.headers['content-length'];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  
  if (contentLength && parseInt(contentLength) > MAX_SIZE) {
    return res.status(413).json({ 
      success: false, 
      message: 'Request payload too large' 
    });
  }
  next();
}

/**
 * IP Whitelist/Blacklist Middleware
 * Can be used to restrict access to specific IPs
 */
function ipFilter(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Add your whitelist/blacklist logic here
  // Example: const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
  
  next();
}

/**
 * CSRF Protection Middleware
 * Generates and validates CSRF tokens to prevent Cross-Site Request Forgery attacks
 */
const csrfTokens = new Map(); // In production, use Redis or database

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF Token Generation Middleware
 * Generates a CSRF token and adds it to the response
 */
function csrfProtection(req, res, next) {
  // Skip CSRF for GET, HEAD, OPTIONS requests (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API routes that use JWT authentication
  if (req.path.startsWith('/api/') && req.headers['authorization']) {
    return next();
  }

  const token = generateCSRFToken();
  const sessionId = req.sessionID || req.ip || 'anonymous';
  
  // Store token with session identifier
  csrfTokens.set(sessionId, {
    token,
    createdAt: Date.now(),
  });

  // Add CSRF token to response headers
  res.setHeader('X-CSRF-Token', token);
  res.setHeader('X-CSRF-Token-Expiry', (Date.now() + 3600000).toString()); // 1 hour

  // Validate CSRF token for state-changing requests
  const csrfToken = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;
  
  if (!csrfToken) {
    return res.status(403).json({ 
      success: false, 
      message: 'CSRF token missing' 
    });
  }

  const storedToken = csrfTokens.get(sessionId);
  
  if (!storedToken || storedToken.token !== csrfToken) {
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid CSRF token' 
    });
  }

  // Check token expiry (1 hour)
  if (Date.now() - storedToken.createdAt > 3600000) {
    csrfTokens.delete(sessionId);
    return res.status(403).json({ 
      success: false, 
      message: 'CSRF token expired' 
    });
  }

  next();
}

/**
 * Double Submit Cookie CSRF Protection
 * Alternative CSRF protection using double submit cookie pattern
 */
function doubleSubmitCookie(req, res, next) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API routes with JWT
  if (req.path.startsWith('/api/') && req.headers['authorization']) {
    return next();
  }

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ 
      success: false, 
      message: 'CSRF protection: missing tokens' 
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({ 
      success: false, 
      message: 'CSRF protection: token mismatch' 
    });
  }

  next();
}

/**
 * SameSite Cookie Configuration
 * Helps prevent CSRF by setting SameSite attribute on cookies
 */
function sameSiteCookie(req, res, next) {
  // This middleware should be used when setting cookies
  // Example: res.cookie('name', 'value', { sameSite: 'strict', secure: true });
  next();
}

/**
 * Origin/Referer Validation
 * Validates the Origin or Referer header for state-changing requests
 */
function validateOrigin(req, res, next) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API routes with JWT
  if (req.path.startsWith('/api/') && req.headers['authorization']) {
    return next();
  }

  // Skip for development with Cloudflare tunnels
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  // If both are missing, reject the request
  if (!origin && !referer) {
    return res.status(403).json({ 
      success: false, 
      message: 'Origin/Referer header required' 
    });
  }

  // Get allowed origins from environment
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];

  // Check origin if present
  if (origin) {
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ''));
    
    if (!normalizedAllowedOrigins.includes(normalizedOrigin)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid origin header' 
      });
    }
  }

  // Check referer if origin is not present
  if (referer && !origin) {
    try {
      const refererUrl = new URL(referer);
      const normalizedReferer = refererUrl.origin.replace(/\/$/, '');
      const normalizedAllowedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ''));
      
      if (!normalizedAllowedOrigins.includes(normalizedReferer)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid referer header' 
        });
      }
    } catch (err) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid referer header' 
      });
    }
  }

  next();
}

/**
 * Anti-Clickjacking Middleware
 * Additional protection against clickjacking attacks
 */
function antiClickjacking(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
}

module.exports = {
  securityHeaders,
  authLimiter,
  otpLimiter,
  apiLimiter,
  sensitiveLimiter,
  requestSizeLimiter,
  ipFilter,
  csrfProtection,
  doubleSubmitCookie,
  sameSiteCookie,
  validateOrigin,
  antiClickjacking,
  generateCSRFToken,
};
