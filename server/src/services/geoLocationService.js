/**
 * IP Geolocation Service
 * Provides location information for IP addresses using geoip-lite
 * Similar to Google's location detection for device security
 */

const geoip = require('geoip-lite');

/**
 * Get location information for an IP address
 */
function getLocationFromIP(ipAddress) {
  if (!ipAddress) {
    return {
      city: 'Unknown',
      country: 'Unknown',
      region: 'Unknown',
      latitude: null,
      longitude: null,
      timezone: 'Unknown',
    };
  }

  // Skip local/private IPs
  if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress.startsWith('172.')) {
    return {
      city: 'Local Network',
      country: 'Local',
      region: 'Local',
      latitude: null,
      longitude: null,
      timezone: 'Local',
    };
  }

  try {
    const geo = geoip.lookup(ipAddress);
    
    if (geo) {
      return {
        city: geo.city || 'Unknown',
        country: geo.country || 'Unknown',
        region: geo.region || 'Unknown',
        latitude: geo.ll ? geo.ll[0] : null,
        longitude: geo.ll ? geo.ll[1] : null,
        timezone: geo.timezone || 'Unknown',
      };
    }
  } catch (error) {
    console.error('Error getting location for IP:', ipAddress, error);
  }

  return {
    city: 'Unknown',
    country: 'Unknown',
    region: 'Unknown',
    latitude: null,
    longitude: null,
    timezone: 'Unknown',
  };
}

/**
 * Get formatted location string for display
 */
function getFormattedLocation(location) {
  if (location.city === 'Local Network' || location.country === 'Local') {
    return 'Local Network';
  }
  
  const parts = [];
  if (location.city && location.city !== 'Unknown') {
    parts.push(location.city);
  }
  if (location.country && location.country !== 'Unknown') {
    parts.push(location.country);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
}

module.exports = {
  getLocationFromIP,
  getFormattedLocation,
};
