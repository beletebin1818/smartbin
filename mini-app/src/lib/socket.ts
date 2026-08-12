/**
 * Socket.io client — singleton connected to the Red Bingos backend.
 * VITE_SOCKET_URL defaults to http://localhost:3000
 *
 * Transport: polling only (no websocket upgrade).
 * Cloudflare Tunnel has a 100s HTTP timeout and drops WebSocket upgrades,
 * so we use short-interval polling to stay well within that limit.
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  // Try WebSocket first for real-time updates, fall back to polling
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: false,
});

export function connectAsPlayer(telegramId: string): void {
  if (!socket.connected) socket.connect();

  const identify = () => {
    socket.emit('identify', { role: 'player', userId: telegramId });
  };

  if (socket.connected) {
    identify();
  } else {
    socket.once('connect', identify);
  }
}

export function joinGameRoom(gameId: number): void {
  socket.emit('join_game', { gameId });
}

export function leaveGameRoom(gameId: number): void {
  socket.emit('leave_game', { gameId });
}

// ── Typed event payloads ─────────────────────────────────────────────────────

export interface LobbyTickPayload {
  gameId: number;
  secondsLeft: number;
}

export interface GameStatusPayload {
  gameId: number;
  status: string;
  prize?: number;
  message?: string;
}

export interface CardClaimedPayload {
  gameId: number;
  cardNumber: number;
  playerId: number;
  isBot?: boolean;
}

export interface CardUnclaimedPayload {
  gameId: number;
  cardNumber: number;
}

export interface LobbyStatsPayload {
  gameId: number;
  stats: {
    totalPlayers: number;
    totalPlayersInParens: number;
    totalCards: number;
    totalCardsInParens: number;
    realPlayerCount: number;
    totalEnrollmentCards: number;
    botCount: number;
    newBalance?: number;
  };
}

export interface BalanceUpdatedPayload {
  playerId: number;
  balance: number;
  requestId: number;
  type: 'deposit' | 'withdrawal';
  status: 'approved';
}

export interface PendingRejectedPayload {
  playerId: number;
  requestId: number;
  type: 'deposit' | 'withdrawal';
}
