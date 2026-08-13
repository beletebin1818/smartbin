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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      const refreshToken = localStorage.getItem('refresh_token');
      
      if (token && config.headers) {
        (config.headers as any).Authorization = 'Bearer ' + token;
      }
      
      // Add refresh token if available
      if (refreshToken && config.headers) {
        (config.headers as any)['X-Refresh-Token'] = refreshToken;
      }
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
      } else if (status === 403) {
        console.error('Access forbidden:', error.response.data);
      } else if (status >= 500) {
        console.error('Server error:', error.response.data);
      }
    } else if (error.request) {
      console.error('Network error - no response received');
    } else {
      console.error('Request error:', error.message);
    }
    return Promise.reject(error);
  },
);

const TAB_TYPE_MAP: Record<WalletTab, string[]> = {
  game: ['bet', 'win'],
  agent: ['agent_credit', 'agent_debit'],
  player: ['deposit', 'withdrawal'],
  bonus: ['bonus'],
  direct: ['refund'],
};

const CREDITED_TYPES = new Set(['deposit', 'win', 'bonus', 'agent_credit']);

const TAB_SOURCE_LABELS: Record<WalletTab, string> = {
  game: 'Game Share',
  agent: 'Agent Commission',
  player: 'Player Deposit',
  bonus: 'Bonus Grant',
  direct: 'Direct Transfer',
};

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
  cbeAccount?: string | null;
  cbeHolder?: string | null;
  telebirrPhone?: string | null;
  telebirrHolder?: string | null;
  registeredBy: string;
  createdAt: string;
  role?: string;
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
    cbeAccount: a.cbeAccount ?? null,
    cbeHolder: a.cbeHolder ?? null,
    telebirrPhone: a.telebirrPhone ?? null,
    telebirrHolder: a.telebirrHolder ?? null,
    registeredBy: a.registeredBy ?? 'System',
    createdAt: a.createdAt,
    role: a.role,
  };
}

