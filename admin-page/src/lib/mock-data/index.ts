import type {
  LiveEngineStats,
  DrawnNumbersData,
  AdminUser,
  AuthUser,
  LoginResponse,
  NewAdminUserPayload,
  UpdateAdminUserPayload,
  PreviousGame,
  PreviousGamesParams,
  WalletTransaction,
  WalletLedgerParams,
  WalletLedgerResponse,
  WalletTab,
  RevenueSummaryCard,
  BroadcastPayload,
  BroadcastResponse,
  Agent,
  AgentStats,
  AgentFormPayload,
  AgentStatusFilter,
  AgentLiveFilter,
  AgentsQueryParams,
  AgentsPageResponse,
  PendingRequest,
  PendingRequestStats,
  RequestType,
  RequestStatusFilter,
  PendingRequestsQueryParams,
  PendingRequestsPageResponse,
  GameSettings,
  SettingsTab,
  SaveSettingsResponse,
} from '@/types';

// NOTE: This file previously contained large in-memory mock seed arrays used
// by the UI. To ensure the Admin UI always uses live backend data, the seed
// arrays were removed and the helper functions below now forward to the
// backend API. The file remains in place to avoid breaking import paths.

import { api } from '@/lib/api/index';
import { apiClient } from '@/lib/api/client';

// --- Helpers / minimal fallbacks ---------------------------------------------

function emptyDelay<T>(data: T): Promise<T> {
  // Keep a tiny async boundary for callers relying on Promises
  return Promise.resolve(data);
}

// --- Live Engine Stats -------------------------------------------------------
export async function getLiveEngineStats(): Promise<LiveEngineStats> {
  try {
    const payload = await api.getLiveGame();
    const game = payload?.data || null;
    if (!game) return emptyDelay({ status: 'Pending', totalPrizePool: 0, prizePoolCurrency: 'ETB', totalPlayers: 0, totalPlayersInParens: 0, totalCards: 0, totalCardsInParens: 0, startTime: new Date().toISOString(), realPlayerCount: 0, totalEnrollmentCards: 0, botCount: 0 });

    return {
      status: game.status || 'Pending',
      totalPrizePool: game.prize || 0,
      prizePoolCurrency: 'ETB',
      totalPlayers: Array.isArray(game.sessions) ? game.sessions.length : 0,
      totalPlayersInParens: Array.isArray(game.sessions) ? game.sessions.length : 0,
      totalCards: game.totalCards || 0,
      totalCardsInParens: game.totalCards || 0,
      startTime: game.startedAt || new Date().toISOString(),
      realPlayerCount: 0,
      totalEnrollmentCards: 0,
      botCount: 0,
    } as LiveEngineStats;
  } catch (err) {
    console.error('getLiveEngineStats failed, returning empty fallback', err);
    return emptyDelay({ status: 'Pending', totalPrizePool: 0, prizePoolCurrency: 'ETB', totalPlayers: 0, totalPlayersInParens: 0, totalCards: 0, totalCardsInParens: 0, startTime: new Date().toISOString(), realPlayerCount: 0, totalEnrollmentCards: 0, botCount: 0 });
  }
}

// --- Drawn Numbers -----------------------------------------------------------
export async function getDrawnNumbers(): Promise<DrawnNumbersData> {
  try {
    const payload = await api.getLiveGame();
    const game = payload?.data || null;
    const drawn: number[] = Array.isArray(game?.drawnNumbers) ? game.drawnNumbers : [];
    const total = game?.totalCards ?? 75;
    return { drawn, total };
  } catch (err) {
    console.error('getDrawnNumbers failed, returning empty list', err);
    return { drawn: [], total: 75 };
  }
}

// --- Auth --------------------------------------------------------------------
export async function loginAdmin(username: string, password: string): Promise<LoginResponse> {
  try {
    const res = await api.login(username, password);
    return res as LoginResponse;
  } catch (err: any) {
    console.error('loginAdmin failed', err);
    return { success: false, error: err?.message || 'Login failed' } as LoginResponse;
  }
}

// --- Admin Users Management ---------------------------------------------------
export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    return await api.getAdminUsers();
  } catch (err) {
    console.error('getAdminUsers failed', err);
    return [];
  }
}

export async function addAdminUser(payload: NewAdminUserPayload): Promise<AdminUser> {
  try {
    return await api.createAdminUser(payload);
  } catch (err) {
    console.error('addAdminUser failed', err);
    throw err;
  }
}

export async function deleteAdminUser(id: string): Promise<void> {
  try {
    await api.deleteAdminUser(id);
  } catch (err) {
    console.error('deleteAdminUser failed', err);
    throw err;
  }
}

export async function toggleAdminUserStatus(id: string): Promise<AdminUser> {
  try {
    // Fetch current list, find user and toggle status via updateAdminUser
    const users = await api.getAdminUsers();
    const u = users.find((x) => x.id === id);
    if (!u) throw new Error('Admin user not found');

    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const payload: UpdateAdminUserPayload = {
      name: u.name,
      username: u.username,
      role: u.role,
      jobTitle: u.jobTitle ?? '',
      status: newStatus,
      password: undefined,
    } as any;

    return await api.updateAdminUser(id, payload);
  } catch (err) {
    console.error('toggleAdminUserStatus failed', err);
    throw err;
  }
}

