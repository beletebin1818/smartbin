# Security Implementation Guide

This document outlines the modern security mechanisms implemented in the Red Bingo admin panel.

## Overview

The security implementation follows OWASP best practices and includes:

- **Enhanced CORS Protection** with origin whitelisting
- **JWT Token Security** with short-lived access tokens
- **Refresh Token Rotation** for secure session management
- **Security Headers** (Helmet-like functionality)
- **Rate Limiting** to prevent brute force attacks
- **Request Validation** and size limits

## Security Features

### 1. CORS Protection

**Implementation:** `src/index.js`

The CORS configuration now uses an origin whitelist instead of allowing all origins:

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];
```

**Configuration:** Update your `.env` file:
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
```

**Benefits:**
- Prevents unauthorized domains from accessing your API
- Reduces CSRF attack surface
- Credentials enabled for secure cookie handling

### 2. JWT Token Security

**Implementation:** `src/middleware/authEnhanced.js`

**Access Tokens:**
- **Expiry:** 15 minutes (short-lived)
- **Algorithm:** HS256
- **Includes:** Unique token ID (jti) for revocation support
- **Payload:** User ID, username, role, user type

**Refresh Tokens:**
- **Expiry:** 7 days (long-lived)
- **Format:** 80-character cryptographically secure random string
- **Storage:** Database with revocation tracking
- **Rotation:** Automatic rotation on each refresh

**Configuration:**
```env
JWT_SECRET=your_long_random_secret_min_32_chars
JWT_REFRESH_SECRET=your_another_long_random_secret_min_32_chars
```

### 3. Refresh Token Rotation

**Implementation:** `src/controllers/authController.js`

**How it works:**
1. User logs in → receives access token + refresh token
2. Access token expires (15 min) → client calls `/api/auth/refresh`
3. Server validates refresh token → issues new access token + new refresh token
4. Old refresh token is revoked (cannot be reused)
5. If refresh token is reused → potential attack detected

**API Endpoints:**
- `POST /api/auth/login` - Initial authentication
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Revoke refresh token

**Benefits:**
- Compromised refresh tokens have limited lifespan
- Automatic detection of token theft attempts
- No need for users to re-login frequently

### 4. Security Headers

**Implementation:** `src/middleware/security.js`

**Headers applied:**
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - Enables XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
- `Content-Security-Policy` - Restricts resource loading
- `Strict-Transport-Security` - Enforces HTTPS (production only)
- `Permissions-Policy` - Controls browser features

### 5. Rate Limiting

**Implementation:** `src/middleware/security.js`

**Rate Limits:**
- **Auth Routes:** 5 requests per 15 minutes (prevents brute force)
- **API Routes:** 100 requests per 15 minutes (general API protection)
- **Sensitive Operations:** 10 requests per hour (payment operations, etc.)

**Configuration:**
```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5
```

**Benefits:**
- Prevents brute force attacks on login
- Protects against DDoS attacks
- Limits abuse of sensitive operations

### 6. Request Size Limiting

**Implementation:** `src/middleware/security.js`

- **Maximum payload size:** 10MB
- **Prevents:** Large payload attacks, memory exhaustion

### 7. CSRF Protection

**Implementation:** `src/middleware/security.js`

**CSRF Protection Mechanisms:**

1. **CSRF Token Validation**
   - Generates cryptographically secure CSRF tokens
   - Validates tokens on state-changing requests
   - Tokens expire after 1 hour
   - Skips validation for safe methods (GET, HEAD, OPTIONS)
   - Skips validation for API routes with JWT authentication

2. **Origin/Referer Validation**
   - Validates Origin header for state-changing requests
   - Falls back to Referer header if Origin is missing
   - Ensures requests come from allowed origins
   - Prevents cross-origin attacks

3. **Anti-Clickjacking**
   - Sets X-Frame-Options: DENY
   - Sets Content-Security-Policy: frame-ancestors 'none'
   - Prevents UI redress attacks

4. **Double Submit Cookie Pattern** (Optional)
   - Alternative CSRF protection method
   - Compares cookie token with header token
   - Useful for cookie-based authentication

**How It Works:**

```javascript
// CSRF token is automatically added to response headers
X-CSRF-Token: <random-64-char-token>
X-CSRF-Token-Expiry: <timestamp>

// Client must include token in subsequent requests
headers: {
  'X-CSRF-Token': '<token-from-response>'
}
```

