"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wallet,
  Gamepad2,
  UserPlus,
  User,
  Gift,
  ArrowRightLeft,
  PlusCircle,
  MinusCircle,
  X,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { getWalletLedger, updateWallet } from "@/lib/api/revenueClient";
import { getSocket } from "@/lib/socket";
import type {
  WalletTab,
  WalletTransaction,
  WalletTransactionType,
} from "@/types";
import SimplePagination from "@/components/ui/SimplePagination";

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: WalletTab; label: string; icon: React.ReactNode }[] = [
  { id: "game", label: "Game", icon: <Gamepad2 size={13} /> },
  { id: "agent", label: "Agent", icon: <UserPlus size={13} /> },
  { id: "player", label: "Player", icon: <User size={13} /> },
  { id: "bonus", label: "Bonus", icon: <Gift size={13} /> },
  { id: "direct", label: "Direct", icon: <ArrowRightLeft size={13} /> },
];

const TAB_LABELS: Record<WalletTab, string> = {
  game: "Game",
  agent: "Agent",
  player: "Player",
  bonus: "Bonus",
  direct: "Direct",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  return isToday
    ? `Today, ${timeStr}`
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${timeStr}`;
}

// ─── Update Wallet Modal ──────────────────────────────────────────────────────

interface UpdateWalletModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function UpdateWalletModal({ onClose, onSuccess }: UpdateWalletModalProps) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<WalletTransactionType>("credited");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await updateWallet({
        amount: parsedAmount,
        type,
        description: description.trim(),
      });

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.message || "Failed to update wallet.");
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to update wallet. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-xl border border-[#29345E] " +
    "bg-[#0B0F26] px-4 py-2.5 text-sm " +
    "text-white placeholder-[#6C7285] " +
    "outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] shadow-2xl shadow-black/40">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#29345E] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2F7EFF]/15">
              <Wallet size={15} className="text-[#4DA3FF]" />
            </div>
            <h2 className="text-base font-bold text-white">
              Update Wallet
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#6C7285] hover:text-[#B9C0D3] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleConfirm} noValidate className="px-6 py-5 space-y-4">

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6C7285]">
              Amount (ETB)
            </label>
            <input
              ref={firstRef}
              type="number"
              min="1"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputBase}
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6C7285]">
              Type
            </label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WalletTransactionType)}
                className={`${inputBase} appearance-none pr-10`}
              >
                <option value="credited">Credit</option>
                <option value="debited">Debit</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6C7285]">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Reason for this wallet update…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputBase} resize-none`}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800/40 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#29345E] bg-[#0B0F26] px-4 py-2 text-sm font-medium text-[#B9C0D3] hover:bg-[#29345E]/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-[#2F7EFF]/25 transition hover:opacity-90 disabled:opacity-60 disabled:pointer-events-none"
              style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Confirming…" : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WalletLedger() {
  const [activeTab, setActiveTab] = useState<WalletTab>("game");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WalletTransaction[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getWalletLedger({ tab: activeTab, page });
      setRows(res.rows);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error("Failed to fetch wallet ledger:", err);
      setRows([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // ── Real-time: listen for revenue:updated events ──
  // When the backend emits revenue:updated (from transactions, game
  // completions, card claims, or wallet updates), refresh the current
  // tab's ledger so the Admin Dashboard stays in sync.
  useEffect(() => {
    const socket = getSocket();
    const handleRevenueUpdate = () => {
      fetchLedger();
    };
    socket.on("revenue:updated", handleRevenueUpdate);

    return () => {
      socket.off("revenue:updated", handleRevenueUpdate);
    };
  }, [fetchLedger]);

  function handleTabChange(tab: WalletTab) {
    setActiveTab(tab);
    setPage(1);
  }

  const tableHeading = `${TAB_LABELS[activeTab]} Table`;
  const columns = ["Date", "Amount", "Type", "Source", "Description"] as const;

  return (
    <>
      <div className="rounded-xl border border-[#29345E] bg-[#171D3D] overflow-hidden shadow-lg shadow-black/20">
        {/* Gradient top border */}
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2F7EFF 0%, #4DA3FF 100%)' }} />

        <div className="p-5 sm:p-6">

          {/* ── Section header ── */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-bold text-white leading-tight">
                Platform Wallet Ledger
              </h2>
              <p className="text-sm text-[#6C7285] mt-0.5">
                All transactions of platform wallet changes.
              </p>
            </div>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2F7EFF]/25 transition hover:opacity-90 shrink-0"
              style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
            >
              <Wallet size={15} />
              Update Wallet
            </button>
          </div>

          {/* ── Tab bar ── */}
          <div className="mb-4 inline-flex items-center gap-0.5 rounded-xl bg-[#0B0F26] p-1 flex-wrap border border-[#29345E]/50">
            {TABS.map(({ id, label, icon }) => {
              const isActive = id === activeTab;
              return (
                <button
                  key={id}
                  onClick={() => handleTabChange(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${isActive
                      ? "bg-[#2F7EFF]/15 text-[#4DA3FF] shadow-sm border border-[#2F7EFF]/30"
                      : "text-[#B9C0D3] hover:text-white"
                    }`}
                >
                  <span className={isActive ? "text-[#4DA3FF]" : "text-[#6C7285]"}>
                    {icon}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Table heading ── */}
          <h3 className="text-sm font-bold text-[#B9C0D3] mb-3">
            {tableHeading}
          </h3>

          {/* ── Table ── */}
          <div className="relative overflow-x-auto rounded-xl border border-[#29345E]">
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#171D3D] to-transparent z-10 rounded-r-xl"
              aria-hidden="true"
            />

            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#29345E] bg-[#0B0F26]">
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

              <tbody className="bg-[#171D3D] divide-y divide-[#29345E]/50">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td key={col} className="px-5 py-3.5">
                          <div className="h-4 rounded bg-[#29345E]/50 animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[#29345E]/30 transition-colors"
                    >
                      {/* Date */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#B9C0D3] text-sm">
                        {formatDate(row.date)}
                      </td>

                      {/* Amount */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#FFC83D] font-semibold tabular-nums">
                        {row.currency} {row.amount}
                      </td>

                      {/* Type badge */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {row.type === "credited" ? (
                          <span className="inline-flex items-center gap-1 text-green-400 text-xs font-semibold">
                            <PlusCircle size={13} />
                            Credited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
                            <MinusCircle size={13} />
                            Debited
                          </span>
                        )}
                      </td>

                      {/* Source pill */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className="inline-flex items-center rounded-full bg-[#0B0F26] border border-[#29345E] px-2.5 py-0.5 text-xs font-medium text-[#B9C0D3]">
                          {row.source}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-5 py-3.5 text-[#6C7285] text-xs max-w-xs truncate">
                        {row.description}
                      </td>
                    </tr>
                  ))
                )}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-[#6C7285]">
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Simple pagination ── */}
          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {showModal && (
        <UpdateWalletModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            // Refresh the current tab's ledger after a successful wallet update
            fetchLedger();
          }}
        />
      )}
    </>
  );
}
