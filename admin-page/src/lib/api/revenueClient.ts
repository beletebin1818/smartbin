import { apiClient } from './client';
import type {
  RevenueSummaryCard,
  WalletTab,
  WalletLedgerResponse,
  WalletTransaction,
  UpdateWalletPayload,
} from '@/types';

const TAB_TYPE_MAP: Record<WalletTab, string[]> = {
  game: ['bet', 'win'],
  agent: ['agent_credit', 'agent_debit'],
  player: ['deposit', 'withdrawal'],
  bonus: ['bonus'],
  direct: ['refund'],
};

const TAB_SOURCE_LABELS: Record<WalletTab, string> = {
  game: 'Game Share',
  agent: 'Agent Commission',
  player: 'Player Deposit',
  bonus: 'Bonus Grant',
  direct: 'Direct Transfer',
};

const CREDITED_TYPES = new Set(['deposit', 'win', 'bonus', 'agent_credit']);

export async function getRevenueSummary(): Promise<RevenueSummaryCard[]> {
  const res = await apiClient.get('/revenue');
  return (res.data?.data || []) as RevenueSummaryCard[];
}

export async function getWalletLedger(params: {
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

  const transactions: any[] = response.data?.data || [];
  const total = response.data?.total || 0;
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
  } as WalletLedgerResponse;
}

export async function updateWallet(data: UpdateWalletPayload): Promise<{ success: boolean; message?: string }> {
  const res = await apiClient.post('/revenue/wallet', data);
  return res.data;
}

const revenueClient = {
  getRevenueSummary,
  getWalletLedger,
  updateWallet,
};

export default revenueClient;
