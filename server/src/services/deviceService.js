/**
 * Device Management Service
 * Handles device registration, verification, and security alerts
 * Similar to Google's device management system
 */

const prisma = require('../utils/prisma');
const { extractDeviceInfo, generateDeviceName } = require('../middleware/deviceFingerprint');
const { sendDeviceApprovalEmail, sendSecurityAlertEmail, sendLoginNotificationEmail } = require('./emailService');
const { getLocationFromIP, getFormattedLocation } = require('./geoLocationService');

/**
 * Register or update device for a user
 */
async function registerDevice(userId, userType, deviceInfo, locationData = null) {
  const { deviceFingerprint, userAgent, platform, browser, deviceType, ipAddress, deviceModel, deviceVendor } = deviceInfo;
  
  // Get location from IP if not provided
  if (!locationData) {
    locationData = getLocationFromIP(ipAddress);
    console.log('🌍 Location from IP:', locationData);
  }
  
  // Check if device already exists
  let device = await prisma.device.findUnique({
    where: { deviceFingerprint },
  });

  if (device) {
    // Update existing device with fresh info, preserving approval status
    const deviceName = generateDeviceName({ platform, browser, deviceType, deviceModel, deviceVendor });
    
    device = await prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        ipAddress: ipAddress || device.ipAddress,
        userAgent: userAgent || device.userAgent,
        platform: platform || device.platform,
        browser: browser || device.browser,
        deviceType: deviceType || device.deviceType,
        deviceName: deviceName,
        country: locationData?.country || device.country,
        city: locationData?.city || device.city,
        // Preserve approval status
        isTrusted: device.isTrusted,
        isBlocked: device.isBlocked,
        isPendingApproval: device.isPendingApproval,
      },
    });
    console.log('🔄 Updated existing device:', deviceName, '(preserving approval status)');
    return { device, isNew: false };
  } else {
    // Create new device
    const deviceName = generateDeviceName({ platform, browser, deviceType, deviceModel, deviceVendor });
    
    device = await prisma.device.create({
      data: {
        userId,
        userType,
        deviceFingerprint,
        deviceName,
        deviceType,
        platform,
        browser,
        userAgent,
        ipAddress,
        country: locationData?.country,
        city: locationData?.city,
        isTrusted: false,
        isBlocked: false,
        isPendingApproval: true,
      },
    });
    console.log('🆕 Created new device:', deviceName);
    return { device, isNew: true };
  }
}

/**
 * Check if device is trusted or blocked
 */
async function checkDeviceStatus(deviceFingerprint) {
  const device = await prisma.device.findUnique({
    where: { deviceFingerprint },
  });

  if (!device) {
    return { exists: false, isTrusted: false, isBlocked: false };
  }

  return {
    exists: true,
    isTrusted: device.isTrusted,
    isBlocked: device.isBlocked,
    isPendingApproval: device.isPendingApproval,
    device,
  };
}

/**
 * Approve a device
 */
async function approveDevice(deviceId, adminUserId = null) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  const updatedDevice = await prisma.device.update({
    where: { id: deviceId },
    data: {
      isTrusted: true,
      isBlocked: false,
      isPendingApproval: false,
      approvedAt: new Date(),
      approvedBy: adminUserId,
      failedOtpAttempts: 0,
      lastOtpAttemptAt: null,
      blockedAt: null,
    },
  });

  console.log(`✅ Device ${deviceId} approved by admin ${adminUserId || 'email link'}`);
  return updatedDevice;
}

/**
 * Block a device
 */
async function blockDevice(deviceId) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    throw new Error('Device not found');
  }

  const updatedDevice = await prisma.device.update({
    where: { id: deviceId },
    data: {
      isBlocked: true,
      isTrusted: false,
      isPendingApproval: false,
    },
  });

  console.log(`🚫 Device ${deviceId} blocked`);
  return updatedDevice;
}

/**
 * Get all devices for a user
 */
async function getUserDevices(userId, userType) {
  return await prisma.device.findMany({
    where: { userId, userType },
    orderBy: { lastSeenAt: 'desc' },
  });
}

/**
 * Remove a device
 */
async function removeDevice(deviceId) {
  return await prisma.device.delete({
    where: { id: deviceId },
  });
}

/**
 * Log login attempt
 */
async function logLoginAttempt(attemptData) {
  return await prisma.loginAttempt.create({
    data: attemptData,
  });
}

/**
 * Create security alert
 */
async function createSecurityAlert(alertData) {
  const alert = await prisma.securityAlert.create({
    data: alertData,
  });

  // Send email notification if email service is configured
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      // Get user email (you may need to add email field to your user models)
      const userEmail = await getUserEmail(alertData.userId, alertData.userType);
      console.log('📧 Attempting to send email to:', userEmail);
      if (userEmail) {
        const emailResult = await sendSecurityAlertEmail(userEmail, alertData);
        console.log('📧 Email result:', emailResult);
      } else {
        console.log('⚠️ No user email found for notifications');
      }
    } catch (error) {
      console.error('❌ Failed to send security alert email:', error);
    }
  } else {
    console.log('⚠️ Email service not configured - missing EMAIL_USER or EMAIL_PASS');
  }

  return alert;
}

/**
 * Get user email for notifications
 */
async function getUserEmail(userId, userType) {
  try {
    if (userType === 'admin') {
      const user = await prisma.adminUser.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email;
    } else if (userType === 'agent') {
      const user = await prisma.agent.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

/**
 * Get recent login attempts for a user
 */
async function getRecentLoginAttempts(userId, limit = 10) {
  return await prisma.loginAttempt.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get unread security alerts for a user
 */
async function getUnreadAlerts(userId, userType) {
  return await prisma.securityAlert.findMany({
    where: { userId, userType, isRead: false },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Mark alert as read
 */
async function markAlertAsRead(alertId) {
  return await prisma.securityAlert.update({
    where: { id: alertId },
    data: { isRead: true },
  });
}

/**
 * Check for suspicious login patterns
 */
async function checkSuspiciousActivity(userId, userType) {
  const recentAttempts = await getRecentLoginAttempts(userId, 20);
  
  // Check for multiple failed attempts
  const failedAttempts = recentAttempts.filter(a => !a.success);
  if (failedAttempts.length >= 5) {
    return {
      suspicious: true,
      reason: 'multiple_failed_attempts',
      count: failedAttempts.length,
    };
  }

  // Check for logins from different countries
  const countries = new Set(recentAttempts.map(a => a.country).filter(Boolean));
  if (countries.size >= 3) {
    return {
      suspicious: true,
      reason: 'multiple_countries',
      countries: Array.from(countries),
    };
  }

  return { suspicious: false };
}

module.exports = {
  registerDevice,
  checkDeviceStatus,
  approveDevice,
  blockDevice,
  getUserDevices,
  removeDevice,
  logLoginAttempt,
  createSecurityAlert,
  getRecentLoginAttempts,
  getUnreadAlerts,
  markAlertAsRead,
  checkSuspiciousActivity,
  getUserEmail,
};
