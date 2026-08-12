/**
 * Red Bingos — typed REST API client
 * Wraps the existing backend endpoints.
 * Base URL: VITE_API_URL (default: http://localhost:3000/api)
 */

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');

console.log('[API Client] BASE_URL:', BASE_URL);
console.log('[API Client] VITE_API_URL:', import.meta.env.VITE_API_URL);

// ── Types ────────────────────────────────────────────────────────────────────

export interface Game {
  id: number;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  prize: number;
  cardPrice: number;
  totalCards: number;
  drawnNumbers: number[];
  currentNumber: number | null;
  drawIndex: number;
  winnerCount: number;
  mode: 'automatic' | 'manual';
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  sessions?: GameSession[];
  calculatedStats?: {
    totalPlayers: number;
    totalPlayersInParens: number;
    totalCards: number;
    totalCardsInParens: number;
    realPlayerCount: number;
    totalEnrollmentCards: number;
    botCount: number;
  };
}

export interface GameSession {
  id: number;
  playerId: number;
  bet: number;
  cardCount: number;
  totalBet: number;
  status: string;
  player?: {
    id: number;
    firstName: string;
    lastName: string | null;
    phoneNumber: string | null;
    isBot: boolean;
    status: boolean;
  };
}

export interface GameSettings {
  id: number;
  minBet: number;
  maxBet: number;
  maxCardsPerPlayer: number;
  lobbySeconds: number;
  drawInterval: number;
  houseEdge: number;
  winningLineCount: number;
}

/** Card as returned by GET /api/games/:gameId/cards */
export interface LobbyCard {
  id: number;
  cardNumber: number;
  gameId: number;
  /** DB player id if claimed, otherwise null */
  playerId: number | null;
  /** True when this card is claimed by the requesting player */
  isMine: boolean;
  claimed: boolean;
  numbers?: number[];
  markedCells?: boolean[];
}

export interface PlayerProfile {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  balance: number;
  status: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const fullUrl = `${BASE_URL}${path}`;
  console.log(`[API Request] ${init?.method || 'GET'} ${fullUrl}`);
  const res = await fetch(fullUrl, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    let message = `API ${res.status}`;
    try {
      const body = await res.json() as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ── Games ────────────────────────────────────────────────────────────────────

export const gamesApi = {
  /**
   * Get live game with sessions — uses public endpoint for mini-app
   * Returns the active in_progress game with full session data including players
   * No auth required for mini-app
   */
  getLiveGame: () =>
    request<{ success: boolean; data: Game | null; liveGame?: Game | null }>('/api/games/public/lobby'),

  /**
   * Public endpoint — returns the current waiting game, or in_progress if
   * no waiting game exists. No auth required.
   */
  getLobby: () =>
    request<{ success: boolean; data: Game | null; liveGame?: Game | null }>('/api/games/public/lobby'),

  /**
   * Get a specific game by ID — public endpoint for mini-app
   * No auth required.
   */
  getGame: (gameId: number) =>
    request<{ success: boolean; data: Game }>(`/api/games/public/${gameId}`),

  /** Public settings — subset needed by the mini-app, no auth required */
  getSettings: () =>
    request<{ success: boolean; data: GameSettings }>('/api/games/public/settings'),

  /** Update lobby stake (card price) before any cards are claimed */
  updateStake: (gameId: number, cardPrice: number) =>
    request<{ success: boolean; data: Game }>(
      `/api/games/public/${gameId}/stake`,
      { method: 'PATCH', body: JSON.stringify({ cardPrice }) }
    ),
};

// ── Cards ────────────────────────────────────────────────────────────────────

export const cardsApi = {
  /**
   * List all cards for a game.
   * Pass playerId so the backend can mark isMine correctly.
   */
  list: (gameId: number, playerId?: number) => {
    const qs = playerId !== undefined ? `?playerId=${playerId}` : '';
    return request<{ success: boolean; data: LobbyCard[] }>(
      `/api/games/${gameId}/cards${qs}`
    );
  },

  /**
   * Claim a card. Backend expects playerId (DB integer) and stake (card price).
   */
  claim: (gameId: number, cardNumber: number, playerId: number, stake: number) =>
    request<{ success: boolean; message: string; data: { cardNumber: number; playerId: number; newBalance: number } }>(
      `/api/games/${gameId}/cards/${cardNumber}/claim`,
      { method: 'POST', body: JSON.stringify({ playerId, stake }) }
    ),

  /**
   * Unclaim / release a card. Backend expects playerId (DB integer).
   */
  unclaim: (gameId: number, cardNumber: number, playerId: number) =>
    request<{ success: boolean; message: string; data: { cardNumber: number; newBalance: number } }>(
      `/api/games/${gameId}/cards/${cardNumber}/claim`,
      { method: 'DELETE', body: JSON.stringify({ playerId }) }
    ),
};

// ── Player ───────────────────────────────────────────────────────────────────

export const playerApi = {
  /** Look up player by Telegram ID string to get their DB integer id */
  getProfile: (telegramId: string) =>
    request<{ success: boolean; data: PlayerProfile }>(`/api/bot/${telegramId}/profile`),
};
