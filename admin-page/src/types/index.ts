// ─── Live Engine ────────────────────────────────────────────────────────────

export type GameStatus = "Active" | "Completed" | "Paused" | "Pending";

export interface LiveEngineStats {
  status: GameStatus;
  totalPrizePool: number;
  prizePoolCurrency: string;
  totalPlayers: number;
  totalPlayersInParens: number;
  totalCards: number;
  totalCardsInParens: number;
  startTime: string; // ISO string
  // Enrollment statistics
  realPlayerCount: number; // Real human players only
  totalEnrollmentCards: number; // Bots + real players cards - 15
  botCount: number;
}

// Server-calculated stats from API
export interface GameCalculatedStats {
  totalPlayers: number;
  totalPlayersInParens: number;
  totalCards: number;
  totalCardsInParens: number;
  realPlayerCount: number;
  totalEnrollmentCards: number;
  botCount: number;
  humanContribution?: number;
}

// ─── Drawn Numbers ──────────────────────────────────────────────────────────

export interface DrawnNumbersData {
  drawn: number[];
  total: number; // e.g. 75
}

// ─── Auth ────────────────────────────────────────────────────────────────────

// ─── Players Table ──────────────────────────────────────────────────────────

export type PlayMode = "Auto" | "Manual";

export interface PlayerRow {
  id: string;
  name: string;
  phone: string;
  stake: number;
  cards: number;
  totalBet: number;
  mode: PlayMode;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type AdminRole = "Super Admin" | "Admin" | "Moderator" | "Support" | "Agent";
export type AdminStatus = "active" | "inactive";

export interface AdminUser {
  id: string;
  name: string;
  username: string;
  role: AdminRole;
  status: AdminStatus;
  jobTitle?: string;   // optional — e.g. "Super Admin", "Manager"
}

export interface AuthUser extends AdminUser {
  token: string;
}

export interface LoginResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

// ─── Admin Users Management ──────────────────────────────────────────────────

export interface NewAdminUserPayload {
  name: string;
  username: string;
  password: string;
  role: AdminRole;
  jobTitle?: string;
  status?: AdminStatus;   // default "active" when omitted
}

export interface UpdateAdminUserPayload {
  name: string;
  username: string;
  role: AdminRole;
  jobTitle?: string;
  status: AdminStatus;
}

// ─── Previous Games ──────────────────────────────────────────────────────────

export type PreviousGameStatus = "Completed" | "Waiting for Players" | "Cancelled";

export interface PreviousGame {
  id: string;        // short hex-style ID e.g. "8DD50369"
  status: PreviousGameStatus;
  prize: number;
  prizeCurrency: string;
  cards: number;
  createdAt: string; // ISO string
}

export interface PreviousGamesParams {
  page?: number;
  limit?: number;
}

// ─── Revenue Summary ─────────────────────────────────────────────────────────

export interface RevenueSummaryCard {
  id: string;
  title: string;
  amount: number;        // e.g. -163007.78
  currency: string;      // "ETB"
  subtitle: string;      // e.g. "Total Credits: 16144557.3, Total Debits: 24290509.2"
  iconType: "wallet" | "game" | "bonus" | "arrows" | "agent" | "player" | "direct";
}

// ─── Wallet Ledger ───────────────────────────────────────────────────────────

export type WalletTransactionType = "credited" | "debited";

export type WalletTab = "game" | "agent" | "player" | "bonus" | "direct";

export interface WalletTransaction {
  id: string;
  date: string;           // ISO string
  amount: number;
  currency: string;       // e.g. "ETB"
  type: WalletTransactionType;
  source: string;         // e.g. "Game Share"
  description: string;   // e.g. "Platform share for game <uuid>"
  tab: WalletTab;
}

export interface WalletLedgerParams {
  tab: WalletTab;
  page: number;           // 1-indexed
  limit?: number;         // default 10
}

export interface WalletLedgerResponse {
  rows: WalletTransaction[];
  totalPages: number;
  currentPage: number;
}

export interface UpdateWalletPayload {
  amount: number;
  type: WalletTransactionType;
  description: string;
}

// ─── Players Page ─────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  fullName: string;
  phone: string;
  username: string | null;
  balance: number;
  gamesPlayed: number;
  joinedAt: string; // ISO string
  points: number;
  status?: boolean;
  telegramId?: string;
  language?: string;
  agent?: string | null;
}