**Benefits:**
- Prevents unauthorized state-changing requests
- Protects against cross-site request forgery attacks
- Complements JWT authentication
- Defense in depth approach

### 8. Device Detection & Management

**Implementation:** `src/middleware/deviceFingerprint.js`, `src/services/deviceService.js`

**Device Detection Features:**

1. **Device Fingerprinting**
   - Generates unique device identifiers using SHA-256 hashing
   - Analyzes user agent, platform, browser, and device type
   - Similar to Google's device recognition system
   - Detects: Windows, Mac, Linux, iOS, Android devices

2. **Device Registration**
   - Automatically registers new devices on login
   - Stores device information: name, type, platform, browser
   - Tracks IP address and location data
   - Maintains last seen timestamp

3. **Device Approval Workflow**
   - New devices require administrator approval
   - Trusted devices can bypass approval
   - Blocked devices are prevented from logging in
   - Admin can approve/reject devices via API

4. **Security Alerts**
   - Automatic alerts for new device login attempts
   - Suspicious activity detection
   - Multiple failed login attempt monitoring
   - Location-based anomaly detection

**Database Schema:**

```prisma
model Device {
  id           Int      @id @default(autoincrement())
  userId       Int
  userType     String
  deviceFingerprint String @unique
  deviceName   String?
  deviceType   String?
  platform     String?
  browser      String?
  ipAddress    String?
  country      String?
  city         String?
  isTrusted    Boolean  @default(false)
  isBlocked    Boolean  @default(false)
  isPendingApproval Boolean @default(false)
  lastSeenAt   DateTime @default(now())
  createdAt    DateTime @default(now())
}

model LoginAttempt {
  id           Int      @id @default(autoincrement())
  userId       Int?
  userType     String?
  username     String?
  ipAddress    String?
  deviceFingerprint String?
  success      Boolean
  failureReason String?
  createdAt    DateTime @default(now())
}

model SecurityAlert {
  id           Int      @id @default(autoincrement())
  userId       Int
  userType     String
  alertType    String
  severity     String
  title        String
  message      String
  metadata     Json?
  isRead       Boolean  @default(false)
  createdAt    DateTime @default(now())
}
```

**API Endpoints:**

- `GET /api/devices` - Get user's devices
- `DELETE /api/devices/:deviceId` - Remove a device
- `POST /api/devices/:deviceId/approve` - Approve device (admin)
- `POST /api/devices/:deviceId/block` - Block device (admin)
- `GET /api/security/alerts` - Get security alerts
- `POST /api/security/alerts/:alertId/read` - Mark alert as read
- `GET /api/admin/devices/pending` - Get pending approvals (admin)

**Login Flow with Device Detection:**

1. User attempts login
2. System extracts device fingerprint
3. Checks if device is known and trusted
4. If new device → requires admin approval
5. If blocked device → denies login
6. Logs all login attempts
7. Creates security alerts for suspicious activity
8. Returns device info in response

**Response Examples:**

**New Device Detected:**
```json
{
  "success": false,
  "message": "New device detected. Please wait for administrator approval.",
  "requiresApproval": true,
  "deviceInfo": {
    "deviceName": "Windows Chrome Desktop",
    "deviceType": "desktop",
    "platform": "Windows",
    "browser": "Chrome",
    "ipAddress": "192.168.1.100",
    "country": "Ethiopia",
    "city": "Addis Ababa"
  }
}
```

**Successful Login with Device Info:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": "15m",
  "user": {
    "id": 1,
    "username": "admin",
    "firstName": "John",
    "lastName": "Doe",
    "role": "super_admin"
  },
  "deviceInfo": {
    "isNewDevice": false,
    "deviceName": "Windows Chrome Desktop",
    "isTrusted": true
  }
}
```

**Security Alert Example:**
```json
{
  "id": 1,
  "userId": 1,
  "userType": "admin",
  "alertType": "new_device",
  "severity": "high",
  "title": "New Device Login Attempt",
  "message": "Login attempt from new device: Windows Chrome Desktop from 192.168.1.100",
  "metadata": {
    "deviceName": "Windows Chrome Desktop",
    "deviceType": "desktop",
    "platform": "Windows",
    "browser": "Chrome",
    "ipAddress": "192.168.1.100",
    "country": "Ethiopia",
    "city": "Addis Ababa"
  },
  "isRead": false,
  "createdAt": "2024-08-10T20:00:00Z"
}
```

## Database Schema

### RefreshToken Model

Added to `prisma/schema.prisma`:

```prisma
model RefreshToken {
  id           Int      @id @default(autoincrement())
  token        String   @unique
  userId       Int
  userType     String   // "admin" or "agent"
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  revokedAt    DateTime?
  replacedByToken String?
  
  @@index([userId, userType])
  @@index([token])
}
```

**Migration Required:**
```bash
npx prisma migrate dev --name add_refresh_tokens
```

## API Changes

### Authentication Flow

**Old Flow:**
```
Login → Long-lived JWT (24h) → Use until expiry
```

**New Flow:**
```
Login → Access Token (15m) + Refresh Token (7d)
Access Token Expires → Refresh Token Rotation
Logout → Refresh Token Revocation
```

### Response Format

**Login Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": "15m",
  "user": {
    "id": 1,
    "username": "admin",
    "firstName": "John",
    "lastName": "Doe",
    "role": "super_admin"
  }
}
```

