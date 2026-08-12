/**
 * Email Service
 * Handles sending email notifications using Nodemailer
 * Recommended for sending device approval alerts like Gmail
 */

const nodemailer = require('nodemailer');

// Create transporter using environment variables
let transporter = null;

function initTransporter() {
  if (transporter) return transporter;

  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS in .env file');
    return null;
  }

  const emailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465'), // Changed to 465 for SSL
    secure: process.env.EMAIL_SECURE !== 'false', // Default to true for SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Add connection timeout and retry options
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    // Force IPv4 to avoid IPv6 connection issues
    family: 4,
    // Add additional options for better connectivity
    tls: {
      rejectUnauthorized: false,
    },
  };

  console.log('📧 Email configuration:', {
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    user: emailConfig.auth.user ? '***configured***' : 'missing',
    pass: emailConfig.auth.pass ? '***configured***' : 'missing',
  });

  transporter = nodemailer.createTransport(emailConfig);

  // Verify connection configuration
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email service configuration error:', error.message);
      console.error('💡 Try using port 465 with EMAIL_SECURE=true for SSL, or check your firewall settings');
    } else {
      console.log('✅ Email service is ready to send messages');
    }
  });

  return transporter;
}

/**
 * Send device approval email with OTP
 * Modern 2026-style email template
 */
