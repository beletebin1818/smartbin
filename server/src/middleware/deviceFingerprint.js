/**
 * Device Fingerprinting Middleware
 * Generates unique device identifiers and extracts device information
 * Uses professional ua-parser-js library for accurate device detection
 * Similar to Google's device detection system
 */

const crypto = require('crypto');
const UAParser = require('ua-parser-js');

/**
 * Generate a unique device fingerprint from request data
 */
function generateDeviceFingerprint(req) {
  const fingerprintData = {
    userAgent: req.headers['user-agent'] || '',
    acceptLanguage: req.headers['accept-language'] || '',
    acceptEncoding: req.headers['accept-encoding'] || '',
    // Add more factors for better fingerprinting
    screenResolution: req.headers['screen-resolution'] || '',
    timezone: req.headers['timezone'] || '',
    platform: req.headers['sec-ch-ua-platform'] || '',
    browser: req.headers['sec-ch-ua'] || '',
  };

  // Create hash from combined data
  const fingerprintString = Object.values(fingerprintData).join('|');
  return crypto.createHash('sha256').update(fingerprintString).digest('hex');
}

/**
 * Parse user agent to extract device information
 * Uses professional ua-parser-js library for accurate detection
 */
function parseUserAgent(userAgent) {
  if (!userAgent) return { platform: 'Unknown', browser: 'Unknown', deviceType: 'Unknown' };

  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    // Extract platform/OS with version
    let platform = 'Unknown';
    if (result.os && result.os.name) {
      platform = result.os.name;
      if (result.os.version) {
        platform = `${platform} ${result.os.version}`;
      }
    }

    // Extract browser with version
    let browser = 'Unknown';
    if (result.browser && result.browser.name) {
      browser = result.browser.name;
      if (result.browser.version) {
        browser = `${browser} ${result.browser.version}`;
      }
    }

    // Extract device type
    let deviceType = 'desktop';
    if (result.device && result.device.type) {
      deviceType = result.device.type; // mobile, tablet, wearable, console
    } else {
      // Fallback detection
      if (result.os && (result.os.name?.toLowerCase().includes('android') || result.os.name?.toLowerCase().includes('ios'))) {
        deviceType = 'mobile';
      }
    }

    // Get device model if available
    const deviceModel = result.device?.model || '';
    const deviceVendor = result.device?.vendor || '';

    console.log('🔍 UA Parser Result:', {
      os: result.os,
      browser: result.browser,
      device: result.device,
      parsed: { platform, browser, deviceType, deviceModel, deviceVendor }
    });

    return { 
      platform, 
      browser, 
      deviceType,
      deviceModel,
      deviceVendor
    };
  } catch (error) {
    console.error('Error parsing user agent:', error);
    return { platform: 'Unknown', browser: 'Unknown', deviceType: 'Unknown' };
  }
}

/**
 * Extract device information from request
 */
function extractDeviceInfo(req) {
  const userAgent = req.headers['user-agent'] || '';
  console.log('🔍 Raw User Agent:', userAgent);
  
  const parsedUA = parseUserAgent(userAgent);
  
  const deviceInfo = {
    deviceFingerprint: generateDeviceFingerprint(req),
    userAgent: userAgent,
    platform: parsedUA.platform,
    browser: parsedUA.browser,
    deviceType: parsedUA.deviceType,
    ipAddress: getClientIP(req),
  };
  
  // Log for debugging
  console.log('📱 Device Info Extracted:', {
    platform: deviceInfo.platform,
    browser: deviceInfo.browser,
    deviceType: deviceInfo.deviceType,
    ipAddress: deviceInfo.ipAddress,
    userAgent: userAgent.substring(0, 100) + '...',
  });
  
  return deviceInfo;
}

/**
 * Get client IP address considering proxies
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         req.ip;
}

/**
 * Generate a user-friendly device name
 * Uses device model, vendor, and platform for better naming
 */
function generateDeviceName(deviceInfo) {
  const { platform, browser, deviceType, deviceModel, deviceVendor } = deviceInfo;
  
  let deviceName = '';
  
  // Use device model and vendor if available (for mobile devices)
  if (deviceModel && deviceVendor) {
    deviceName = `${deviceVendor} ${deviceModel}`;
  } else if (deviceModel) {
    deviceName = deviceModel;
  } else if (deviceVendor) {
    deviceName = deviceVendor;
  }
  
  // Add platform if no specific device model
  if (!deviceName && platform !== 'Unknown') {
    deviceName = platform;
  }
  
  // Add browser if it's a desktop device
  if (deviceType === 'desktop' && browser !== 'Unknown') {
    deviceName = `${deviceName} - ${browser}`;
  }
  
  // Add device type suffix
  if (deviceType === 'mobile') {
    deviceName = `${deviceName} (Mobile)`;
  } else if (deviceType === 'tablet') {
    deviceName = `${deviceName} (Tablet)`;
  } else if (deviceType === 'wearable') {
    deviceName = `${deviceName} (Watch)`;
  } else if (deviceType === 'console') {
    deviceName = `${deviceName} (Console)`;
  }
  
  // Fallback if everything is unknown
  if (!deviceName || deviceName === 'Unknown') {
    deviceName = 'Unknown Device';
  }
  
  return deviceName;
}

module.exports = {
  generateDeviceFingerprint,
  parseUserAgent,
  extractDeviceInfo,
  getClientIP,
  generateDeviceName,
};
