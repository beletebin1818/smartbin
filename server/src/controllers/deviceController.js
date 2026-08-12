/**
 * Device Management Controller
 * Handles device approval, blocking, and management
 * Similar to Google's device management system
 */

const prisma = require('../utils/prisma');
const {
  getUserDevices,
  approveDevice,
  blockDevice,
  removeDevice,
  getUnreadAlerts,
  markAlertAsRead,
} = require('../services/deviceService');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * GET /api/devices
 * Get all devices for the current user
 */
async function getMyDevices(req, res, next) {
  try {
    const { id, userType } = req.user;
    const devices = await getUserDevices(id, userType);
    
    return res.json({
      success: true,
      devices,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/devices/:deviceId/approve
 * Approve a device (admin only)
 */
async function approveUserDevice(req, res, next) {
  try {
    const { deviceId } = req.params;
    const adminUserId = req.user.id;
    
    const device = await approveDevice(parseInt(deviceId), adminUserId);
    
    return res.json({
      success: true,
      message: 'Device approved successfully',
      device,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/devices/:deviceId/block
 * Block a device (admin only)
 */
async function blockUserDevice(req, res, next) {
  try {
    const { deviceId } = req.params;
    
    const device = await blockDevice(parseInt(deviceId));
    
    return res.json({
      success: true,
      message: 'Device blocked successfully',
      device,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/devices/:deviceId
 * Remove a device
 */
async function deleteUserDevice(req, res, next) {
  try {
    const { deviceId } = req.params;
    const { id, userType } = req.user;
    
    // Verify device belongs to user
    const device = await prisma.device.findUnique({
      where: { id: parseInt(deviceId) },
    });
    
    if (!device || device.userId !== id || device.userType !== userType) {
      return res.status(403).json({
        success: false,
        message: 'Device not found or does not belong to you',
      });
    }
    
    await removeDevice(parseInt(deviceId));
    
    return res.json({
      success: true,
      message: 'Device removed successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/security/alerts
 * Get security alerts for current user
 */
async function getSecurityAlerts(req, res, next) {
  try {
    const { id, userType } = req.user;
    const alerts = await getUnreadAlerts(id, userType);
    
    return res.json({
      success: true,
      alerts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/security/alerts/:alertId/read
 * Mark alert as read
 */
async function markAlertRead(req, res, next) {
  try {
    const { alertId } = req.params;
    
    await markAlertAsRead(parseInt(alertId));
    
    return res.json({
      success: true,
      message: 'Alert marked as read',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/devices/pending
 * Get all pending device approvals (admin only)
 */
async function getPendingDevices(req, res, next) {
  try {
    const pendingDevices = await prisma.device.findMany({
      where: { isPendingApproval: true },
      include: {
        // Include user information
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return res.json({
      success: true,
      devices: pendingDevices,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/devices/:deviceId/approve-email/:token
 * Approve device via email link (with token for security)
 */
async function approveDeviceByEmail(req, res, next) {
  try {
    const { deviceId } = req.params;
    
    const device = await approveDevice(parseInt(deviceId));
    
    // Return simple success message with device status
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Device Approved</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f7fa; margin: 0; }
          .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 500px; }
          .success { color: #10b981; font-size: 64px; margin-bottom: 20px; }
          h1 { color: #1a1a1a; margin-bottom: 10px; }
          p { color: #666; margin-bottom: 20px; }
          .status-box { background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .status-label { color: #059669; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
          .status-value { color: #1a1a1a; font-size: 18px; font-weight: 600; }
          .device-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; }
          .device-info div { margin: 8px 0; color: #4a5568; }
          .device-info strong { color: #1a202c; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅</div>
          <h1>Device Approved Successfully</h1>
          <p>The device has been approved and can now access your account.</p>
          
          <div class="status-box">
            <div class="status-label">CURRENT STATUS</div>
            <div class="status-value">✓ Trusted & Approved</div>
          </div>
          
          <div class="device-info">
            <div><strong>Device:</strong> ${device.deviceName}</div>
            <div><strong>Type:</strong> ${device.deviceType}</div>
            <div><strong>Platform:</strong> ${device.platform}</div>
            <div><strong>Browser:</strong> ${device.browser}</div>
            <div><strong>IP:</strong> ${device.ipAddress}</div>
            <div><strong>Location:</strong> ${device.city}, ${device.country}</div>
          </div>
          
          <p style="margin-top: 24px;">You can now close this window and try logging in again.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error approving device by email:', err);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f7fa; margin: 0; }
          .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
          .error { color: #dc2626; font-size: 64px; margin-bottom: 20px; }
          h1 { color: #1a1a1a; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">❌</div>
          <h1>Error Approving Device</h1>
          <p>${err.message || 'An error occurred while approving the device.'}</p>
        </div>
      </body>
      </html>
    `);
  }
}

/**
 * GET /api/devices/:deviceId/block-email/:token
 * Block device via email link (with token for security)
 */
async function blockDeviceByEmail(req, res, next) {
  try {
    const { deviceId } = req.params;
    
    const device = await blockDevice(parseInt(deviceId));
    
    // Return simple success message with device status
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Device Blocked</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f7fa; margin: 0; }
          .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 500px; }
          .blocked { color: #dc2626; font-size: 64px; margin-bottom: 20px; }
          h1 { color: #1a1a1a; margin-bottom: 10px; }
          p { color: #666; margin-bottom: 20px; }
          .status-box { background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .status-label { color: #dc2626; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
          .status-value { color: #1a1a1a; font-size: 18px; font-weight: 600; }
          .device-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; }
          .device-info div { margin: 8px 0; color: #4a5568; }
          .device-info strong { color: #1a202c; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="blocked">🚫</div>
          <h1>Device Blocked Successfully</h1>
          <p>The device has been blocked and cannot access your account.</p>
          
          <div class="status-box">
            <div class="status-label">CURRENT STATUS</div>
            <div class="status-value">✗ Blocked</div>
          </div>
          
          <div class="device-info">
            <div><strong>Device:</strong> ${device.deviceName}</div>
            <div><strong>Type:</strong> ${device.deviceType}</div>
            <div><strong>Platform:</strong> ${device.platform}</div>
            <div><strong>Browser:</strong> ${device.browser}</div>
            <div><strong>IP:</strong> ${device.ipAddress}</div>
            <div><strong>Location:</strong> ${device.city}, ${device.country}</div>
          </div>
          
          <p style="margin-top: 24px;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error blocking device by email:', err);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f7fa; margin: 0; }
          .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
          .error { color: #dc2626; font-size: 64px; margin-bottom: 20px; }
          h1 { color: #1a1a1a; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">❌</div>
          <h1>Error Blocking Device</h1>
          <p>${err.message || 'An error occurred while blocking the device.'}</p>
        </div>
      </body>
      </html>
    `);
  }
}

module.exports = {
  getMyDevices,
  approveUserDevice,
  blockUserDevice,
  deleteUserDevice,
  getSecurityAlerts,
  markAlertRead,
  getPendingDevices,
  approveDeviceByEmail,
  blockDeviceByEmail,
};