async function sendDeviceApprovalEmail(userEmail, deviceInfo, otpCode) {
  try {
    const mailTransporter = initTransporter();
    
    // Log OTP to console for testing (in case email fails)
    console.log('🔐 OTP CODE FOR TESTING:', otpCode);
    console.log('📧 Email would be sent to:', userEmail);
    console.log('📱 Device:', deviceInfo.deviceName);
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Red Bingo Security'}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: 'New device login — approval code',
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Device Approval</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: 560px;
      margin: 0 auto;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    }
    .header {
      padding: 28px 28px 22px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.5px;
    }
    .header-text h1 {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .header-text p {
      font-size: 13px;
      color: #6b7280;
      margin-top: 2px;
    }
    .content {
      padding: 26px 28px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #4f46e5;
      background: #eef2ff;
      padding: 6px 10px;
      border-radius: 999px;
      margin-bottom: 14px;
    }
    .lead {
      font-size: 15px;
      color: #374151;
      margin-bottom: 20px;
    }
    .otp-box {
      background: #fafafa;
      border: 1px dashed #d1d5db;
      border-radius: 14px;
      padding: 18px;
      text-align: center;
      margin: 18px 0;
    }
    .otp-label {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 10px;
    }
    .otp-code {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 10px;
      color: #111827;
      font-variant-numeric: tabular-nums;
    }
    .otp-meta {
      font-size: 12px;
      color: #6b7280;
      margin-top: 10px;
    }
    .device-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 18px;
    }
    .device-item {
      background: #f9fafb;
      border: 1px solid #f3f4f6;
      border-radius: 12px;
      padding: 12px 14px;
    }
    .device-item .label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .device-item .value {
      font-size: 13px;
      color: #111827;
      font-weight: 600;
    }
    .notice {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      font-size: 13px;
      padding: 14px;
      border-radius: 12px;
      margin-top: 18px;
      line-height: 1.5;
    }
    .cta-row {
      margin-top: 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      color: #fff;
      padding: 12px 18px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    .hint {
      font-size: 12px;
      color: #6b7280;
    }
    .footer {
      padding: 18px 28px;
      border-top: 1px solid #f3f4f6;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .footer a {
      color: #4f46e5;
      text-decoration: none;
    }
    @media (max-width: 600px) {
      .wrap { padding: 16px; }
      .header, .content, .footer { padding-left: 20px; padding-right: 20px; }
      .otp-code { font-size: 32px; letter-spacing: 8px; }
      .device-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="logo">RB</div>
        <div class="header-text">
          <h1>New device login</h1>
          <p>Smart Bingo admin security</p>
        </div>
      </div>

      <div class="content">
        <div class="eyebrow">Approval required</div>
        <p class="lead">A new device is trying to access your account. If this was you, use the code below to approve this device.</p>

        <div class="otp-box">
          <div class="otp-label">Approval code</div>
          <div class="otp-code">${otpCode}</div>
          <div class="otp-meta">Expires in 10 minutes</div>
        </div>

        <div class="device-grid">
          <div class="device-item">
            <div class="label">Device</div>
            <div class="value">${escapeHtml(deviceInfo.deviceName)}</div>
          </div>
          <div class="device-item">
            <div class="label">Type</div>
            <div class="value">${escapeHtml(deviceInfo.deviceType)}</div>
          </div>
          <div class="device-item">
            <div class="label">Platform</div>
            <div class="value">${escapeHtml(deviceInfo.platform)}</div>
          </div>
          <div class="device-item">
            <div class="label">Browser</div>
            <div class="value">${escapeHtml(deviceInfo.browser)}</div>
          </div>
          <div class="device-item">
            <div class="label">IP</div>
            <div class="value">${escapeHtml(deviceInfo.ipAddress)}</div>
          </div>
          <div class="device-item">
            <div class="label">Location</div>
            <div class="value">${escapeHtml(deviceInfo.city)}, ${escapeHtml(deviceInfo.country)}</div>
          </div>
        </div>

        <div class="notice">
          If you did not initiate this request, you can ignore this email. No action is needed if this was unexpected.
        </div>

        <div class="cta-row">
          <span class="hint">Enter the code on your login screen.</span>
        </div>
      </div>

      <div class="footer">
        <p>Automated security notification from <a href="#">Smart Bingo</a>.</p>
        <p style="margin-top:6px;">Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    };

    const info = await mailTransporter.sendMail(mailOptions);
    console.log('Device approval email with OTP sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending device approval email:', error);
    return { success: false, error: error.message };
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format metadata for email display
 */
function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  
  const importantFields = ['deviceName', 'deviceType', 'platform', 'browser', 'ipAddress', 'country', 'city', 'location', 'time', 'date'];
  
  let html = '';
  for (const key of importantFields) {
    if (metadata[key] !== undefined && metadata[key] !== null) {
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      html += `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
        <span style="color: #6b7280; font-weight: 500;">${escapeHtml(label)}:</span>
        <span style="color: #111827; font-weight: 600;">${escapeHtml(metadata[key])}</span>
      </div>`;
    }
  }
  
  return html || '<p style="color: #6b7280;">No additional details available</p>';
}

/**
 * Send security alert email
 * Modern professional template with severity-based styling
 */
async function sendSecurityAlertEmail(userEmail, alertData) {
  try {
    const mailTransporter = initTransporter();
    
    const severityConfig = {
      critical: {
        color: '#dc2626',
        gradient: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        icon: '🚨',
        bgGradient: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
        borderColor: '#fecaca'
      },
      high: {
        color: '#f97316',
        gradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
        icon: '⚠️',
        bgGradient: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        borderColor: '#fdba74'
      },
      medium: {
        color: '#eab308',
        gradient: 'linear-gradient(135deg, #eab308 0%, #facc15 100%)',
        icon: '🔔',
        bgGradient: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
        borderColor: '#fde047'
      },
      low: {
        color: '#3b82f6',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
        icon: 'ℹ️',
        bgGradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        borderColor: '#93c5fd'
      },
    };

    const config = severityConfig[alertData.severity] || severityConfig.low;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Smart Bingo Security'}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `${config.icon} Security alert: ${alertData.title}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alert</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: 560px;
      margin: 0 auto;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    }
    .header {
      padding: 28px 28px 22px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: ${config.gradient};
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 14px;
    }
    .header-text h1 {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .header-text p {
      font-size: 13px;
      color: #6b7280;
      margin-top: 2px;
    }
    .content {
      padding: 26px 28px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: ${config.color};
      background: ${config.bgGradient};
      padding: 6px 10px;
      border-radius: 999px;
      margin-bottom: 14px;
    }
    .lead {
      font-size: 15px;
      color: #374151;
      margin-bottom: 20px;
    }
    .alert-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 18px;
      margin: 18px 0;
    }
    .alert-box h3 {
      font-size: 15px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .alert-box p {
      color: #4b5563;
      font-size: 14px;
      margin: 0;
    }
    .metadata-box {
      background: #ffffff;
      border: 1px solid #f3f4f6;
      border-radius: 10px;
      padding: 14px;
      margin-top: 14px;
    }
    .footer {
      padding: 18px 28px;
      border-top: 1px solid #f3f4f6;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .footer a {
      color: #4f46e5;
      text-decoration: none;
    }
    @media (max-width: 600px) {
      .wrap { padding: 16px; }
      .header, .content, .footer { padding-left: 20px; padding-right: 20px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="logo">${config.icon}</div>
        <div class="header-text">
          <h1>${alertData.title}</h1>
          <p>Smart Bingo security</p>
        </div>
      </div>

      <div class="content">
        <div class="eyebrow">${alertData.severity.toUpperCase()} priority</div>
        <p class="lead">A security event has been detected that requires your attention.</p>

        <div class="alert-box">
          <h3>Alert</h3>
          <p>${alertData.message}</p>
          ${alertData.metadata ? `
          <div class="metadata-box">
            ${formatMetadata(alertData.metadata)}
          </div>
          ` : ''}
        </div>

        <p style="color: #374151; font-size: 14px;">Please review this alert and take appropriate action if necessary.</p>
      </div>

      <div class="footer">
        <p>Automated security notification from <a href="#">Smart Bingo</a>.</p>
        <p style="margin-top:6px;">Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    };

    const info = await mailTransporter.sendMail(mailOptions);
    console.log('Security alert email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending security alert email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send login notification email
 * Modern professional template for successful login notifications
 */
async function sendLoginNotificationEmail(userEmail, loginData) {
  try {
    const mailTransporter = initTransporter();
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Smart Bingo Security'}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: 'New login detected',
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login Notification</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: 560px;
      margin: 0 auto;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    }
    .header {
      padding: 28px 28px 22px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.5px;
    }
    .header-text h1 {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .header-text p {
      font-size: 13px;
      color: #6b7280;
      margin-top: 2px;
    }
    .content {
      padding: 26px 28px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #059669;
      background: #ecfdf5;
      padding: 6px 10px;
      border-radius: 999px;
      margin-bottom: 14px;
    }
    .lead {
      font-size: 15px;
      color: #374151;
      margin-bottom: 20px;
    }
    .success-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 16px;
      margin: 18px 0;
    }
    .success-box h3 {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 12px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #6b7280;
      font-size: 13px;
      font-weight: 500;
    }
    .info-value {
      color: #111827;
      font-size: 13px;
      font-weight: 600;
      text-align: right;
    }
    .notice {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      color: #1e3a8a;
      font-size: 13px;
      padding: 14px;
      border-radius: 12px;
      margin-top: 18px;
      line-height: 1.5;
    }
    .footer {
      padding: 18px 28px;
      border-top: 1px solid #f3f4f6;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .footer a {
      color: #4f46e5;
      text-decoration: none;
    }
    @media (max-width: 600px) {
      .wrap { padding: 16px; }
      .header, .content, .footer { padding-left: 20px; padding-right: 20px; }
      .info-row { flex-direction: column; gap: 2px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="logo">RB</div>
        <div class="header-text">
          <h1>New login detected</h1>
          <p>Smart Bingo account access</p>
        </div>
      </div>

      <div class="content">
        <div class="eyebrow">Successful sign-in</div>
        <p class="lead">We detected a successful login to your account. If this was you, no action is needed.</p>

        <div class="success-box">
          <h3>Login details</h3>
          <div class="info-row">
            <span class="info-label">Device</span>
            <span class="info-value">${escapeHtml(loginData.deviceName)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Platform</span>
            <span class="info-value">${escapeHtml(loginData.platform)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Browser</span>
            <span class="info-value">${escapeHtml(loginData.browser)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">IP</span>
            <span class="info-value">${escapeHtml(loginData.ipAddress)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Location</span>
            <span class="info-value">${escapeHtml(loginData.city || 'Unknown')}, ${escapeHtml(loginData.country || 'Unknown')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Time</span>
            <span class="info-value">${new Date().toLocaleString()}</span>
          </div>
        </div>

        <div class="notice">
          If this wasn't you, secure your account immediately by changing your password.
        </div>
      </div>

      <div class="footer">
        <p>Automated notification from <a href="#">Smart Bingo</a>.</p>
        <p style="margin-top:6px;">Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    };

    const info = await mailTransporter.sendMail(mailOptions);
    console.log('Login notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending login notification email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initTransporter,
  sendDeviceApprovalEmail,
  sendSecurityAlertEmail,
  sendLoginNotificationEmail,
};