**Refresh Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "f6e5d4c3b2a1...",
  "expiresIn": "15m"
}
```

## Client-Side Implementation

### Admin Panel Integration

Update your admin panel authentication logic:

```javascript
// Store tokens securely (httpOnly cookies recommended)
const login = async (username, password) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  
  const { accessToken, refreshToken } = await response.json();
  
  // Store tokens (use httpOnly cookies in production)
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

// Refresh token automatically
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  
  const { accessToken, refreshToken: newRefreshToken } = await response.json();
  
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', newRefreshToken);
  
  return accessToken;
};

// API call with automatic token refresh
const apiCall = async (url, options = {}) => {
  let accessToken = localStorage.getItem('accessToken');
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (response.status === 401) {
      // Token expired, try refresh
      accessToken = await refreshAccessToken();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });
    }
    
    return response;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};
```

## Security Best Practices

### 1. Environment Variables

- **Never commit `.env` files** to version control
- Use strong, random secrets (minimum 32 characters)
- Different secrets for development and production
- Rotate secrets periodically

### 2. Token Storage

**Recommended:** HttpOnly cookies
```javascript
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: true, // HTTPS only
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

**Alternative:** LocalStorage (less secure)
```javascript
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

### 3. HTTPS in Production

- Always use HTTPS in production
- Enable HSTS header
- Use valid SSL certificates
- Configure proper domain origins

### 4. Monitoring

- Monitor failed login attempts
- Track refresh token usage patterns
- Alert on suspicious activity
- Log security events

### 5. Regular Updates

- Keep dependencies updated
- Monitor security advisories
- Apply security patches promptly
- Review OWASP Top 10 regularly

## Troubleshooting

### Refresh Token Table Not Available

If you see "Refresh token table not available" errors:

1. Run the database migration:
   ```bash
   npx prisma migrate dev --name add_refresh_tokens
   ```

2. Or temporarily use the fallback (less secure) mode

### CORS Errors

If you encounter CORS errors:

1. Check your `ALLOWED_ORIGINS` configuration
2. Ensure your frontend URL is in the whitelist
3. Verify the protocol (http vs https)
4. Check port numbers match exactly

### Rate Limiting Issues

If you're being rate-limited during development:

1. Adjust limits in `.env` file
2. Or temporarily disable rate limiting for testing
3. Use different IP addresses for testing

## Migration Checklist

- [ ] Update `.env` with security configuration
- [ ] Run database migration: `npx prisma migrate dev --name add_refresh_tokens`
- [ ] Update admin panel authentication logic
- [ ] Test login flow
- [ ] Test token refresh flow
- [ ] Test logout functionality
- [ ] Verify CORS settings
- [ ] Test rate limiting
- [ ] Update production environment variables
- [ ] Monitor security logs

## Additional Security Recommendations

1. **Implement IP Whitelisting** for admin access
2. **Add Two-Factor Authentication** (2FA)
3. **Implement Session Timeout** on inactivity
4. **Add Audit Logging** for sensitive operations
5. **Regular Security Audits** and penetration testing
6. **Implement Password Policies** (complexity, rotation)
7. **Add Account Lockout** after failed attempts
8. **Encrypt Sensitive Data** at rest
9. **Regular Database Backups** with encryption
10. **Implement API Versioning** for security updates

## Support

For security issues or questions:
- Review OWASP guidelines: https://owasp.org/
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- Express Security: https://expressjs.com/en/advanced/best-practice-security.html
