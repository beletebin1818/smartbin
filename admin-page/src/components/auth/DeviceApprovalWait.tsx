'use client';

import { Shield, Clock, MapPin, Monitor, Smartphone, Tablet, RefreshCw } from 'lucide-react';

interface DeviceInfo {
  deviceName: string;
  deviceType: string;
  platform: string;
  browser: string;
  ipAddress: string;
  country: string;
  city: string;
}

interface DeviceApprovalWaitProps {
  deviceInfo: DeviceInfo;
  onRetry?: () => void;
}

export default function DeviceApprovalWait({ deviceInfo, onRetry }: DeviceApprovalWaitProps) {
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="w-8 h-8" />;
      case 'tablet':
        return <Tablet className="w-8 h-8" />;
      default:
        return <Monitor className="w-8 h-8" />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-blue-100 rounded-full">
            <Shield className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          New Device Detected
        </h1>
        <p className="text-center text-gray-600 mb-6">
          We noticed you&apos;re trying to sign in from a new device. For your security, we need administrator approval before you can continue.
        </p>

        {/* Device Info Card */}
        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              {getDeviceIcon(deviceInfo.deviceType)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{deviceInfo.deviceName}</h3>
              <p className="text-sm text-gray-600">{deviceInfo.platform} - {deviceInfo.browser}</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-3 text-sm">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">
                {deviceInfo.city}, {deviceInfo.country}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">
                IP: {deviceInfo.ipAddress}
              </span>
            </div>
          </div>
        </div>

        {/* Info Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>What happens next:</strong>
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
            <li>An administrator has been notified</li>
            <li>They will review your device information</li>
            <li>You&apos;ll receive approval once verified</li>
            <li>This usually takes a few minutes</li>
          </ul>
        </div>

        {/* Retry Button */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Check Approval Status</span>
          </button>
        )}

        {/* Help Text */}
        <p className="text-center text-sm text-gray-500 mt-4">
          If this takes longer than expected, please contact your administrator.
        </p>
      </div>
    </div>
  );
}
