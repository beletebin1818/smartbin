/**
 * API Client - Axios-based HTTP client for backend communication
 *
 * Features:
 * - Base URL configuration
 * - Request/response interceptors
 * - Authentication token handling
 * - Error handling
 * - Type-safe API methods
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { roleToDisplay, displayToRole } from '../roles';
import type {
  Agent,
  AgentStats,
  AgentFormPayload,
  AgentsQueryParams,
  AgentsPageResponse,
  AdminUser,
  NewAdminUserPayload,
  UpdateAdminUserPayload,
  PlayersQueryParams,
  RevenueSummaryCard,
  WalletTab,
  WalletTransaction,
  WalletLedgerResponse,
  UpdateWalletPayload,
  AgentTransactionsQueryParams,
  AgentTransactionsResponse,
} from '@/types';

// ─── Configuration ─────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// ─── Create axios instance ───────────────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor - Add auth token ─────────────────────────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get token from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token && config.headers) {
        (config.headers as any).Authorization = 'Bearer ' + token;`Bearer ${token}`;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ─── Response interceptor - Handle errors ─────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle common error scenarios
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;

      if (status === 401) {
        // Unauthorized - clear token and redirect to login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
      } else if (status === 403) {
        // Forbidden - insufficient permissions
        console.error('Access forbidden:', error.response.data);
      } else if (status >= 500) {
        // Server error
        console.error('Server error:', error.response.data);
      }
    } else if (error.request) {
      // Request made but no response received
      console.error('Network error - no response received');
    } else {
      // Error in request configuration
      console.error('Request error:', error.message);
    }

    return Promise.reject(error);
  }
);

// ─── Revenue helpers ─────────────────────────────────────────────────────────────
// Tab → transaction-type mapping (mirrors backend TAB_TYPE_MAP)

const TAB_TYPE_MAP: Record<WalletTab, string[]> = {
  game:   ['bet', 'win'],
  agent:  ['agent_credit', 'agent_debit'],
  player: ['deposit', 'withdrawal'],
  bonus:  ['bonus'],
  direct: ['refund'],
};

// Transaction type → credited/debited
const CREDITED_TYPES = new Set([
  'deposit', 'win', 'bonus', 'agent_credit',
]);

// Source labels for the ledger table
const TAB_SOURCE_LABELS: Record<WalletTab, string> = {
  game:   'Game Share',
  agent:  'Agent Commission',
  player: 'Player Deposit',
  bonus:  'Bonus Grant',
  direct: 'Direct Transfer',
};

// ─── API Methods ─────────────────────────────────────────────────────────────────

// ─── Shared shape adapters ─────────────────────────────────────────────
// The backend stores names/booleans in its own shape (firstName/lastName,
// boolean status, raw AdminRole enum values). These helpers translate that
// into the display-friendly shape the existing UI components expect, so the
// components themselves never have to change.

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() };
}

interface BackendAdminUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string | null;
  role: string;
  status: boolean;
  jobTitle: string | null;
  createdAt?: string;
}

function mapBackendAdminUser(u: BackendAdminUser): AdminUser {
  return {
    id: String(u.id),
    name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
    username: u.username,
    role: roleToDisplay(u.role),
    status: u.status ? 'active' : 'inactive',
    jobTitle: u.jobTitle ?? '',
  };
}

interface BackendAgent {
  id: number;
  username: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string;
  balance: number;
  commissionRate: number;
  status: boolean;
  live: boolean;
  reserved: number;
  registeredBy: string;
  createdAt: string;
}

function mapBackendAgent(a: BackendAgent): Agent {
  return {
    id: String(a.id),
    username: a.username,
    phone: a.phoneNumber,
    name: `${a.firstName} ${a.lastName ?? ''}`.trim(),
    rate: a.commissionRate ?? 0,
    active: !!a.status,
    live: !!a.live,
    balance: a.balance ?? 0,
    reserved: a.reserved ?? 0,
    registeredBy: a.registeredBy ?? 'System',
    createdAt: a.createdAt,
  };
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────

  async login(username: string, password: string) {
    const response = await apiClient.post('/auth/login', { username, password });
    return response.data as {
      success: boolean;
      token?: string;
      message?: string;
      user?: {
        id: number;
        username: string;
        firstName: string;
        lastName: string | null;
        role: string;
      };
    };
  },

  async me() {
    const response = await apiClient.get('/auth/me');
    return response.data as {
      success: boolean;
      user: {
        id: number;
        username: string;
        firstName: string;
        lastName: string | null;
        role?: string;
        status?: boolean;
        userType: string;
      };
    };
  },

  async logout() {
    const response = await apiClient.post('/auth/logout');
    return response.data as { success: boolean; message?: string };
  },

  // ── Pending Requests ─────────────────────────────────────────────────────────

  async getPendingRequests(params: {
    type?: 'deposit' | 'withdrawal';
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const response = await apiClient.get('/pending', { params });
    const backendData = response.data.data || response.data;

    // Transform backend Prisma response to frontend format
    const transformedData = Array.isArray(backendData)
      ? backendData.map((req: any) => {
          // Attempt to extract the processing agent (the authenticated admin/agent who
          // approved/rejected/processed this request). Backends might use different
          // field names depending on implementation. Prefer username fields, then
          // fall back to name fields, and finally to req.agent if available.
          const agentUsernameCandidates = [
            req.processedBy?.username,
            req.processedByUsername,
            req.approvedBy?.username,
            req.rejectedBy?.username,
            req.approver?.username,
            req.rejectedByUsername,
            req.approvedByUsername,
            req.handler?.username,
            req.handledBy?.username,
            req.processor?.username,
            req.agent?.username,
            req.processedBy ? `${req.processedBy.firstName || ''} ${req.processedBy.lastName || ''}`.trim() : null,
            req.approvedBy ? `${req.approvedBy.firstName || ''} ${req.approvedBy.lastName || ''}`.trim() : null,
            req.rejectedBy ? `${req.rejectedBy.firstName || ''} ${req.rejectedBy.lastName || ''}`.trim() : null,
            req.agent ? `${req.agent.firstName || ''} ${req.agent.lastName || ''}`.trim() : null,
          ];

          const agentUsername = agentUsernameCandidates.find((v: any) => !!v) || null;

          return {
            id: String(req.id),
            type: req.type,
            userName: req.player ? `${req.player.firstName || ''} ${req.player.lastName || ''}`.trim() : 'Unknown',
            userPhone: req.player?.phoneNumber || 'N/A',
            amount: req.amount || 0,
            agentUsername: agentUsername,
            date: req.createdAt,
            status: req.status.charAt(0).toUpperCase() + req.status.slice(1),
          };
        })
      : [];

    return {
      data: transformedData,
      total: response.data.total || transformedData.length,
    };
  },

  async approveRequest(id: number, amount?: number) {
    const response = await apiClient.put(`/pending/${id}/approve`, { amount });
    return response.data;
  },

  async rejectRequest(id: number, note?: string) {
    const response = await apiClient.put(`/pending/${id}/reject`, { note });
    return response.data;
  },

  async getPendingRequestStats() {
    const response = await apiClient.get('/pending/stats');
    return response.data.data;
  },

  // ── Payment Accounts ───────────────────────────────────────────────────────────

  async getPaymentAccounts() {
    const response = await apiClient.get('/payment-accounts');
    return response.data;
  },

  async createPaymentAccount(data: {
    method: string;
    accountName: string;
    accountNumber: string;
    isActive?: boolean;
    displayOrder?: number;
  }) {
    const response = await apiClient.post('/payment-accounts', data);
    return response.data;
  },

  async updatePaymentAccount(id: number, data: {
    method?: string;
    accountName?: string;
    accountNumber?: string;
    isActive?: boolean;
    displayOrder?: number;
  }) {
    const response = await apiClient.put(`/payment-accounts/${id}`, data);
    return response.data;
  },

  async deletePaymentAccount(id: number) {
    const response = await apiClient.delete(`/payment-accounts/${id}`);
    return response.data;
  },

  // ── Games ──────────────────────────────────────────────────────────────────────

  /**
   * GET /api/games — list games by status.
   * Backend returns { success, data: Game[], total }.
   */
  async getGames(params?: { status?: string; page?: number; limit?: number }) {
    const response = await apiClient.get('/games', { params });
    return response.data;
  },

  /**
   * GET /api/games/live — the single in_progress game with sessions + players.
   * Backend returns { success, data: Game | null }.
   * Game.sessions includes player fields.
   */
  async getLiveGame() {
    const response = await apiClient.get('/games/live');
    return response.data as {
      success: boolean;
      data: null | {
        id: number;
        status: string;
        prize: number;
        cardPrice: number;
        totalCards: number;
        drawnNumbers: number[];
        currentNumber: number | null;
        drawIndex: number;
        winnerCount: number;
        mode: string;
        startedAt: string | null;
        endedAt: string | null;
        createdAt: string;
        sessions: Array<{
          id: number;
          bet: number;
          cardCount: number;
          totalBet: number;
          status: string;
          joinedAt: string;
          playerId: number;
          player: {
            id: number;
            firstName: string;
            lastName: string | null;
            phoneNumber: string | null;
          };
        }>;
      };
    };
  },

  async getGame(id: number) {
    const response = await apiClient.get(`/games/${id}`);
    return response.data;
  },

  async createGame(data: {
    cardPrice: number;
    totalCards: number;
    mode?: 'automatic' | 'manual';
  }) {
    const response = await apiClient.post('/games', data);
    return response.data;
  },

  async updateGame(id: number, data: {
    cardPrice?: number;
    status?: string;
  }) {
    const response = await apiClient.put(`/games/${id}`, data);
    return response.data;
  },

  // ── Players ────────────────────────────────────────────────────────────────────

  async getPlayers(params?: PlayersQueryParams) {
    const response = await apiClient.get('/players', {
      params: {
        ...params,
        telegramId: params?.telegramId ?? params?.fullName,
        page: params?.page ? params.page - 1 : undefined,
      },
    });

    const payload = response.data;
    const total = payload.total || 0;
    const limit = params?.limit || 20;
    return {
      players: Array.isArray(payload.data) ? payload.data : [],
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalCount: total,
    };
  },

  async getPlayerStats() {
    const response = await apiClient.get('/players/stats');
    return response.data.data;
  },

  async getPlayer(id: number) {
    const response = await apiClient.get(`/players/${id}`);
    return response.data;
  },

  async updatePlayerBalance(id: number, data: { balance: number }) {
    const response = await apiClient.put(`/players/${id}/balance`, data);
    return response.data;
  },

  async updatePlayerStatus(id: number, data: { status: boolean }) {
    const response = await apiClient.put(`/players/${id}/status`, data);
    return response.data;
  },

  // ── Admin Users ──────────────────────────────────────────────────

  async getAdminUsers(): Promise<AdminUser[]> {
    const response = await apiClient.get('/admin-users');
    const rows: BackendAdminUser[] = response.data.data || [];
    return rows.map(mapBackendAdminUser);
  },

  async createAdminUser(payload: NewAdminUserPayload): Promise<AdminUser> {
    const { firstName, lastName } = splitFullName(payload.name);
    const response = await apiClient.post('/admin-users', {
      username: payload.username.trim(),
      password: payload.password,
      firstName,
      lastName,
      role: displayToRole(payload.role),
      jobTitle: payload.jobTitle?.trim() || null,
      status: (payload.status ?? 'active') === 'active',
    });
    return mapBackendAdminUser(response.data.data);
  },

  async updateAdminUser(id: string, payload: UpdateAdminUserPayload): Promise<AdminUser> {
    const { firstName, lastName } = splitFullName(payload.name);
    const response = await apiClient.put(`/admin-users/${id}`, {
      username: payload.username.trim(),
      firstName,
      lastName,
      role: displayToRole(payload.role),
      jobTitle: payload.jobTitle?.trim() || null,
      status: payload.status === 'active',
    });
    return mapBackendAdminUser(response.data.data);
  },

  async resetAdminUserPassword(id: string, password: string): Promise<void> {
    await apiClient.put(`/admin-users/${id}`, { password });
  },

  async deleteAdminUser(id: string): Promise<void> {
    await apiClient.delete(`/admin-users/${id}`);
  },

  // ── Agents ──────────────────────────────────────────────

  async getAgentStats(): Promise<AgentStats> {
    const response = await apiClient.get('/agents/stats');
    return response.data.data;
  },

  async getAgents(params: AgentsQueryParams = {}): Promise<AgentsPageResponse> {
    const { page = 1, limit, ...rest } = params;
    const response = await apiClient.get('/agents', {
      params: { ...rest, page: page - 1, limit },
    });
    const rows: BackendAgent[] = response.data.data || [];
    return {
      agents: rows.map(mapBackendAgent),
      totalPages: response.data.totalPages ?? 1,
    };
  },

  async createAgent(payload: AgentFormPayload): Promise<Agent> {
    const { firstName, lastName } = splitFullName(payload.name);
    const response = await apiClient.post('/agents', {
      username: payload.username.trim(),
      password: payload.password,
      firstName,
      lastName,
      phoneNumber: payload.phone.trim(),
      commissionRate: payload.rate,
    });
    return mapBackendAgent(response.data.data);
  },

  async updateAgent(id: string, payload: AgentFormPayload): Promise<Agent> {
    const { firstName, lastName } = splitFullName(payload.name);
    const response = await apiClient.put(`/agents/${id}`, {
      username: payload.username.trim(),
      firstName,
      lastName,
      phoneNumber: payload.phone.trim(),
      commissionRate: payload.rate,
      ...(payload.password ? { password: payload.password } : {}),
    });
    return mapBackendAgent(response.data.data);
  },

  async getAgent(id: string | number): Promise<Agent> {
    const response = await apiClient.get(`/agents/${id}`);
    return mapBackendAgent(response.data.data);
  },

  async getAgentTransactions(id: string | number, params: AgentTransactionsQueryParams = {}): Promise<AgentTransactionsResponse> {
    const response = await apiClient.get(`/agents/${id}/transactions`, {
      params,
    });
    return {
      summary: response.data.summary,
      data: response.data.data || [],
      total: response.data.total || 0,
      totalPages: response.data.totalPages || 1,
    };
  },

  async deleteAgent(id: string): Promise<void> {
    await apiClient.delete(`/agents/${id}`);
  },

  // ── Settings ───────────────────────────────────────────────────────────────────

  async getGameSettings() {
    const response = await apiClient.get('/games/settings');
    return response.data.data;
  },

  async updateGameSettings(data: {
    minBet?: number;
    maxBet?: number;
    maxPlayers?: number;
    maxCardsPerPlayer?: number;
    totalCards?: number;
    initialJoinBonus?: number;
    winningLineCount?: number;
    allowJoinCancel?: boolean;
    allowAutoBets?: boolean;
    allowManualBets?: boolean;
    gameStatus?: string;
    lobbySeconds?: number;
    drawInterval?: number;
    joinWindowDuration?: number;
    idleTimeoutMinutes?: number;
    autoRestartNextGame?: boolean;
    announceBetweenGames?: boolean;
    houseEdge?: number;
    activePatterns?: string;
    supportUsername?: string;
  }) {
    const response = await apiClient.put('/games/settings', data);
    return response.data;
  },

  async getBotSettings() {
    const response = await apiClient.get('/admin/bots/settings');
    return response.data.data;
  },

  async updateBotSettings(data: {
    botsEnabled?: boolean;
    minBotPlayers?: number;
    maxBotPlayers?: number;
    botMinCards?: number;
    botMaxCards?: number;
    showBotLabels?: boolean;
    botJoinDelayMin?: number;
    botJoinDelayMax?: number;
  }) {
    const response = await apiClient.put('/admin/bots/settings', data);
    return response.data;
  },

  // ── Revenue ────────────────────────────────────────────────────────────────────

  /**
   * GET /api/revenue
   * Returns the 7 RevenueSummaryCard objects computed live from the database.
   */
  async getRevenueSummary(): Promise<RevenueSummaryCard[]> {
    const response = await apiClient.get('/revenue');
    return (response.data.data || []) as RevenueSummaryCard[];
  },

  /**
   * GET /api/revenue/ledger
   * Returns a page of wallet-ledger rows for the given tab, mapped to the
   * frontend WalletTransaction shape.
   */
  async getWalletLedger(params: {
    tab: WalletTab;
    page: number;
    limit?: number;
  }): Promise<WalletLedgerResponse> {
    const types = TAB_TYPE_MAP[params.tab];
    const limit = params.limit ?? 10;

    const response = await apiClient.get('/revenue/ledger', {
      params: {
        types: types.join(','),
        page: params.page - 1,  // backend uses 0-indexed pages
        limit,
      },
    });

    const transactions = response.data.data || [];
    const total = response.data.total || 0;
    const sourceLabel = TAB_SOURCE_LABELS[params.tab];

    const rows: WalletTransaction[] = transactions.map((tx: any) => ({
      id: String(tx.id),
      date: tx.createdAt,
      amount: tx.amount,
      currency: 'ETB',
      type: CREDITED_TYPES.has(tx.type) ? 'credited' : 'debited',
      source: sourceLabel,
      description: tx.note || '',
      tab: params.tab,
    }));

    return {
      rows,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      currentPage: params.page,
    };
  },

  /**
   * POST /api/revenue/wallet
   * Direct platform-wallet credit or debit from the Admin Dashboard.
   */
  async updateWallet(data: UpdateWalletPayload): Promise<{ success: boolean; message?: string }> {
    const response = await apiClient.post('/revenue/wallet', data);
    return response.data;
  },
};

export default apiClient;
