/**
 * Auth Controller — handles admin/agent login with enhanced security
 * Implements refresh token rotation, device detection, and modern JWT practices
 * Similar to Google's security system
 */

const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  createRefreshToken, 
  rotateRefreshToken, 
  revokeRefreshToken, 
  revokeAllUserTokens 
} = require('../services/refreshTokenService');
const { createDeviceOtp, validateDeviceOtp } = require('../services/otpService');
const { extractDeviceInfo, generateDeviceName } = require('../middleware/deviceFingerprint');
const { 
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
  checkSuspiciousActivity 
} = require('../services/deviceService');
const { getLocationFromIP, getFormattedLocation } = require('../services/geoLocationService');
const { sendDeviceApprovalEmail } = require('../services/emailService');

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
async function login(req, res, next) {
  try {
    console.log('🔐 LOGIN REQUEST RECEIVED');
    console.log('📦 Request body:', { username: req.body?.username, hasPassword: !!req.body?.password });
    console.log('🔑 Device fingerprint:', req.deviceFingerprint);
    console.log('📱 Device info:', req.deviceInfo);
    
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('❌ Missing username or password');
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    // Extract device information
    const deviceInfo = extractDeviceInfo(req);
    if (req.body?.deviceFingerprint) {
      deviceInfo.deviceFingerprint = req.body.deviceFingerprint;
    }
    console.log('🔍 Raw Device Info from extractDeviceInfo:', {
      userAgent: req.headers['user-agent'],
      deviceFingerprint: deviceInfo.deviceFingerprint,
      deviceInfo: deviceInfo
    });

    // Try AdminUser first
    console.log('🔍 Looking up user:', username);
    let user = await prisma.adminUser.findUnique({ where: { username } });
    let userType = 'admin';
    console.log('👤 Admin user found:', !!user);

    // Fallback to Agent
    if (!user) {
      console.log('🔍 Looking up agent:', username);
      user = await prisma.agent.findUnique({ where: { username } });
      userType = 'agent';
      console.log('👤 Agent user found:', !!user);
    }

    if (!user) {
      console.log('❌ User not found');
      // Log failed login attempt
      await logLoginAttempt({
        username,
        ipAddress: deviceInfo.ipAddress,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        userAgent: deviceInfo.userAgent,
        success: false,
        failureReason: 'invalid_credentials',
      });
      
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    console.log('✅ User found, checking status...');
    if (!user.status) {
      console.log('❌ User account is suspended');
      await logLoginAttempt({
        userId: user.id,
        userType,
        username,
        ipAddress: deviceInfo.ipAddress,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        userAgent: deviceInfo.userAgent,
        success: false,
        failureReason: 'account_suspended',
      });
      
      return res.status(403).json({ success: false, message: 'Account is suspended' });
    }

    console.log('✅ User status is active, verifying password...');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('🔑 Password valid:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Invalid password');
      await logLoginAttempt({
        userId: user.id,
        userType,
        username,
        ipAddress: deviceInfo.ipAddress,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        userAgent: deviceInfo.userAgent,
        success: false,
        failureReason: 'invalid_password',
      });
      
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    console.log('✅ Password valid, checking device status...');

    // Check device status
    const deviceStatus = await checkDeviceStatus(deviceInfo.deviceFingerprint);
    console.log('📱 Device status:', deviceStatus);
    
    if (deviceStatus.exists && deviceStatus.isBlocked) {
      console.log('❌ Device is blocked');
      await logLoginAttempt({
        userId: user.id,
        userType,
        username,
        ipAddress: deviceInfo.ipAddress,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        userAgent: deviceInfo.userAgent,
        success: false,
        failureReason: 'device_blocked',
      });
      
      const blockedDevice = deviceStatus.device;
      return res.status(403).json({ 
        success: false, 
        message: 'This device has been blocked. Please contact administrator.',
        deviceBlocked: true,
        deviceId: blockedDevice.id,
        deviceName: blockedDevice.deviceName,
        blockedAt: blockedDevice.blockedAt,
        failedOtpAttempts: blockedDevice.failedOtpAttempts,
      });
    }

    // Check if device is pending approval - generate new OTP and allow OTP input
    if (deviceStatus.exists && deviceStatus.isPendingApproval) {
      console.log('📱 Device is pending approval, generating new OTP...');
      
      // Generate new OTP for device approval
      const otp = await createDeviceOtp(deviceStatus.device.id);
      console.log('🔐 OTP generated for pending device:', otp.code);
      
      // Get admin email for OTP notification
      let adminEmail = process.env.ADMIN_EMAIL || user.email;
      
      // If user is not admin, get first admin user's email
      if (userType !== 'admin') {
        const adminUser = await prisma.adminUser.findFirst({
          where: { status: true },
          select: { email: true }
        });
        if (adminUser) {
          adminEmail = adminUser.email;
        }
      }
      
      console.log('📧 Sending OTP to admin email:', adminEmail);
      
      // Send approval email with OTP to admin
      await sendDeviceApprovalEmail(adminEmail, {
        deviceName: deviceStatus.device.deviceName,
        deviceType: deviceStatus.device.deviceType,
        platform: deviceStatus.device.platform,
        browser: deviceStatus.device.browser,
        ipAddress: deviceStatus.device.ipAddress,
        country: deviceStatus.device.country,
        city: deviceStatus.device.city,
        deviceId: deviceStatus.device.id,
      }, otp.code);

      await logLoginAttempt({
        userId: user.id,
        userType,
        username,
        ipAddress: deviceInfo.ipAddress,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        userAgent: deviceInfo.userAgent,
        success: false,
        failureReason: 'pending_approval',
      });

      return res.status(403).json({ 
        success: false, 
        message: 'Device is pending approval. Please enter the verification code sent to your administrator.',
        requiresApproval: true,
        requiresOtp: true,
        deviceId: deviceStatus.device.id,
        deviceInfo: {
          deviceName: deviceStatus.device.deviceName,
          deviceType: deviceStatus.device.deviceType,
          platform: deviceStatus.device.platform,
          browser: deviceStatus.device.browser,
          ipAddress: deviceStatus.device.ipAddress,
          country: deviceStatus.device.country,
          city: deviceStatus.device.city,
        },
      });
    }

    // Register/update device with location data
    const locationData = getLocationFromIP(deviceInfo.ipAddress);
    console.log('🌍 Location data for device:', locationData);
    
    const { device, isNew } = await registerDevice(user.id, userType, deviceInfo, locationData);

    // Only send email for new devices (pending check already done above)
    if (isNew) {
      // Generate OTP for device approval
      const otp = await createDeviceOtp(device.id);
      console.log('🔐 OTP generated for device approval:', otp.code);
      
      // Get admin email for OTP notification
      let adminEmail = process.env.ADMIN_EMAIL || user.email;
      
      // If user is not admin, get first admin user's email
      if (userType !== 'admin') {
        const adminUser = await prisma.adminUser.findFirst({
          where: { status: true },
          select: { email: true }
        });
        if (adminUser) {
          adminEmail = adminUser.email;
        }
      }
      
      console.log('📧 Sending OTP to admin email:', adminEmail);
      
      // Create security alert for new device
      await createSecurityAlert({
        userId: user.id,
        userType,
        alertType: 'new_device',
        severity: 'medium',
        title: 'New Device Login Attempt',
        message: `A new device is trying to access your account. An approval code has been sent to the administrator.`,
        metadata: {
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          platform: device.platform,
          browser: device.browser,
          ipAddress: device.ipAddress,
          country: device.country,
          city: device.city,
        },
      });

      // Send approval email with OTP to admin
      await sendDeviceApprovalEmail(adminEmail, {
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        platform: device.platform,
        browser: device.browser,
        ipAddress: device.ipAddress,
        country: device.country,
        city: device.city,
        deviceId: device.id,
      }, otp.code);

      return res.status(403).json({ 
        success: false, 
        message: 'Device is pending approval. Please wait for administrator approval.',
        requiresApproval: true,
        requiresOtp: true,
        deviceId: device.id,
        deviceInfo: {
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          platform: device.platform,
          browser: device.browser,
          ipAddress: device.ipAddress,
          country: device.country,
          city: device.city,
        },
      });
    }

    // Check for suspicious activity
    const suspiciousActivity = await checkSuspiciousActivity(user.id, userType);
    if (suspiciousActivity.suspicious) {
      await createSecurityAlert({
        userId: user.id,
        userType,
        alertType: 'suspicious_activity',
        severity: 'high',
        title: 'Suspicious Login Activity Detected',
        message: `Suspicious activity detected: ${suspiciousActivity.reason}`,
        metadata: suspiciousActivity,
      });
    }

    // Record the login so the Agents dashboard can derive a real "live" status
    if (userType === 'agent') {
      await prisma.agent.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: userType === 'admin' ? user.role : 'agent',
      userType,
    };

    // Generate short-lived access token
    const accessToken = generateAccessToken(user.id, userType, user.role);

    // Generate refresh token with 5-minute expiry
    const refreshTokenData = await createRefreshToken(user.id, userType);

    // Log successful login
    await logLoginAttempt({
      userId: user.id,
      userType,
      username,
      ipAddress: deviceInfo.ipAddress,
      deviceFingerprint: deviceInfo.deviceFingerprint,
      userAgent: deviceInfo.userAgent,
      success: true,
    });

    return res.json({
      success: true,
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: '7d',
      refreshTokenExpiresIn: '10m',
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: payload.role,
      },
      deviceInfo: {
        isNewDevice: !deviceStatus.exists,
        deviceName: device.deviceName,
        isTrusted: device.isTrusted,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Revokes the refresh token
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      // Revoke the refresh token using service
      await revokeRefreshToken(refreshToken);
    }
    
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * Implements token rotation: old refresh token is revoked, new one is issued
 */
async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refresh token is required' 
      });
    }
    
    // Rotate refresh token and get new tokens
    const tokens = await rotateRefreshToken(refreshToken);
    
    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: '7d',
      refreshTokenExpiresIn: '10m',
    });
  } catch (err) {
    console.error('Token refresh error:', err.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired refresh token' 
    });
  }
}

