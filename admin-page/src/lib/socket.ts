/**
 * Socket.io client singleton for the Admin Dashboard.
 *
 * Connects to the backend Socket.io server, identifies as an admin,
 * and joins the `admin_room` so it receives all real-time revenue
 * and platform events.
 *
 * Usage:
 *   import { getSocket, connectAsAdmin } from '@/lib/socket';
 *   const s = connectAsAdmin();
 *   s.on('game:draw', handler);
 *   s.off('game:draw', handler);
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = (() => {
  // Explicit socket URL can be provided via NEXT_PUBLIC_SOCKET_URL
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  // If API URL is provided, derive the socket origin by stripping the /api suffix
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace('/api', '');
  // Fallback to the browser's origin when running in the client — this is the most
  // robust default in deployments where env vars are not present but the API/socket
  // server is served from the same host as the frontend.
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  // Final fallback for server-side or tests
  return 'http://localhost:3000';
})();

let _socket: Socket | null = null;

/**
 * Returns the singleton socket instance, creating it on first call.
 * The socket auto-connects and identifies as an admin.
 */
export function getSocket(): Socket {
  if (_socket && !_socket.disconnected) return _socket;

  // If we have a socket that's disconnected, disconnect cleanly before re-creating
  if (_socket) {
    try { _socket.disconnect(); } catch (_) { /* noop */ }
  }

  _socket = io(SOCKET_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
    timeout: 10000,
  });

  _socket.on('connect', () => {
    // Identify as admin so the server puts us in admin_room
    _socket?.emit('identify', { role: 'admin', userId: 'admin-dashboard' });
    console.log('[socket] Connected as admin. Socket id:', _socket?.id);
  });

  _socket.on('disconnect', (reason) => {
    console.warn('[socket] Disconnected:', reason);
  });

  _socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
  });

  return _socket;
}

/**
 * Connect and explicitly identify as admin. Returns the socket instance.
 * Call this from client components before using the socket to ensure the
 * connection is established and the server has put the client in admin_room.
 */
export function connectAsAdmin(): Socket {
  const s = getSocket();
  // If already connected, send identify immediately in case the server restarted
  if (s.connected) {
    s.emit('identify', { role: 'admin', userId: 'admin-dashboard' });
  }
  return s;
}

/**
 * Clean up the socket connection (call on app unmount / logout).
 */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

/**
 * Stable socket reference — delegates every property access to `getSocket()`
 * so it is always non-null and other components can continue to use
 * `import { socket } from '@/lib/socket'` without null checks.
 *
 * Components should call `connectAsAdmin()` in a `useEffect` first to ensure
 * the connection and admin_room identification are established.
 */
export const socket: Socket = new Proxy({} as Socket, {
  get(_target, prop) {
    const s = getSocket();
    const val = (s as any)[prop];
    return typeof val === 'function' ? val.bind(s) : val;
  },
  set(_target, prop, value) {
    (getSocket() as any)[prop] = value;
    return true;
  },
});
