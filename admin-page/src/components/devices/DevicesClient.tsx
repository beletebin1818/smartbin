'use client';

import { useEffect, useState } from 'react';
import { Shield, Check, X, Clock, MapPin, Monitor, Smartphone, Tablet, AlertTriangle } from 'lucide-react';

interface Device {
  id: number;
  userId: number;
  userType: string;
  deviceFingerprint: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  browser: string;
  ipAddress: string;
  country: string;
  city: string;
  isTrusted: boolean;
  isBlocked: boolean;
  isPendingApproval: boolean;
  lastSeenAt: string;
  createdAt: string;
  blockedAt?: string;
  failedOtpAttempts?: number;
}

interface SecurityAlert {
  id: number;
  userId: number;
  userType: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  metadata: any;
  isRead: boolean;
  createdAt: string;
}

export default function DevicesClient() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingDevices, setPendingDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'alerts'>('pending');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch pending devices
      const pendingRes = await fetch('/api/admin/devices/pending', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        setPendingDevices(pendingData.devices || []);
      }

      // Fetch all devices
      const devicesRes = await fetch('/api/devices', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDevices(devicesData.devices || []);
      }

      // Fetch security alerts
      const alertsRes = await fetch('/api/security/alerts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching device data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (deviceId: number) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error approving device:', error);
    }
  };

  const handleBlock = async (deviceId: number) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/block`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error blocking device:', error);
    }
  };

  const handleRemove = async (deviceId: number) => {
    if (!confirm('Are you sure you want to remove this device?')) return;

    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error removing device:', error);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="w-5 h-5" />;
      case 'tablet':
        return <Tablet className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const formatAlertMetadata = (metadata: any) => {
    if (!metadata || typeof metadata !== 'object') return null;
    
    const importantFields = ['deviceName', 'deviceType', 'platform', 'browser', 'ipAddress', 'country', 'city', 'location', 'time', 'date'];
    const items: { label: string; value: string }[] = [];
    
    for (const key of importantFields) {
      if (metadata[key] !== undefined && metadata[key] !== null) {
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        items.push({ label, value: String(metadata[key]) });
      }
    }
    
    return items.length > 0 ? items : null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
          <p className="text-gray-600 mt-1">Monitor and manage device access</p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pending Approvals ({pendingDevices.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Devices ({devices.length})
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'alerts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Security Alerts ({alerts.filter(a => !a.isRead).length})
          </button>
        </nav>
      </div>

      {/* Pending Devices Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingDevices.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No pending device approvals</p>
            </div>
          ) : (
            pendingDevices.map((device) => (
              <div
                key={device.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{device.deviceName}</h3>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <Monitor className="w-4 h-4" />
                          <span>{device.platform} - {device.browser}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4" />
                          <span>{device.city}, {device.country}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4" />
                          <span>IP: {device.ipAddress}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApprove(device.id)}
                      className="flex items-center space-x-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleBlock(device.id)}
                      className="flex items-center space-x-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                      <X className="w-4 h-4" />
                      <span>Block</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* All Devices Tab */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {devices.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No devices registered</p>
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className={`p-3 rounded-lg ${device.isTrusted ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-gray-900">{device.deviceName}</h3>
                        {device.isTrusted && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            Trusted
                          </span>
                        )}
                        {device.isBlocked && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                            Blocked
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <Monitor className="w-4 h-4" />
                          <span>{device.platform} - {device.browser}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4" />
                          <span>{device.city}, {device.country}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4" />
                          <span>Last seen: {new Date(device.lastSeenAt).toLocaleString()}</span>
                        </div>
                        {device.isBlocked && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                            <div className="flex items-center justify-between">
                              <span>Blocked</span>
                              {device.blockedAt && (
                                <span>{new Date(device.blockedAt).toLocaleString()}</span>
                              )}
                            </div>
                            <div className="mt-1">
                              Failed OTP attempts: {device.failedOtpAttempts ?? '—'}
                            </div>
                            <div className="mt-1">
                              Contact administrator to restore access.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(device.id)}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Security Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No security alerts</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-white border rounded-lg p-6 shadow-sm ${
                  alert.isRead ? 'border-gray-200 opacity-60' : 'border-orange-200'
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg ${getSeverityColor(alert.severity)}`}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{alert.message}</p>
                    {alert.metadata && (() => {
                      const formattedMetadata = formatAlertMetadata(alert.metadata);
                      return formattedMetadata ? (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
                          <div className="space-y-2">
                            {formattedMetadata.map((item, index) => (
                              <div key={index} className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                                <span className="text-gray-600 font-medium">{item.label}:</span>
                                <span className="text-gray-900 font-semibold">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <div className="mt-2 text-xs text-gray-500">
                      {new Date(alert.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