/**
 * GET /api/auth/me
 * Returns current authenticated user info
 */
async function me(req, res, next) {
  try {
    let user;
    if (req.user.userType === 'agent') {
      user = await prisma.agent.findUnique({
        where: { id: req.user.id },
        select: { id: true, username: true, firstName: true, lastName: true, balance: true, status: true, role: true },
      });
    } else {
      user = await prisma.adminUser.findUnique({
        where: { id: req.user.id },
        select: { id: true, username: true, firstName: true, lastName: true, role: true, status: true },
      });
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, user: { ...user, userType: req.user.userType } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/suspicious-activity
 * Check for suspicious login activity
 */
async function getSuspiciousActivity(req, res, next) {
  try {
    const { userId, userType } = req.user;
    const suspicious = await checkSuspiciousActivity(userId, userType);
    
    return res.json({
      success: true,
      suspicious: suspicious.suspicious,
      reason: suspicious.reason,
      recentAttempts: suspicious.recentAttempts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/validate-otp
 * Validate OTP for device approval
 */
async function validateOtp(req, res, next) {
  try {
    const { otp, deviceId } = req.body;
    
    if (!otp || !deviceId) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP and device ID are required' 
      });
    }
    
    // Validate OTP
    const result = await validateDeviceOtp(otp, parseInt(deviceId));
    
    if (!result.valid) {
      return res.status(400).json({ 
        success: false, 
        message: result.message 
      });
    }
    
    // Approve the device
    const device = await approveDevice(parseInt(deviceId));
    
    // Auto-login upon successful OTP validation
    let user = null;
    if (device.userType === 'admin') {
      user = await prisma.adminUser.findUnique({ where: { id: device.userId } });
    } else {
      user = await prisma.agent.findUnique({ where: { id: device.userId } });
    }

    if (user && user.status) {
      const payload = {
        userId: user.id,
        userType: device.userType,
        username: user.username,
        role: device.userType === 'admin' ? user.role : 'agent',
      };

      const accessToken = generateAccessToken(payload);
      const refreshTokenData = await createRefreshToken(user.id, device.userType);

      return res.json({
        success: true,
        message: 'Device approved successfully.',
        accessToken,
        refreshToken: refreshTokenData.token,
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: payload.role,
        },
      });
    }

    return res.json({
      success: true,
      message: 'Device approved successfully. You can now login.',
    });
  } catch (err) {
    console.error('OTP validation error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error validating OTP' 
    });
  }
}

module.exports = {
  login,
  logout,
  refreshToken,
  me,
  checkSuspiciousActivity: getSuspiciousActivity,
  validateOtp,
};
