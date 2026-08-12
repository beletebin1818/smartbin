/**
 * OTP Service - Device Approval
 * Handles 6-digit OTP generation and validation for device approval
 */

const crypto = require('crypto');
const prisma = require('../utils/prisma');

const OTP_EXPIRY_MINUTES = 10; // OTP expires in 10 minutes
const OTP_LENGTH = 6; // 6-digit code
const MAX_OTP_ATTEMPTS = 3; // Block device after 3 failed OTP attempts

/**
 * Generate a secure 6-digit OTP
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Create OTP for device approval
 */
async function createDeviceOtp(deviceId) {
  // Delete any existing OTPs for this device
  await prisma.deviceApprovalOtp.deleteMany({
    where: { deviceId },
  });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const otp = await prisma.deviceApprovalOtp.create({
    data: {
      code,
      deviceId,
      expiresAt,
    },
  });

  console.log(`🔐 OTP generated for device ${deviceId}: ${code} (expires: ${expiresAt})`);
  return otp;
}

/**
 * Validate OTP for device approval
 */
async function validateDeviceOtp(code, deviceId) {
  const otp = await prisma.deviceApprovalOtp.findFirst({
    where: {
      code,
      deviceId,
      used: false,
    },
  });

  if (!otp) {
    console.log(`❌ Invalid OTP for device ${deviceId}`);
    await incrementOtpAttempts(deviceId);
    return { valid: false, message: 'Invalid OTP' };
  }

  if (otp.expiresAt < new Date()) {
    console.log(`❌ OTP expired for device ${deviceId}`);
    await incrementOtpAttempts(deviceId);
    return { valid: false, message: 'OTP expired' };
  }

  // Mark OTP as used
  await prisma.deviceApprovalOtp.update({
    where: { id: otp.id },
    data: {
      used: true,
      usedAt: new Date(),
    },
  });

  // Reset failed attempts on successful validation
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      failedOtpAttempts: 0,
      lastOtpAttemptAt: null,
    },
  });

  console.log(`✅ OTP validated for device ${deviceId}`);
  return { valid: true, message: 'OTP validated successfully' };
}

/**
 * Increment OTP failed attempts and block device if threshold reached
 */
async function incrementOtpAttempts(deviceId) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, failedOtpAttempts: true },
  });

  if (!device) return;

  const newAttempts = (device.failedOtpAttempts || 0) + 1;
  const updateData = {
    failedOtpAttempts: newAttempts,
    lastOtpAttemptAt: new Date(),
  };

  // Block device if max attempts reached
  if (newAttempts >= MAX_OTP_ATTEMPTS) {
    updateData.isBlocked = true;
    updateData.isPendingApproval = false;
    updateData.blockedAt = new Date();
    console.log(`🚫 Device ${deviceId} blocked after ${newAttempts} failed OTP attempts`);
  }

  await prisma.device.update({
    where: { id: deviceId },
    data: updateData,
  });
}

/**
 * Clean up expired OTPs
 */
async function cleanupExpiredOtps() {
  const result = await prisma.deviceApprovalOtp.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  console.log(`🧹 Cleaned up ${result.count} expired OTPs`);
  return result.count;
}

module.exports = {
  generateOtp,
  createDeviceOtp,
  validateDeviceOtp,
  cleanupExpiredOtps,
};
