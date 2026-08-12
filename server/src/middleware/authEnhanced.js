/**
 * Enhanced JWT Authentication Middleware with Refresh Token Support
 * Implements modern security best practices:
 * - Short-lived access tokens (15 minutes)
 * - Refresh token rotation
 * - Token blacklisting support
 * - Secure token generation
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Token configuration
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = '7d';  // Long-lived refresh token
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Generate a secure random token for refresh tokens
 */
function generateSecureToken() {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Generate access token with enhanced security
 */
function generateAccessToken(payload) {
  return jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(), // Unique token ID for revocation
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      algorithm: 'HS256',
    }
  );
}

/**
 * Generate refresh token
 */
function generateRefreshToken(userId, userType) {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  return {
    token,
    expiresAt,
    userId,
    userType,
  };
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    }
    throw error;
  }
}

/**
 * Verify refresh token (signature only, stored in DB)
 */
function verifyRefreshTokenSignature(token) {
  // For refresh tokens, we only verify the format and check against DB
  // The actual validation happens in the controller
  if (!token || typeof token !== 'string' || token.length !== 80) {
    throw new Error('Invalid refresh token format');
  }
  return true;
}

/**
 * Enhanced authentication middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized — no token provided' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    req.tokenId = decoded.jti; // Store token ID for potential revocation
    next();
  } catch (err) {
    if (err.message === 'Access token expired') {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized — invalid token' 
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    req.tokenId = decoded.jti;
  } catch (err) {
    // Ignore errors for optional auth
  }
  
  next();
}

/**
 * Role-based access control middleware
 */
function authorize(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Forbidden — insufficient role' 
      });
    }
    next();
  };
}

/**
 * Check if user owns the resource or has admin role
 */
function checkOwnershipOrAdmin(userIdField = 'userId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }
    
    // Admins and super_admins can access any resource
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }
    
    // Check if user owns the resource
    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    if (resourceUserId && parseInt(resourceUserId) === req.user.id) {
      return next();
    }
    
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden — you do not own this resource' 
    });
  };
}

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  checkOwnershipOrAdmin,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshTokenSignature,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
};