export const api = {
  async login(username: string, password: string) {
    // Generate device fingerprint for security
    const deviceFingerprint = await this.generateDeviceFingerprint();
    const deviceInfo = this.getDeviceInfo();
    
    const response = await apiClient.post('/auth/login', { 
      username, 
      password,
      deviceFingerprint,
      ...deviceInfo
    });
    return response.data as {
      success: boolean;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: string;
      refreshTokenExpiresIn?: string;
      message?: string;
      requiresApproval?: boolean;
      requiresOtp?: boolean;
      deviceId?: number;
      deviceInfo?: any;
      rateLimitExceeded?: boolean;
      remainingAttempts?: number;
      deviceBlocked?: boolean;
      deviceName?: string;
      blockedAt?: string;
      failedOtpAttempts?: number;
      user?: {
        id: number;
        username: string;
        firstName: string;
        lastName: string | null;
        role: string;
      };
    };
  },

  async generateDeviceFingerprint(): Promise<string> {
    // Simple device fingerprint using available browser info
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.platform,
    ].join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  },

  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    const transformedData = Array.isArray(backendData)
      ? backendData.map((req: any) => {
          // Determine who processed (approved/rejected) the request.
          // Priority: 1) Agent who processed it, 2) Admin who processed it, 3) Player's assigned agent
          const agentUsername =
            req.processedByAgent?.username  // Agent who approved/rejected
            || req.processedBy?.username    // Admin who approved/rejected
            || req.agent?.username          // Player's assigned agent
            || null;


          return {
            id: String(req.id),
            type: req.type,
            playerId: String(req.player?.id ?? ''),
            userName: req.player ? `${req.player.firstName || ''} ${req.player.lastName || ''}`.trim() : 'Unknown',
            username: req.player?.username || '',
            userPhone: req.player?.phoneNumber || 'N/A',
            amount: req.amount || 0,
            method: req.method || null,
            accountNumber: req.accountNumber || null,
            accountHolder: req.accountHolder || null,
            transactionId: req.transactionId || null,
            agentUsername: agentUsername,
            date: req.createdAt,
            status: req.status.charAt(0).toUpperCase() + req.status.slice(1),
            verification: req.depositVerification ? {
              status: req.depositVerification.verificationStatus,
              mismatchFields: req.depositVerification.mismatchFields,
              receiptUrl: req.depositVerification.receiptUrl,
              smsAmount: req.depositVerification.smsData?.amount || null,
              receiptAmount: req.depositVerification.receiptData?.amount || null,
            } : null,
          };
        })
      : [];

    return {
      data: transformedData,
      total: response.data.total || transformedData.length,
    };
  },

  async approveRequest(id: number, amount?: number, transactionId?: string) {
    const response = await apiClient.put(`/pending/${id}/approve`, { amount, transactionId });
    return response.data;
  },

  async rejectRequest(id: number, note?: string) {
    const response = await apiClient.put(`/pending/${id}/reject`, { note });
    return response.data;
  },

  async getPendingRequestStats(params?: { dateFrom?: string; dateTo?: string; search?: string }) {
    const response = await apiClient.get('/pending/stats', { params });
    return response.data.data;
  },

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

  async getGames(params?: { status?: string; page?: number; limit?: number }) {
    const response = await apiClient.get('/games', { params });
    return response.data;
  },

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
        calculatedStats?: {
          totalPlayers: number;
          totalPlayersInParens: number;
          totalCards: number;
          totalCardsInParens: number;
          realPlayerCount: number;
          totalEnrollmentCards: number;
          botCount: number;
          humanContribution?: number;
        };
      };
    };
  },

  async getLobby() {
    const response = await apiClient.get('/games/public/lobby');
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
            isBot: boolean;
            status: boolean;
          };
        }>;
      };
      liveGame?: any;
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

  async getPlayerTelegramPhoto(id: number) {
    const response = await apiClient.get(`/players/${id}/telegram-photo`);
    return response.data as { success: boolean; photoUrl: string | null };
  },

  async getPlayerGames(id: number, params?: { dateFrom?: string; dateTo?: string; winStatus?: string }) {
    const response = await apiClient.get(`/players/${id}/games`, { params });
    return response.data as {
      success: boolean;
      data: Array<{
        gameId: number;
        sessionId: number;
        startTime: string;
        endTime: string;
        cardsPlayed: number[];
        status: string;
        sessionStatus: string;
        result: 'win' | 'loss';
        bet: number;
        totalPlayers: number;
      }>;
    };
  },

  async updatePlayerBalance(id: number, data: { balance: number }) {
    const response = await apiClient.put(`/players/${id}/balance`, data);
    return response.data;
  },

  async updatePlayerStatus(id: number, data: { status: boolean }) {
    const response = await apiClient.put(`/players/${id}/status`, data);
    return response.data;
  },

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
      status: payload.active !== undefined ? payload.active : true,
      cbeAccount: payload.cbeAccount || null,
      cbeHolder: payload.cbeHolder || null,
      telebirrPhone: payload.telebirrPhone || null,
      telebirrHolder: payload.telebirrHolder || null,
      ...(payload.role ? { role: payload.role } : {}),
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
      ...(payload.active !== undefined ? { status: payload.active } : {}),
      ...(payload.password ? { password: payload.password } : {}),
      cbeAccount: payload.cbeAccount !== undefined ? (payload.cbeAccount || null) : undefined,
      cbeHolder: payload.cbeHolder !== undefined ? (payload.cbeHolder || null) : undefined,
      telebirrPhone: payload.telebirrPhone !== undefined ? (payload.telebirrPhone || null) : undefined,
      telebirrHolder: payload.telebirrHolder !== undefined ? (payload.telebirrHolder || null) : undefined,
      ...(payload.role ? { role: payload.role } : {}),
    });
    return mapBackendAgent(response.data.data);
  },

  async getAgent(id: string | number): Promise<Agent> {
    const response = await apiClient.get(`/agents/${id}`);
    return mapBackendAgent(response.data.data as BackendAgent);
  },

  async getAgentTransactions(id: string | number, params: AgentTransactionsQueryParams = {}): Promise<AgentTransactionsResponse> {
    const response = await apiClient.get(`/agents/${id}/transactions`, {
      params: {
        type: params.type,
        status: params.status,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        search: params.search,
        method: params.method,
        minAmount: params.minAmount,
        maxAmount: params.maxAmount,
        page: params.page,
        limit: params.limit,
      },
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

  async agentWalletChange(id: string, payload: { type: 'deposit' | 'withdraw'; amount: number; note?: string }): Promise<{ success: boolean; message: string; data: import('@/types').Agent }> {
    const response = await apiClient.post(`/agents/${id}/wallet`, payload);
    const raw = response.data;
    return {
      success: raw.success,
      message: raw.message,
      data: mapBackendAgent(raw.data as BackendAgent),
    };
  },

  async getAgentBankAccounts(agentId: string | number) {
    const response = await apiClient.get(`/agent-bank-accounts/agents/${agentId}/bank-accounts`);
    return response.data.data || [];
  },

  async createAgentBankAccount(agentId: string | number, payload: { method: string; accountName: string; accountNumber: string; isActive?: boolean; displayOrder?: number }) {
    const response = await apiClient.post(`/agent-bank-accounts/agents/${agentId}/bank-accounts`, payload);
    return response.data.data;
  },

  async updateAgentBankAccount(accountId: string | number, payload: { method?: string; accountName?: string; accountNumber?: string; isActive?: boolean; displayOrder?: number }) {
    const response = await apiClient.put(`/agent-bank-accounts/bank-accounts/${accountId}`, payload);
    return response.data.data;
  },

  async deleteAgentBankAccount(accountId: string | number) {
    await apiClient.delete(`/agent-bank-accounts/bank-accounts/${accountId}`);
  },

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

  async getRevenueSummary(): Promise<RevenueSummaryCard[]> {
    const response = await apiClient.get('/revenue');
    return (response.data.data || []) as RevenueSummaryCard[];
  },

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
        page: params.page - 1,
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

  async updateWallet(data: UpdateWalletPayload): Promise<{ success: boolean; message?: string }> {
    const response = await apiClient.post('/revenue/wallet', data);
    return response.data;
  },

  async validateOtp(otp: string, deviceId: number) {
    const response = await apiClient.post('/auth/validate-otp', { otp, deviceId });
    return response.data as {
      success: boolean;
      message?: string;
      accessToken?: string;
      refreshToken?: string;
      user?: {
        id: number;
        username: string;
        firstName: string;
        lastName?: string;
        role: string;
      };
    };
  },

  async sendBroadcast(data: {
    mode: 'global' | 'targeted';
    playerIds?: string[];
    subject?: string;
    message: string;
    imageUrl?: string | null;
  }) {
    const response = await apiClient.post('/admin/broadcast', data);
    return response.data as {
      success: boolean;
      message: string;
      data?: {
        broadcastId: number;
        mode: string;
        targetCount: number;
        sentCount: number;
        failedCount: number;
      };
    };
  },
};

export default apiClient;