export async function updateAdminUser(id: string, payload: UpdateAdminUserPayload): Promise<AdminUser> {
  try {
    return await api.updateAdminUser(id, payload);
  } catch (err) {
    console.error('updateAdminUser failed', err);
    throw err;
  }
}

export async function resetAdminPassword(id: string, newPassword: string): Promise<void> {
  try {
    await api.resetAdminUserPassword(id, newPassword);
  } catch (err) {
    console.error('resetAdminPassword failed', err);
    throw err;
  }
}

// --- Previous Games -----------------------------------------------------------
export async function getPreviousGames(params?: PreviousGamesParams): Promise<PreviousGame[]> {
  try {
    const payload = await api.getGames({ page: params?.page, limit: params?.limit });
    // Backend convention: payload.data contains games
    return (payload?.data || []) as PreviousGame[];
  } catch (err) {
    console.error('getPreviousGames failed', err);
    return [];
  }
}

// --- Revenue Summary / Ledger -------------------------------------------------
// These already forwarded to backend in prior changes � keep forwarding.
export async function getRevenueSummary(): Promise<RevenueSummaryCard[]> {
  try {
    const res = await api.getRevenueSummary();
    return res || [];
  } catch (err) {
    console.error('getRevenueSummary failed', err);
    return [];
  }
}

export async function getWalletLedger(params: WalletLedgerParams): Promise<WalletLedgerResponse> {
  try {
    const r = await api.getWalletLedger({ tab: params.tab, page: params.page, limit: params.limit });
    return r || { rows: [], totalPages: 1, currentPage: params.page };
  } catch (err) {
    console.error('getWalletLedger failed', err);
    return { rows: [], totalPages: 1, currentPage: params.page };
  }
}

// --- Broadcast ---------------------------------------------------------------
export async function sendBroadcast(payload: BroadcastPayload): Promise<BroadcastResponse> {
  try {
    const res = await apiClient.post('/broadcast/send', payload);
    return res.data as BroadcastResponse;
  } catch (err) {
    console.error('sendBroadcast failed', err);
    return { success: false, queued: 0 } as BroadcastResponse;
  }
}

// --- Agents -------------------------------------------------------------------
export async function getAgentStats(): Promise<AgentStats> {
  try {
    return await api.getAgentStats();
  } catch (err) {
    console.error('getAgentStats failed', err);
    return { totalAgents: 0, liveAgents: 0, totalWalletBalance: 0, totalReservedBalance: 0 };
  }
}

export async function getAgents(params: AgentsQueryParams = {}): Promise<AgentsPageResponse> {
  try {
    return await api.getAgents(params);
  } catch (err) {
    console.error('getAgents failed', err);
    return { agents: [], totalPages: 1 };
  }
}

export async function createAgent(payload: AgentFormPayload): Promise<Agent> {
  try {
    return await api.createAgent(payload);
  } catch (err) {
    console.error('createAgent failed', err);
    throw err;
  }
}

export async function updateAgent(id: string, payload: AgentFormPayload): Promise<Agent> {
  try {
    return await api.updateAgent(id, payload);
  } catch (err) {
    console.error('updateAgent failed', err);
    throw err;
  }
}

export async function deleteAgent(id: string): Promise<void> {
  try {
    await api.deleteAgent(id);
  } catch (err) {
    console.error('deleteAgent failed', err);
    throw err;
  }
}

// --- Pending Requests --------------------------------------------------------
export async function getPendingRequestStats(): Promise<PendingRequestStats> {
  try {
    return await api.getPendingRequestStats();
  } catch (err) {
    console.error('getPendingRequestStats failed', err);
    return { pendingDeposits: 0, pendingWithdrawals: 0, totalDepositAmount: 0, totalWithdrawalAmount: 0 };
  }
}

export async function getPendingRequests(params: PendingRequestsQueryParams): Promise<PendingRequestsPageResponse> {
  try {
    const payload = await api.getPendingRequests({
      type: params.type,
      page: params.page,
      limit: params.limit,
      search: params.search,
      status: params.statusFilter,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    } as any);
    // api.getPendingRequests returns { data, total }
    return { requests: payload.data || [], totalPages: payload.total || 1 } as PendingRequestsPageResponse;
  } catch (err) {
    console.error('getPendingRequests failed', err);
    return { requests: [], totalPages: 1 };
  }
}

export async function approveRequest(id: string, type: RequestType): Promise<PendingRequest> {
  try {
    const res = await api.approveRequest(Number(id));
    return res;
  } catch (err) {
    console.error('approveRequest failed', err);
    throw err;
  }
}

export async function rejectRequest(id: string, type: RequestType): Promise<PendingRequest> {
  try {
    const res = await api.rejectRequest(Number(id));
    return res;
  } catch (err) {
    console.error('rejectRequest failed', err);
    throw err;
  }
}

// --- Game Settings -----------------------------------------------------------
export async function getGameSettings(): Promise<GameSettings> {
  try {
    return await api.getGameSettings();
  } catch (err) {
    console.error('getGameSettings failed', err);
    return {} as GameSettings;
  }
}

export async function saveGameSettings(tab: SettingsTab, data: any): Promise<SaveSettingsResponse> {
  try {
    await api.updateGameSettings(data as any);
    return { success: true, message: 'Settings saved successfully.' };
  } catch (err) {
    console.error('saveGameSettings failed', err);
    return { success: false, message: 'Failed to save settings.' };
  }
}

// Export a marker to indicate seeds were removed (useful for tests/tools)
export const __MOCK_SEEDS_REMOVED = true;
