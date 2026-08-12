/**
 * Refresh Token Service
 * Handles refresh token generation, validation, and rotation for enhanced security
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const REFRESH_TOKEN_EXPIRY = 10 * 60 * 1000; // 10 minutes in milliseconds for rotation
const ACCESS_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Generate a secure random refresh token
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate JWT access token
 */
function generateAccessToken(id, userType, role) {
  return jwt.sign(
    { id, userType, role },
    JWT_SECRET,
    { expiresIn: '7d' } // 7 days
  );
}

/**
 * Create refresh token in database
 */
async function createRefreshToken(userId, userType) {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  // Delete any existing non-revoked tokens for this user
  await prisma.refreshToken.deleteMany({
    where: {
      userId,
      userType,
      revokedAt: null,
    },
  });

  // Create new refresh token
  const refreshToken = await prisma.refreshToken.create({
    data: {
      token,
      userId,
      userType,
      expiresAt,
    },
  });

  console.log('🔄 Created refresh token for user:', userId, userType);
  return refreshToken;
}

/**
 * Validate refresh token and return user info
 */
async function validateRefreshToken(token) {
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (!refreshToken) {
    console.log('❌ Refresh token not found');
    return null;
  }

  if (refreshToken.revokedAt) {
    console.log('❌ Refresh token already revoked');
    return null;
  }

  if (new Date() > refreshToken.expiresAt) {
    console.log('❌ Refresh token expired');
    // Delete expired token
    await prisma.refreshToken.delete({ where: { id: refreshToken.id } });
    return null;
  }

  return refreshToken;
}

/**
 * Rotate refresh token (old token -> new token)
 */
async function rotateRefreshToken(oldToken) {
  const oldRefreshToken = await validateRefreshToken(oldToken);
  
  if (!oldRefreshToken) {
    throw new Error('Invalid or expired refresh token');
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: oldRefreshToken.id },
    data: { revokedAt: new Date() },
  });

  // Create new refresh token
  const newRefreshToken = await createRefreshToken(
    oldRefreshToken.userId,
    oldRefreshToken.userType
  );

  // Generate new access token
  const user = await getUserById(oldRefreshToken.userId, oldRefreshToken.userType);
  const newAccessToken = generateAccessToken(
    user.id,
    oldRefreshToken.userType,
    user.role
  );

  console.log('🔄 Rotated refresh token for user:', oldRefreshToken.userId);
  
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken.token,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Revoke refresh token
 */
async function revokeRefreshToken(token) {
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (refreshToken) {
    await prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: new Date() },
    });
    console.log('🔒 Revoked refresh token for user:', refreshToken.userId);
  }
}

/**
 * Revoke all refresh tokens for a user
 */
async function revokeAllUserTokens(userId, userType) {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      userType,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  console.log('🔒 Revoked all refresh tokens for user:', userId);
}

/**
 * Clean up expired refresh tokens (should be run periodically)
 */
async function cleanupExpiredTokens() {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
  console.log('🧹 Cleaned up expired refresh tokens:', result.count);
  return result.count;
}

/**
 * Get user by ID and type
 */
async function getUserById(userId, userType) {
  if (userType === 'admin') {
    return await prisma.adminUser.findUnique({
      where: { id: userId },
      select: { id: true, role: true, username: true },
    });
  } else if (userType === 'agent') {
    return await prisma.agent.findUnique({
      where: { id: userId },
      select: { id: true, role: true, username: true },
    });
  }
  return null;
}

module.exports = {
  generateRefreshToken,
  generateAccessToken,
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  REFRESH_TOKEN_EXPIRY,
  ACCESS_TOKEN_EXPIRY,
};