export type PlayerSortField = "joinedAt" | "fullName" | "balance" | "gamesPlayed" | "points";
export type SortDirection = "asc" | "desc";

export interface PlayersQueryParams {
  fullName?: string;
  username?: string;
  phone?: string;
  telegramId?: string;
  minPoints?: number;
  sortField?: PlayerSortField;
  sortDirection?: SortDirection;
  page?: number;
  limit?: number;
}

export interface PlayersPageResponse {
  players: Player[];
  totalPages: number;
  totalCount: number;
}

export interface PlayerStats {
  totalPlayers: number;
  totalWalletBalance: number;
  totalGamesPlayed: number;
  avgGamesPerPlayer: number;
}

// ─── Broadcast / Messages ────────────────────────────────────────────────────

export type BroadcastMode = "global" | "targeted";

export interface BroadcastPayload {
  subject: string;
  message: string;
  imageDataUrl: string | null;  // base64 or null — replace with upload URL when backend ready
  mode: BroadcastMode;
  targetUserIds: string[];       // empty for global
}

export interface BroadcastResponse {
  success: boolean;
  queued: number;   // mock: number of recipients the message was queued for
  error?: string;
}

// ─── Theme ───────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";

// ─── Nav ────────────────────────────────────────────────────────────────────

export type NavItemId =
  | "games"
  | "revenue"
  | "messages"
  | "players"
  | "agents"
  | "pending-request"
  | "transactions"
  | "devices"
  | "admin-users"
  | "game-settings";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  username: string;
  phone: string;
  name: string;
  rate: number;          // decimal percentage, e.g. 0.03
  active: boolean;
  live: boolean;
  balance: number;
  reserved: number;
  cbeAccount?: string | null;
  cbeHolder?: string | null;
  telebirrPhone?: string | null;
  telebirrHolder?: string | null;
  registeredBy: string;  // e.g. "System - Loading"
  createdAt: string;     // ISO string
  role?: string;
}

export interface AgentStats {
  totalAgents: number;
  liveAgents: number;
  totalWalletBalance: number;
  totalReservedBalance: number;
}

export interface AgentFormPayload {
  name: string;
  phone: string;
  username: string;
  password?: string;
  rate: number;
  active?: boolean;
  cbeAccount?: string;
  cbeHolder?: string;
  telebirrPhone?: string;
  telebirrHolder?: string;
  role?: string;
}

export type AgentStatusFilter = "all" | "active" | "inactive";
export type AgentLiveFilter = "all" | "live" | "offline";

export interface AgentsQueryParams {
  fullName?: string;
  phone?: string;
  statusFilter?: AgentStatusFilter;
  liveFilter?: AgentLiveFilter;
  page?: number;
  limit?: number;
}

export interface AgentsPageResponse {
  agents: Agent[];
  totalPages: number;
}

export interface AgentTransactionSummary {
  confirmedDepositsSum: number;
  confirmedDepositsCount: number;
  confirmedWithdrawalsSum: number;
  confirmedWithdrawalsCount: number;
  net: number;
}

export interface AgentTransactionItem {
  id: number | string;
  originalId?: number | string;
  source?: 'tx' | 'pr';
  type: string;
  amount: number;
  status: string;
  date: string;
  userName?: string;
  username?: string;
  userPhone?: string;
  playerId?: string;
  method?: string;
  accountNumber?: string;
  accountHolder?: string;
  transactionId?: string;
  verification?: any;
  trxnReference?: string;
  user?: string;
  bank?: string;
  proofUrl?: string | null;
  requestedAt?: string;
  completedAt?: string;
}

export interface AgentTransactionsQueryParams {
  type?: "deposit" | "withdrawal";
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  method?: string;
  minAmount?: string;
  maxAmount?: string;
  page?: number;
  limit?: number;
}

