import React, { useState, useEffect } from 'react';
import { getLaunchParams, isInsideTelegram } from '../lib/telegram';
import { socket } from '../lib/socket';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

const DebugOverlay: React.FC = () => {
  const params = getLaunchParams();
  const telegramId = params?.telegramId;
  const inTelegram = isInsideTelegram();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

  const [socketStatus, setSocketStatus] = useState(socket.connected ? 'connected' : 'disconnected');
  const [lastError, setLastError] = useState<string>('');

  useEffect(() => {
    const onConnect = () => setSocketStatus('connected');
    const onDisconnect = (reason: string) => setSocketStatus(`disconnected: ${reason}`);
    const onError = (err: Error) => setLastError(err.message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: '#fff',
        padding: '8px 12px',
        fontSize: '11px',
        fontFamily: 'monospace',
        zIndex: 9999,
        borderTop: '1px solid #333',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ color: telegramId ? '#4ade80' : '#f87171' }}>id:</span>{' '}
          {telegramId || 'null'}
        </div>
        <div>
          <span style={{ color: socketStatus === 'connected' ? '#4ade80' : '#f87171' }}>sock:</span>{' '}
          {socketStatus}
        </div>
        <div>
          <span style={{ color: '#60a5fa' }}>url:</span> {socketUrl.replace('https://', '')}
        </div>
        {lastError && (
          <div style={{ color: '#f87171', width: '100%' }}>err: {lastError}</div>
        )}
      </div>
    </div>
  );
};

export default DebugOverlay;
