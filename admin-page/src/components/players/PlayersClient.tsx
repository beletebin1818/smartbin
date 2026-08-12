"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Users,
  Wallet,
  Gamepad2,
  Banknote,
  BarChart2,
  Search,
  ChevronDown,
  X,
  Loader2,
  SortAsc,
  SortDesc,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { socket, connectAsAdmin } from "@/lib/socket";
import type {
  Player,
  PlayerStats,
  PlayersQueryParams,
  PlayerSortField,
  SortDirection,
} from "@/types";
import SimplePagination from "@/components/ui/SimplePagination";

// ─── Summary card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  loading: boolean;
}

function StatCard({ title, value, icon, iconBg, loading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6C7285] mb-1">
          {title}
        </p>
        {loading ? (
          <div className="h-7 w-28 rounded-md bg-[#0B0F26] border border-[#29345E] animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-white leading-none">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────

const SORT_FIELDS: { value: PlayerSortField; label: string }[] = [
  { value: "joinedAt",    label: "Joined At" },
  { value: "fullName",    label: "Full Name" },
  { value: "balance",     label: "Balance" },
  { value: "gamesPlayed", label: "Games Played" },
  { value: "points",      label: "Points" },
];

interface SortDropdownProps {
  field: PlayerSortField;
  direction: SortDirection;
  onFieldChange: (f: PlayerSortField) => void;
  onDirectionToggle: () => void;
}

function SortDropdown({ field, direction, onFieldChange, onDirectionToggle }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentLabel = SORT_FIELDS.find((f) => f.value === field)?.label ?? "Sort";

  return (
    <div className="flex items-center gap-1" ref={ref}>
      {/* Direction toggle */}
      <button
        onClick={onDirectionToggle}
        title={direction === "asc" ? "Ascending" : "Descending"}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors"
      >
        {direction === "asc" ? <SortAsc size={15} /> : <SortDesc size={15} />}
      </button>

      {/* Field picker */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors"
        >
          {currentLabel}
          <ChevronDown size={13} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {SORT_FIELDS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { onFieldChange(value); setOpen(false); }}
                className={`flex w-full items-center px-4 py-2 text-sm transition-colors ${
                  value === field
                    ? "font-semibold text-[#2F7EFF] bg-[#2F7EFF/15]/60 dark:bg-[#2F7EFF]/10"
                    : "text-[#B9C0D3] hover:hover:bg-[#29345E]/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return isToday
    ? `Today, ${timeStr}`
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatBalance(n: number): string {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLargeNumber(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// ─── Player Detail Modal ───────────────────────────────────────────────────────

interface TransactionItem {
  id: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: string;
  createdAt: string;
  note?: string | null;
}

interface PlayerDetailData {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  balance: number;
  gamesPlayed: number;
  gamesWon: number;
  language: string;
  status: boolean;
  registeredAt: string;
  agent?: { id: number; firstName: string; lastName: string } | null;
  transactions?: TransactionItem[];
}

function PlayerDetailModal({
  playerId,
  onClose,
  onUpdated,
}: {
  playerId: number;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [data, setData] = useState<PlayerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editBalance, setEditBalance] = useState("");
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPlayer(playerId);
      if (res.success && res.data) {
        setData(res.data);
        setEditBalance(String(res.data.balance));
      }
    } catch (err: any) {
      setMsg({ text: err.message || "Failed to load player details", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function handleStatusToggle() {
    if (!data) return;
    setStatusSaving(true);
    setMsg(null);
    try {
      const nextStatus = !data.status;
      await api.updatePlayerStatus(data.id, { status: nextStatus });
      setData((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setMsg({ text: `Player status updated to ${nextStatus ? "Active" : "Suspended"}`, type: "success" });
      onUpdated();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.message || "Failed to update status", type: "error" });
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleBalanceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const val = parseFloat(editBalance);
    if (isNaN(val) || val < 0) {
      setMsg({ text: "Please enter a valid non-negative balance", type: "error" });
      return;
    }
    setBalanceSaving(true);
    setMsg(null);
    try {
      await api.updatePlayerBalance(data.id, { balance: val });
      setData((prev) => (prev ? { ...prev, balance: val } : prev));
      setMsg({ text: `Player balance updated to ${val.toFixed(2)} ETB`, type: "success" });
      onUpdated();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.message || "Failed to update balance", type: "error" });
    } finally {
      setBalanceSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#29345E] bg-[#171D3D] shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#29345E]/50 px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/20 text-[#2F7EFF] font-bold text-lg">
              {data?.firstName ? data.firstName.charAt(0) : "P"}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                {data ? `${data.firstName} ${data.lastName || ''}`.trim() : "Player Profile"}
              </h2>
              <p className="text-xs text-[#6C7285]">
                {data?.username ? `@${data.username}` : `TG ID: ${data?.telegramId || '—'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {msg && (
            <div
              className={`p-3.5 rounded-xl text-sm font-medium ${
                msg.type === "success"
                  ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
              }`}
            >
              {msg.text}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-[#2F7EFF]" size={32} />
            </div>
          ) : data ? (
            <>
              {/* Top Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#171D3D] border border-[#29345E]/50">
                  <span className="text-[11px] font-semibold text-[#6C7285] uppercase">Balance</span>
                  <p className="text-lg font-bold text-white mt-1">{formatBalance(data.balance)} ETB</p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#171D3D] border border-[#29345E]/50">
                  <span className="text-[11px] font-semibold text-[#6C7285] uppercase">Games Played</span>
                  <p className="text-lg font-bold text-white mt-1">{data.gamesPlayed}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#171D3D] border border-[#29345E]/50">
                  <span className="text-[11px] font-semibold text-[#6C7285] uppercase">Games Won</span>
                  <p className="text-lg font-bold text-white mt-1">{data.gamesWon}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#171D3D] border border-[#29345E]/50">
                  <span className="text-[11px] font-semibold text-[#6C7285] uppercase">Status</span>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        data.status
                          ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                      }`}
                    >
                      {data.status ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {data.status ? "Active" : "Suspended"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Player Details Grid */}
              <div className="rounded-xl border border-[#29345E] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C7285]">Player Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 text-sm">
                  <div>
                    <span className="text-[#6C7285] text-xs">Telegram ID:</span>
                    <p className="font-mono text-gray-900 dark:text-gray-200">{data.telegramId}</p>
                  </div>
                  <div>
                    <span className="text-[#6C7285] text-xs">Phone Number:</span>
                    <p className="font-medium text-gray-900 dark:text-gray-200">{data.phoneNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-[#6C7285] text-xs">Language:</span>
                    <p className="font-medium text-gray-900 dark:text-gray-200">{data.language === 'am' ? 'Amharic (አማርኛ)' : 'English'}</p>
                  </div>
                  <div>
                    <span className="text-[#6C7285] text-xs">Registered Agent:</span>
                    <p className="font-medium text-gray-900 dark:text-gray-200">{data.agent ? `${data.agent.firstName} ${data.agent.lastName || ''}`.trim() : 'Direct (Bot)'}</p>
                  </div>
                  <div>
                    <span className="text-[#6C7285] text-xs">Registered At:</span>
                    <p className="text-gray-900 dark:text-gray-200 text-xs">{formatDate(data.registeredAt)}</p>
                  </div>
                </div>
              </div>

              {/* Admin Actions */}
              <div className="rounded-xl border border-[#29345E] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C7285]">Admin Controls</h3>
                
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  {/* Balance Edit Form */}
                  <form onSubmit={handleBalanceSubmit} className="flex-1 space-y-1.5 w-full">
                    <label className="text-xs font-medium text-[#B9C0D3]">Set Wallet Balance (ETB)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editBalance}
                        onChange={(e) => setEditBalance(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] px-3.5 py-2 text-sm text-white outline-none focus:border-[#2F7EFF]"
                      />
                      <button
                        type="submit"
                        disabled={balanceSaving}
                        className="px-4 py-2 rounded-xl bg-[#2F7EFF] text-white text-xs font-semibold hover:bg-[#d81b60] disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1.5"
                      >
                        {balanceSaving && <Loader2 size={13} className="animate-spin" />}
                        Update Balance
                      </button>
                    </div>
                  </form>

                  {/* Status Toggle Button */}
                  <div className="shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleStatusToggle}
                      disabled={statusSaving}
                      className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                        data.status
                          ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60"
                          : "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60"
                      }`}
                    >
                      {statusSaving ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : data.status ? (
                        <ShieldAlert size={13} />
                      ) : (
                        <ShieldCheck size={13} />
                      )}
                      {data.status ? "Suspend Player Account" : "Activate Player Account"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Transactions Ledger */}
              {data.transactions && data.transactions.length > 0 && (
                <div className="rounded-xl border border-[#29345E] p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#6C7285]">Recent Ledger Transactions</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#29345E]/50 text-[#6C7285] font-semibold">
                          <th className="py-2 px-2">Type</th>
                          <th className="py-2 px-2">Amount</th>
                          <th className="py-2 px-2">Balance After</th>
                          <th className="py-2 px-2">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.transactions.map((tx) => (
                          <tr key={tx.id} className="text-[#B9C0D3]">
                            <td className="py-2 px-2 font-medium capitalize">{tx.type}</td>
                            <td className={`py-2 px-2 font-semibold ${['deposit', 'win', 'bonus'].includes(tx.type) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {['deposit', 'win', 'bonus'].includes(tx.type) ? '+' : '-'}{formatBalance(tx.amount)} ETB
                            </td>
                            <td className="py-2 px-2">{formatBalance(tx.balanceAfter)} ETB</td>
                            <td className="py-2 px-2 text-[#6C7285]">{formatDate(tx.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-gray-400 py-8">Player not found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayersClient() {
  // ── Stats ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Selected player for detail modal
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [fullName,   setFullName]   = useState("");
  const [username,   setUsername]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [minPoints,  setMinPoints]  = useState("");
  const [sortField,  setSortField]  = useState<PlayerSortField>("joinedAt");
  const [sortDir,    setSortDir]    = useState<SortDirection>("desc");

  // ── Table state ────────────────────────────────────────────────────────────
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounce guards
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const response = await api.getPlayerStats();
      setStats(response);
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to load player stats:', error);
      setErrorMessage('Unable to load player statistics. Please try again.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPlayers = useCallback(async (params: PlayersQueryParams) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.getPlayers({
        ...params,
        telegramId: params.fullName || undefined,
        limit: 20,
      });
      setPlayers(response.players);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Failed to load players:', error);
      setErrorMessage('Unable to load players. Please check your connection.');
      setPlayers([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshData = useCallback(() => {
    fetchPlayers({
      fullName,
      username,
      phone,
      minPoints: minPoints ? parseInt(minPoints, 10) : undefined,
      sortField,
      sortDirection: sortDir,
      page,
    });
    loadStats();
  }, [fullName, username, phone, minPoints, sortField, sortDir, page, fetchPlayers, loadStats]);

  // Fetch once on mount
  useEffect(() => {
    refreshData();
  }, []);

  // Reset to page 1 whenever filter/sort changes, debounced
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPlayers({
        fullName,
        username,
        phone,
        minPoints: minPoints ? parseInt(minPoints, 10) : undefined,
        sortField,
        sortDirection: sortDir,
        page: 1,
      });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, username, phone, minPoints, sortField, sortDir, fetchPlayers]);

  // Re-fetch when page changes (no debounce needed)
  useEffect(() => {
    fetchPlayers({
      fullName,
      username,
      phone,
      minPoints: minPoints ? parseInt(minPoints, 10) : undefined,
      sortField,
      sortDirection: sortDir,
      page,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fetchPlayers]);

  // ── Manual real-time sync (socket.io) ───────────────────────────────────────
  useEffect(() => {
    const s = connectAsAdmin();

    const onPlayersUpdated = (payload: { playerId: number; action: string; balance?: number; status?: boolean }) => {
      setPlayers((prev) =>
        prev.map((p) => {
          if (Number(p.id) !== payload.playerId) return p;
          
          const updated = { ...p };
          if (payload.action === 'balance_updated' && payload.balance !== undefined) {
            updated.balance = payload.balance;
          } else if (payload.action === 'status_changed' && payload.status !== undefined) {
            updated.status = payload.status;
          }
          return updated;
        })
      );
    };

    s.on('players:updated', onPlayersUpdated);

    return () => {
      s.off('players:updated', onPlayersUpdated);
    };
  }, []);

  function clearFilters() {
    setFullName("");
    setUsername("");
    setPhone("");
    setMinPoints("");
  }

  const hasActiveFilters = fullName || username || phone || minPoints;

  const inputCls =
    "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-[#0B0F26] " +
    "px-4 py-2 text-sm text-white placeholder-gray-400 dark:placeholder-gray-600 " +
    "outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20";

  const columns = [
    "Full Name",
    "Phone Number",
    "Username",
    "Balance",
    "Games Played",
    "Joined At",
    "Action",
  ] as const;

  return (
    <div className="space-y-6">

      {/* ── Page heading ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Players</h1>
          <p className="text-sm text-[#6C7285] mt-0.5">
            View and manage all registered players.
          </p>
        </div>
        <button
          onClick={refreshData}
          disabled={loading || statsLoading}
          className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading || statsLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Players"
          value={stats ? formatLargeNumber(stats.totalPlayers) : "—"}
          icon={<Users size={18} className="text-[#2F7EFF]" />}
          iconBg="bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15"
          loading={statsLoading}
        />
        <StatCard
          title="Total Wallet Balance"
          value={stats ? `ETB ${formatLargeNumber(stats.totalWalletBalance)}` : "—"}
          icon={<Wallet size={18} className="text-indigo-500 dark:text-indigo-400" />}
          iconBg="bg-indigo-50 dark:bg-indigo-900/30"
          loading={statsLoading}
        />
        <StatCard
          title="Total Games Played"
          value={stats ? formatLargeNumber(stats.totalGamesPlayed) : "—"}
          icon={<Gamepad2 size={18} className="text-amber-500 dark:text-amber-400" />}
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          loading={statsLoading}
        />
        <StatCard
          title="Avg Games / Player"
          value={stats ? stats.avgGamesPerPlayer.toLocaleString() : "—"}
          icon={<BarChart2 size={18} className="text-green-600 dark:text-green-400" />}
          iconBg="bg-green-50 dark:bg-green-900/30"
          loading={statsLoading}
        />
      </div>

      {/* ── Players card ── */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#2F7EFF] to-[#FF9800]" />

        <div className="p-5 sm:p-6">

          {/* ── Card header ── */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-bold text-white">Player List</h2>
              <p className="text-sm text-[#6C7285] mt-0.5">
                Search, filter, and sort registered players.
              </p>
            </div>
            <SortDropdown
              field={sortField}
              direction={sortDir}
              onFieldChange={(f) => setSortField(f)}
              onDirectionToggle={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            />
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 p-4 mb-4 text-sm text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          {/* ── Filter bar ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {/* Full Name */}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
              <input
                type="text"
                placeholder="Full name or Telegram ID…"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>

            {/* Username */}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
              <input
                type="text"
                placeholder="Username…"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>

            {/* Phone */}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
              <input
                type="text"
                placeholder="Phone number…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>

            {/* Min Points + clear */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min points…"
                min="0"
                value={minPoints}
                onChange={(e) => setMinPoints(e.target.value)}
                className={inputCls}
              />
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  title="Clear filters"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="relative overflow-x-auto rounded-xl border border-[#29345E]">
            {/* Right-edge scroll fade */}
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#171D3D] to-transparent z-10 rounded-r-xl"
              aria-hidden="true"
            />

            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#29345E] bg-[#171D3D]">
                  {columns.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6C7285]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-[#0B0F26] divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  // Skeleton rows
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td key={col} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-[#0B0F26] border border-[#29345E] animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : players.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-5 py-14 text-center text-sm text-[#6C7285]">
                      No players match your filters.
                    </td>
                  </tr>
                ) : (
                  players.map((player) => (
                    <tr
                      key={player.id}
                      className="hover:bg-[#29345E]/30 transition-colors"
                    >
                      {/* Full Name */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15 text-[#2F7EFF] text-xs font-bold">
                            {player.fullName ? player.fullName.charAt(0) : "P"}
                          </div>
                          <span className="font-medium text-white">
                            {player.fullName}
                          </span>
                        </div>
                      </td>

                      {/* Phone Number */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#B9C0D3] tabular-nums text-sm">
                        {player.phone || '—'}
                      </td>

                      {/* Username */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {player.username ? (
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            @{player.username}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="whitespace-nowrap px-5 py-3.5 tabular-nums">
                        <span className="font-semibold text-white">
                          {formatBalance(player.balance)}
                        </span>
                        <span className="ml-1 text-xs text-[#6C7285]">ETB</span>
                      </td>

                      {/* Games Played */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#B9C0D3] tabular-nums font-medium">
                        {(player.gamesPlayed || 0).toLocaleString()}
                      </td>

                      {/* Joined At */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#6C7285] text-xs">
                        {formatDate(player.joinedAt)}
                      </td>

                      {/* Action */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedPlayerId(Number(player.id))}
                            title="Deposit / Edit Balance"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:hover:bg-[#29345E]/60 hover:text-gray-900 dark:hover:text-gray-100 transition-colors shadow-sm"
                          >
                            <Banknote size={15} />
                          </button>
                          <Link
                            href={`/players/${player.id}`}
                            title="Player Detail & Games"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:hover:bg-[#29345E]/60 hover:text-[#2F7EFF] dark:hover:text-[#2F7EFF] transition-colors shadow-sm"
                          >
                            <Gamepad2 size={15} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* ── Player Detail Modal ── */}
      {selectedPlayerId !== null && (
        <PlayerDetailModal
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onUpdated={refreshData}
        />
      )}
    </div>
  );
}