export interface AgentTransactionsResponse {
  summary: AgentTransactionSummary;
  data: AgentTransactionItem[];
  total: number;
  totalPages: number;
}

export interface AgentBankAccount {
  id: number;
  agentId: number;
  method: string;
  accountName: string;
  accountNumber: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Pending Requests ─────────────────────────────────────────────────────────

export type RequestType = "deposit" | "withdrawal";
export type RequestStatus = "Pending" | "Approved" | "Rejected";

export interface PendingRequest {
  id: string;
  type: RequestType;
  playerId: string;
  userName: string;       // player full name from profile
  username: string;       // player telegram username
  userPhone: string;
  amount: number;
  method: string | null;
  accountNumber: string | null;   // CBE account or Telebirr phone
  accountHolder: string | null;
  transactionId: string | null;
  agentUsername: string | null;   // null → show "-"
  date: string;           // ISO string
  status: RequestStatus;
  verification?: {
    status: string; // 'VERIFIED' | 'MISMATCH' | 'FAILED' | 'DUPLICATE'
    mismatchFields: string[] | null;
    receiptUrl: string | null;
    smsAmount: number | null;
    receiptAmount: number | null;
  } | null;
}

export interface PendingRequestStats {
  pendingDeposits: number;      // count
  pendingWithdrawals: number;   // count
  totalDepositAmount: number;   // sum of ALL deposit amounts (any status)
  totalWithdrawalAmount: number;// sum of ALL withdrawal amounts (any status)
}

export type RequestStatusFilter = "all" | "Pending" | "Approved" | "Rejected";

export interface PendingRequestsQueryParams {
  type: RequestType;
  search?: string;
  statusFilter?: RequestStatusFilter;
  dateFrom?: string;   // "YYYY-MM-DD"
  dateTo?: string;   // "YYYY-MM-DD"
  page?: number;
  limit?: number;
}

export interface PendingRequestsPageResponse {
  requests: PendingRequest[];
  totalPages: number;
}

// ─── Game Settings ────────────────────────────────────────────────────────────

export type GameStatusSetting = "Open" | "Closed" | "Maintenance";
export type BotDifficulty = "Easy" | "Medium" | "Hard";
export type SettingsTab = "betting" | "agent" | "timing" | "bots" | "general";

export interface BettingSettings {
  minimumBet: number;
  maximumBet: number;
  maximumPlayers: number;
  maximumCardsPerPlayer: number;
  totalCards: number;
  initialJoiningBonus: number;
  winningLineCount: number;
  allowJoinCancel: boolean;
  allowAutomaticBets: boolean;
  allowManualBets: boolean;
  gameStatus: GameStatusSetting;
}

export interface AgentSettings {
  defaultCommissionRate: number;   // %
  minimumAgentPayout: number;
  maximumAgentPayout: number;
  agentWithdrawalCooldown: number;   // hours
  allowAgentRegistration: boolean;
  requireAgentApproval: boolean;
}

export interface TimingSettings {
  gameStartDelay: number;   // seconds
  numberDrawInterval: number;   // seconds
  joinWindowDuration: number;   // seconds
  idleTimeoutMinutes: number;
  autoRestartNextGame: boolean;
  announceBetweenGames: boolean;
}

export interface BotsSettings {
  numberOfBots: number;
  botDifficulty: BotDifficulty;
  botJoinDelay: number;   // seconds
  botMaxCards: number;
  enableBots: boolean;
  botsVisibleToPlayers: boolean;
}

export interface GeneralSettings {
  platformName: string;
  supportContact: string;
  maxConcurrentGames: number;
  sessionTimeoutMins: number;
  maintenanceMode: boolean;
  debugLogging: boolean;
}

export interface GameSettings {
  betting: BettingSettings;
  agent: AgentSettings;
  timing: TimingSettings;
  bots: BotsSettings;
  general: GeneralSettings;
}

export interface SaveSettingsPayload<T> {
  tab: SettingsTab;
  data: T;
}

export interface SaveSettingsResponse {
  success: boolean;
  message: string;
}
