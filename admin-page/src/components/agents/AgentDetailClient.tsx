"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Phone, Percent, Wallet, Hourglass, Calendar, Check, X,
  Landmark, CreditCard, Pencil, Search, RotateCcw,
  ExternalLink, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Plus, Trash2, RefreshCw,
  User, Link2, Filter, Settings, Activity, ArrowUpCircle, PlusCircle, Hash
} from "lucide-react";
import { api } from "@/lib/api/client";
import { socket, connectAsAdmin } from "@/lib/socket";
import type {
  Agent, AgentFormPayload, AgentTransactionSummary,
  AgentTransactionItem, AgentTransactionsQueryParams, AgentBankAccount
} from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatETB(n: number | string | undefined | null): string {
  const num = typeof n === "number" ? n : (parseFloat(String(n).replace(/[^0-9.-]+/g, "")) || 0);
  if (isNaN(num)) return "ETB 0.00";
  return `ETB ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatETBPlain(n: number | string | undefined | null): string {
  const num = typeof n === "number" ? n : (parseFloat(String(n).replace(/[^0-9.-]+/g, "")) || 0);
  if (isNaN(num)) return "0.00 ETB";
  return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return isToday
      ? `Today, ${time}`
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${time}`;
  } catch {
    return "—";
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "—";
  }
}

function DetailRow({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#B9C0D3] shrink-0">{label}</span>
      <span className={`text-right ${highlight ? "font-bold text-[#2F7EFF]" : "font-medium text-white"} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function ApproveModal({ row, onConfirm, onCancel, isLoading }: {
  row: any; onConfirm: (txId: string) => void; onCancel: () => void; isLoading: boolean;
}) {
  const [txId, setTxId] = useState(row.transactionId || "");
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] shadow-2xl p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-white">Approve Request</h2>
          <p className="text-sm text-[#B9C0D3] mt-1">
            Confirm you have processed <span className="font-semibold text-green-600 dark:text-green-400">{formatETB(row.amount)}</span>.
          </p>
        </div>
        
        {row.type === 'deposit' && row.verification && row.verification.status !== 'VERIFIED' && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-900/20 p-4 text-sm text-orange-800 dark:text-orange-400">
            <strong>Warning:</strong> The receipt verification status is {row.verification.status}.
            {row.verification.mismatchFields && row.verification.mismatchFields.length > 0 && (
              <ul className="list-disc pl-4 mt-1 text-xs">
                {row.verification.mismatchFields.map((msg: string, i: number) => <li key={i}>{msg}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-4 space-y-2.5 text-sm">
          <DetailRow label="Player" value={row.userName} />
          <DetailRow label="Method" value={row.method || "—"} />
          {row.accountNumber && <DetailRow label={row.method?.toLowerCase().includes("tele") ? "Phone Number" : "Account Number"} value={row.accountNumber} mono />}
          {row.accountHolder && <DetailRow label="Account Holder" value={row.accountHolder} />}
          <DetailRow label="Amount" value={formatETB(row.amount)} highlight />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#B9C0D3] uppercase tracking-wider">
            Transaction / Reference ID <span className="text-gray-400 font-normal normal-case">(optional)</span>
          </label>
          <div className="relative">
            <Hash size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
            <input type="text" value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="Enter bank transaction ID..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2.5 text-sm text-[#B9C0D3] placeholder-gray-400 dark:placeholder-gray-600 outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20" />
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onCancel} disabled={isLoading}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:hover:bg-[#29345E]/60 transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onConfirm(txId)} disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50 disabled:pointer-events-none">
            <Check size={14} />{isLoading ? "Approving…" : "Confirm Approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ row, onConfirm, onCancel, isLoading }: {
  row: any; onConfirm: (note: string) => void; onCancel: () => void; isLoading: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] shadow-2xl p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-white">Reject Request</h2>
          <p className="text-sm text-[#B9C0D3] mt-1">
            Reject the <span className="font-semibold text-red-500">{formatETB(row.amount)}</span> {row.type} request from <span className="font-semibold">{row.userName}</span>.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#B9C0D3] uppercase tracking-wider">
            Internal Note <span className="text-gray-400 font-normal normal-case">(optional)</span>
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for rejection..." rows={3}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-[#B9C0D3] placeholder-gray-400 dark:placeholder-gray-600 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/20 resize-none" />
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onCancel} disabled={isLoading}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:hover:bg-[#29345E]/60 transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onConfirm(note)} disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50 disabled:pointer-events-none">
            <X size={14} />{isLoading ? "Rejecting…" : "Confirm Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewDetailsModal({ row, onClose }: { row: any; onClose: () => void }) {
  const isWithdrawal = row.type === "withdrawal";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Request Details</h2>
            <p className="text-xs text-gray-400 mt-0.5">ID #{row.id}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <X size={16} className="text-[#B9C0D3]" />
          </button>
        </div>
        <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-4 space-y-3 text-sm">
          <DetailRow label="Player ID" value={row.playerId || "—"} />
          <DetailRow label="Player Name" value={row.userName} />
          <DetailRow label="Username" value={row.username ? `@${row.username}` : "—"} />
          <DetailRow label="Phone" value={row.userPhone} />
          <hr className="border-gray-200 dark:border-gray-700" />
          <DetailRow label="Type" value={row.type.charAt(0).toUpperCase() + row.type.slice(1)} />
          <DetailRow label="Amount" value={formatETB(row.amount)} highlight />
          {isWithdrawal && (
            <>
              <DetailRow label="Method" value={row.method || "—"} />
              <DetailRow label={row.method === "Telebirr" ? "Telebirr Phone" : "CBE Account No."} value={row.accountNumber || "—"} mono />
              <DetailRow label="Account Holder" value={row.accountHolder || "—"} />
            </>
          )}
          <hr className="border-gray-200 dark:border-gray-700" />
          <DetailRow label="Status" value={row.status} />
          <DetailRow label="Date and Time" value={formatDate(row.date)} />
          {row.transactionId && <DetailRow label="Transaction ID" value={row.transactionId} mono />}
          {row.verification && (
            <>
              <hr className="border-gray-200 dark:border-gray-700" />
              <DetailRow label="Verification Status" value={row.verification.status} highlight={row.verification.status !== 'VERIFIED'} />
              <DetailRow label="SMS Amount" value={row.verification.smsAmount ? formatETB(row.verification.smsAmount) : "—"} />
              <DetailRow label="Receipt Amount" value={row.verification.receiptAmount ? formatETB(row.verification.receiptAmount) : "—"} />
              {row.verification.receiptUrl && (
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-[#B9C0D3]">Receipt URL</span>
                  <a href={row.verification.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline break-all ml-4 text-right">
                    Open Receipt
                  </a>
                </div>
              )}
              {row.verification.mismatchFields && row.verification.mismatchFields.length > 0 && (
                <div className="mt-2 rounded bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-600 dark:text-red-400">
                  <strong>Mismatch Issues:</strong>
                  <ul className="list-disc pl-4 mt-1">
                    {row.verification.mismatchFields.map((msg: string, i: number) => <li key={i}>{msg}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:hover:bg-[#29345E]/60 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function BankDetailsModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#29345E]/50 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <Landmark size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Bank Details</h3>
              <p className="text-xs text-[#B9C0D3]">{agent.name} (@{agent.username})</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#29345E] bg-[#171D3D]/50 p-4">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-2">CBE Account</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400 block">Account:</span> <span className="font-semibold text-white">{agent.cbeAccount || "—"}</span></div>
              <div><span className="text-gray-400 block">Holder:</span> <span className="font-semibold text-white">{agent.cbeHolder || "—"}</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-[#29345E] bg-[#171D3D]/50 p-4">
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider block mb-2">TeleBirr</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400 block">Phone:</span> <span className="font-semibold text-white">{agent.telebirrPhone || "—"}</span></div>
              <div><span className="text-gray-400 block">Holder:</span> <span className="font-semibold text-white">{agent.telebirrHolder || "—"}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletModal({ agent, onClose, onSaved }: { agent: Agent; onClose: () => void; onSaved: (a: Agent) => void }) {
  const [type, setType] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError("Please enter a valid positive amount");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api.agentWalletChange(String(agent.id), {
        type: type === "deposit" ? "deposit" : "withdraw",
        amount: num,
        note: note || `Admin wallet ${type} for agent ${agent.username}`,
      });
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to update wallet");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#29345E]/50 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">
              <CreditCard size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Wallet Adjustment</h3>
              <p className="text-xs text-[#B9C0D3]">{agent.name} (@{agent.username})</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 p-2.5 text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Transaction Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("deposit")}
                className={`py-2 rounded-xl text-xs font-semibold border transition ${type === "deposit" ? "bg-green-500 text-white border-green-500" : "border-[#29345E] text-gray-600 dark:text-gray-400"}`}
              >
                Deposit (Credit)
              </button>
              <button
                type="button"
                onClick={() => setType("withdraw")}
                className={`py-2 rounded-xl text-xs font-semibold border transition ${type === "withdraw" ? "bg-red-500 text-white border-red-500" : "border-[#29345E] text-gray-600 dark:text-gray-400"}`}
              >
                Withdraw (Debit)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Amount (ETB)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[#29345E] bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 focus:border-[#2F7EFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Reason / Note</label>
            <input
              type="text"
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-[#29345E] bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 focus:border-[#2F7EFF]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 border border-[#29345E]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#2F7EFF] hover:bg-[#D81B60] disabled:opacity-50 flex items-center gap-1.5">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAgentModal({ agent, onClose, onSaved }: { agent: Agent; onClose: () => void; onSaved: (a: Agent) => void }) {
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone);
  const [username, setUsername] = useState(agent.username);
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rate, setRate] = useState(String(agent.rate));
  const [active, setActive] = useState(agent.active);

  const [cbeAccount, setCbeAccount] = useState(agent.cbeAccount || "");
  const [cbeHolder, setCbeHolder] = useState(agent.cbeHolder || "");
  const [telebirrPhone, setTelebirrPhone] = useState(agent.telebirrPhone || "");
  const [telebirrHolder, setTelebirrHolder] = useState(agent.telebirrHolder || "");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErrors({ name: "Full name is required" }); return; }
    setSubmitting(true);
    setErrors({});
    try {
      const payload: AgentFormPayload = {
        name, phone, username, rate: parseFloat(rate) || 0, active,
        cbeAccount, cbeHolder, telebirrPhone, telebirrHolder,
        ...(password ? { password } : {}),
      };
      const updated = await api.updateAgent(agent.id, payload);
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setErrors({ form: err?.response?.data?.message || "Failed to update agent" });
    } finally {
      setSubmitting(false);
    }
  }

  const labelCls = "block text-xs font-semibold text-[#B9C0D3] mb-1";
  const inputBase = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 focus:border-[#2F7EFF]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#29345E]/50 pb-4 mb-4">
          <h2 className="text-lg font-bold text-white">Edit Agent</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.form && <p className="text-xs text-red-500 font-medium">{errors.form}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className={labelCls}>Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputBase} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className={labelCls}>New Password (Optional)</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep" className={inputBase} />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center">
            <div>
              <label className={labelCls}>Commission Rate (0-1)</label>
              <input type="number" step="0.01" min="0" max="1" value={rate} onChange={(e) => setRate(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className={labelCls}>Account Status</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="radio" checked={active} onChange={() => setActive(true)} className="accent-[#2F7EFF]" /> Active
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="radio" checked={!active} onChange={() => setActive(false)} className="accent-[#2F7EFF]" /> Inactive
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-[#29345E]/50 pt-3">
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Banking details</span>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>CBE Account</label><input type="text" value={cbeAccount} onChange={(e) => setCbeAccount(e.target.value)} className={inputBase} /></div>
              <div><label className={labelCls}>CBE Holder</label><input type="text" value={cbeHolder} onChange={(e) => setCbeHolder(e.target.value)} className={inputBase} /></div>
              <div><label className={labelCls}>TeleBirr Phone</label><input type="text" value={telebirrPhone} onChange={(e) => setTelebirrPhone(e.target.value)} className={inputBase} /></div>
              <div><label className={labelCls}>TeleBirr Holder</label><input type="text" value={telebirrHolder} onChange={(e) => setTelebirrHolder(e.target.value)} className={inputBase} /></div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 border border-gray-200">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#2F7EFF] hover:bg-[#D81B60] disabled:opacity-50 flex items-center gap-1.5">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Bank Account Modal ──────────────────────────────────────────────────

function AddBankAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: (data: { method: string; accountName: string; accountNumber: string; isActive?: boolean; displayOrder?: number }) => void }) {
  const [method, setMethod] = useState('CBE');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!accountName.trim() || !accountNumber.trim()) {
      setError('Account name and number are required.');
      return;
    }
    setSubmitting(true);
    try {
      onSaved({
        method,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        isActive,
        displayOrder: parseInt(displayOrder) || 0,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add account');
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 focus:border-[#2F7EFF]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#29345E]/50 pb-4 mb-4">
          <h2 className="text-lg font-bold text-white">Add Bank Account</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 p-2.5 text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Provider</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputBase}>
              <option value="CBE">CBE</option>
              <option value="TeleBirr">TeleBirr</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Account Holder Name</label>
            <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Full name" className={inputBase} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Account Number</label>
            <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" className={inputBase} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Display Order</label>
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Status</label>
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={() => setIsActive(!isActive)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isActive ? "bg-[#2F7EFF]" : "bg-gray-200 dark:bg-gray-700"}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isActive ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-xs text-[#B9C0D3]">{isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 border border-[#29345E]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#2F7EFF] hover:bg-[#D81B60] disabled:opacity-50 flex items-center gap-1.5">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Add Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Bank Account Modal ─────────────────────────────────────────────────

function EditBankAccountModal({ account, onClose, onSaved }: { account: AgentBankAccount; onClose: () => void; onSaved: (data: { method?: string; accountName?: string; accountNumber?: string; isActive?: boolean; displayOrder?: number }) => void }) {
  const [method, setMethod] = useState(account.method);
  const [accountName, setAccountName] = useState(account.accountName);
  const [accountNumber, setAccountNumber] = useState(account.accountNumber);
  const [isActive, setIsActive] = useState(account.isActive);
  const [displayOrder, setDisplayOrder] = useState(String(account.displayOrder));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!accountName.trim() || !accountNumber.trim()) {
      setError('Account name and number are required.');
      return;
    }
    setSubmitting(true);
    try {
      onSaved({
        method,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        isActive,
        displayOrder: parseInt(displayOrder) || 0,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update account');
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 focus:border-[#2F7EFF]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#29345E]/50 pb-4 mb-4">
          <h2 className="text-lg font-bold text-white">Edit Bank Account</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 p-2.5 text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Provider</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputBase}>
              <option value="CBE">CBE</option>
              <option value="TeleBirr">TeleBirr</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Account Holder Name</label>
            <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputBase} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Account Number</label>
            <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputBase} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Display Order</label>
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#B9C0D3] mb-1">Status</label>
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={() => setIsActive(!isActive)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isActive ? "bg-[#2F7EFF]" : "bg-gray-200 dark:bg-gray-700"}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isActive ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-xs text-[#B9C0D3]">{isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 border border-[#29345E]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#2F7EFF] hover:bg-[#D81B60] disabled:opacity-50 flex items-center gap-1.5">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main AgentDetailClient Component ─────────────────────────────────────────

export default function AgentDetailClient({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AgentTransactionSummary>({
    confirmedDepositsSum: 0,
    confirmedDepositsCount: 0,
    confirmedWithdrawalsSum: 0,
    confirmedWithdrawalsCount: 0,
    net: 0,
  });
  const [transactions, setTransactions] = useState<AgentTransactionItem[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [activeTab, setActiveTab] = useState<"deposit" | "withdrawal">("deposit");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");

  const [showBankModal, setShowBankModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [bankAccounts, setBankAccounts] = useState<AgentBankAccount[]>([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(true);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AgentBankAccount | null>(null);

  const [approveModal, setApproveModal] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [viewDetailsModal, setViewDetailsModal] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const loadAgent = useCallback(async (isBackground = false) => {
    if (!isBackground) setAgentLoading(true);
    setAgentError(null);
    try {
      const data = await api.getAgent(agentId);
      setAgent(data);
    } catch (err: any) {
      setAgentError(err?.response?.data?.message || "Failed to load agent profile");
    } finally {
      setAgentLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  const loadBankAccounts = useCallback(async (isBackground = false) => {
    if (!isBackground) setBankAccountsLoading(true);
    try {
      const data = await api.getAgentBankAccounts(agentId);
      setBankAccounts(data);
    } catch (err) {
      console.error("Failed to load agent bank accounts:", err);
    } finally {
      setBankAccountsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadBankAccounts();
  }, [loadBankAccounts]);

  const loadTransactions = useCallback(async (isBackground = false) => {
    if (!isBackground) setTxLoading(true);
    try {
      const res = await api.getAgentTransactions(agentId, {
        type: activeTab,
        status: statusFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        method: methodFilter !== "all" ? methodFilter : undefined,
        minAmount: minAmount || undefined,
        maxAmount: maxAmount || undefined,
        page: page - 1,
        limit: 10,
      });
      setSummary(res.summary);
      setTransactions(res.data);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error("Failed to load agent transactions:", err);
    } finally {
      setTxLoading(false);
    }
  }, [agentId, activeTab, statusFilter, dateFrom, dateTo, search, methodFilter, minAmount, maxAmount, page]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  async function handleApproveConfirm(txId: string) {
    if (!approveModal) return;
    setModalLoading(true);
    try {
      await api.approveRequest(parseInt(approveModal.originalId || approveModal.id), approveModal.amount, txId || undefined);
      setApproveModal(null);
      await loadTransactions();
      await loadAgent();
    } catch (error) { console.error("Failed to approve:", error); }
    finally { setModalLoading(false); }
  }

  async function handleRejectConfirm(note: string) {
    if (!rejectModal) return;
    setModalLoading(true);
    try {
      await api.rejectRequest(parseInt(rejectModal.originalId || rejectModal.id), note);
      setRejectModal(null);
      await loadTransactions();
      await loadAgent();
    } catch (error) { console.error("Failed to reject:", error); }
    finally { setModalLoading(false); }
  }

  const handleFilterSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTransactions();
  };

  const handleClearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setMethodFilter("all");
    setDatePreset("all");
    setMinAmount("");
    setMaxAmount("");
    setPage(1);
  };

  const applyDatePreset = (preset: string) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    setDatePreset(preset);
    
    switch (preset) {
      case 'today':
        setDateFrom(today);
        setDateTo(today);
        break;
      case 'yesterday': {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        const yesterdayStr = d.toISOString().split('T')[0];
        setDateFrom(yesterdayStr);
        setDateTo(yesterdayStr);
        break;
      }
      case '7days': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        setDateFrom(d.toISOString().split('T')[0]);
        setDateTo(today);
        break;
      }
      case '30days': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        setDateFrom(d.toISOString().split('T')[0]);
        setDateTo(today);
        break;
      }
      case 'thisMonth': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        setDateFrom(firstDay.toISOString().split('T')[0]);
        setDateTo(today);
        break;
      }
      default:
        setDateFrom("");
        setDateTo("");
    }
    setPage(1);
  };

  const refreshData = useCallback((isBackground = true) => {
    loadAgent(isBackground);
    loadBankAccounts(isBackground);
    loadTransactions(isBackground);
  }, [loadAgent, loadBankAccounts, loadTransactions]);

  useEffect(() => {
    connectAsAdmin();
    let debounceTimer: NodeJS.Timeout;
    const scheduleRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshData(true), 3000);
    };

    const handleAgentsUpdated = (payload: any) => {
      if (!payload || (payload.id && String(payload.id) !== String(agentId))) return;
      scheduleRefresh();
    };

    socket.on("pending:new", scheduleRefresh);
    socket.on("pending:updated", scheduleRefresh);
    socket.on("agents:updated", handleAgentsUpdated);
    socket.on("players:updated", scheduleRefresh);
    socket.on("revenue:updated", scheduleRefresh);

    return () => {
      clearTimeout(debounceTimer);
      socket.off("pending:new", scheduleRefresh);
      socket.off("pending:updated", scheduleRefresh);
      socket.off("agents:updated", handleAgentsUpdated);
      socket.off("players:updated", scheduleRefresh);
      socket.off("revenue:updated", scheduleRefresh);
    };
  }, [refreshData, agentId]);

  const handleAddAccount = async (payload: { method: string; accountName: string; accountNumber: string; isActive?: boolean; displayOrder?: number }) => {
    try {
      const newAccount = await api.createAgentBankAccount(agentId, payload);
      setBankAccounts((prev) => [...prev, newAccount]);
      setShowAddAccountModal(false);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to add bank account");
    }
  };

  const handleUpdateAccount = async (accountId: number, payload: { method?: string; accountName?: string; accountNumber?: string; isActive?: boolean; displayOrder?: number }) => {
    try {
      const updated = await api.updateAgentBankAccount(accountId, payload);
      setBankAccounts((prev) => prev.map((acc) => (acc.id === accountId ? updated : acc)));
      setEditingAccount(null);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to update bank account");
    }
  };

  const handleDeleteAccount = async (accountId: number) => {
    if (!confirm("Are you sure you want to delete this bank account?")) return;
    try {
      await api.deleteAgentBankAccount(accountId);
      setBankAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to delete bank account");
    }
  };

  const formatSummaryDateRange = () => {
    if (dateFrom && dateTo) return `${dateFrom} - ${dateTo}`;
    if (dateFrom) return `From ${dateFrom}`;
    if (dateTo) return `Until ${dateTo}`;
    const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${todayStr} - ${todayStr}`;
  };

  if (agentLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2F7EFF]" /></div>;
  }

  if (agentError || !agent) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-8 text-center">
        <h3 className="text-base font-bold text-red-600 dark:text-red-400">Error Loading Agent</h3>
        <p className="text-xs text-red-500 mt-1">{agentError || "Agent not found"}</p>
        <Link href="/agents" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#2F7EFF] underline">&larr; Back to Agents List</Link>
      </div>
    );
  }

  const balanceVal = typeof agent.balance === "number" && !isNaN(agent.balance) ? agent.balance : 0;
  const reservedVal = typeof agent.reserved === "number" && !isNaN(agent.reserved) ? agent.reserved : 0;

  return (
    <div className="space-y-6 pb-12">
      <div className="relative rounded-xl border border-[#29345E]/50 bg-[#171D3D] shadow-sm overflow-hidden mb-6">
        <div className="h-28 w-full bg-gradient-to-r from-[#a220d9] to-[#e91e63] relative flex items-center justify-center">
          <div className="absolute -bottom-10 flex flex-col items-center">
            <div className="h-20 w-20 rounded-full border-[3px] border-white dark:border-gray-950 bg-purple-900 flex items-center justify-center text-white shadow-sm overflow-hidden">
              <span className="text-3xl font-bold uppercase">{agent.name.charAt(0) || "A"}</span>
            </div>
          </div>
          <h1 className="absolute bottom-4 text-xl font-bold text-white tracking-wide">{agent.name}</h1>
        </div>

        <div className="pt-14 pb-6 px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start text-left border-t border-[#29345E]/50/60 pt-6">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Phone size={14} /><span>Phone Number</span></div>
                <p className="mt-1.5 text-[15px] font-semibold text-white tabular-nums">{agent.phone || "—"}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Check size={14} /><span>Active</span></div>
                <div className="mt-1.5">{agent.active ? <Check size={18} className="text-green-500" /> : <X size={18} className="text-red-500" />}</div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Percent size={14} /><span>Rate</span></div>
                <p className="mt-1.5 text-[15px] font-semibold text-white tabular-nums">{(agent.rate || 0).toFixed(2)}%</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Activity size={14} /><span>Live</span></div>
                <div className="mt-1.5 flex items-center">
                  <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${agent.live ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform`} style={{ transform: agent.live ? 'translateX(18px)' : 'translateX(3px)' }}/>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Wallet size={14} /><span>Wallet Balance</span></div>
                <p className="mt-1.5 text-[15px] font-semibold text-white tabular-nums">{formatETBPlain(balanceVal)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Calendar size={14} /><span>Joined Date</span></div>
                <p className="mt-1.5 text-[15px] font-semibold text-white">{formatDate(agent.createdAt)}</p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Hourglass size={14} /><span>Reserved Balance</span></div>
                <p className="mt-1.5 text-[15px] font-semibold text-white tabular-nums">{formatETBPlain(reservedVal)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#6C7285] font-medium"><Settings size={14} /><span>Actions</span></div>
                <div className="mt-1.5 flex items-center gap-2">
                  <button onClick={() => setShowBankModal(true)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#29345E] text-gray-500 hover:bg-[#29345E]/60 transition"><User size={14} /></button>
                  <button onClick={() => setShowWalletModal(true)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#29345E] text-gray-500 hover:bg-[#29345E]/60 transition"><Link2 size={14} /></button>
                  <button onClick={() => setShowEditModal(true)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#29345E] text-gray-500 hover:bg-[#29345E]/60 transition"><Pencil size={14} /></button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-[#29345E]/50/60 pt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bank Accounts (for Deposits)</span>
              <button onClick={() => setShowAddAccountModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2F7EFF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D81B60] transition-colors">
                <Plus size={13} /> Add Account
              </button>
            </div>
            {bankAccountsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-[#0B0F26] border border-[#29345E] animate-pulse" />)}</div>
            ) : bankAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#29345E] p-6 text-center"><p className="text-xs text-[#6C7285]">No bank accounts added yet.</p></div>
            ) : (
              <div className="space-y-2">
                {bankAccounts.map((acc) => (
                  <div key={acc.id} className={`rounded-xl border p-4 ${acc.isActive ? 'border-[#29345E] bg-white dark:bg-gray-900' : 'border-[#29345E]/50 bg-[#171D3D]/50 opacity-75'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${acc.method === 'CBE' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-500' : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'}`}>{acc.method}</div>
                        <div><p className="text-sm font-semibold text-white">{acc.accountName}</p><p className="text-xs text-[#B9C0D3] font-mono">{acc.accountNumber}</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${acc.isActive ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-[#0B0F26] border border-[#29345E] text-gray-500'}`}>{acc.isActive ? 'Active' : 'Inactive'}</span>
                        <button onClick={() => setEditingAccount(acc)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#29345E] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"><Pencil size={13} /></button>
                        <button onClick={() => handleDeleteAccount(acc.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#29345E] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mt-8"><h2 className="text-[17px] font-bold text-white">Transaction History</h2></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-5 shadow-sm relative">
            <div className="flex items-center gap-1.5 text-xs text-white font-semibold"><span>Confirmed Deposits</span><span className="text-gray-500 font-medium">[{formatSummaryDateRange()}]</span></div>
            <p className="mt-4 text-2xl font-bold text-white tabular-nums">{summary.confirmedDepositsSum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB</p>
          </div>
          <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-5 shadow-sm relative">
            <div className="flex items-center gap-1.5 text-xs text-white font-semibold"><span>Confirmed Withdrawals</span><span className="text-gray-500 font-medium">[{formatSummaryDateRange()}]</span></div>
            <p className="mt-4 text-2xl font-bold text-white tabular-nums">{summary.confirmedWithdrawalsSum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB</p>
          </div>
          <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-5 shadow-sm relative">
            <div className="flex items-center gap-1.5 text-xs text-white font-semibold"><span>Net</span><span className="text-gray-500 font-medium">[{formatSummaryDateRange()}]</span></div>
            <p className={`mt-4 text-2xl font-bold tabular-nums ${summary.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{summary.net.toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={() => { setActiveTab("deposit"); setPage(1); }} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition ${activeTab === "deposit" ? "bg-white text-gray-900" : "text-gray-500"}`}>Deposits</button>
          <button onClick={() => { setActiveTab("withdrawal"); setPage(1); }} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition ${activeTab === "withdrawal" ? "bg-white text-gray-900" : "text-gray-500"}`}>Withdrawals</button>
        </div>

        {/* Filters Section */}
        <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-[#B9C0D3] mb-3">{activeTab === "deposit" ? "Deposit" : "Withdrawal"} History Filters</h3>
          <form onSubmit={handleFilterSearch} className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full rounded border border-[#29345E] bg-[#0B0F26] px-3 py-1.5 text-[11px] text-white outline-none">
                <option value="all">All</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="pending">Pending</option>
              </select>
            </div>
            <div className="w-40">
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Date Range</label>
              <select value={datePreset} onChange={(e) => { applyDatePreset(e.target.value); }} className="w-full rounded border border-[#29345E] bg-[#0B0F26] px-3 py-1.5 text-[11px] text-white outline-none">
                <option value="all">All</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7days">This Week</option>
                <option value="thisMonth">This Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            {datePreset === "custom" && (
              <>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">From</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded border border-[#29345E] bg-[#0B0F26] px-3 py-1.5 text-[11px] text-white outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">To</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded border border-[#29345E] bg-[#0B0F26] px-3 py-1.5 text-[11px] text-white outline-none" />
                </div>
              </>
            )}
            <button type="submit" className="h-7 px-3 rounded bg-[#2F7EFF] text-white text-[11px] font-semibold flex items-center gap-1"><Filter size={11} /> Apply Filters</button>
            <button type="button" onClick={handleClearFilters} className="h-7 px-3 rounded border border-[#29345E] text-gray-400 text-[11px] flex items-center gap-1"><RotateCcw size={11} /> Reset</button>
          </form>
        </div>

        {/* Section Heading */}
        <h3 className="text-sm font-semibold text-[#B9C0D3] pt-1">
          {statusFilter === "confirmed" || statusFilter === "all" ? "Completed" : statusFilter === "rejected" ? "Rejected" : "Pending"} {activeTab === "deposit" ? "Deposits" : "Withdrawals"}
        </h3>

        {/* Data Table */}
        <div className="rounded-2xl border border-[#29345E]/50 bg-[#171D3D] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#171D3D]/50 text-[#B9C0D3] border-b border-[#29345E]/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">{activeTab === "deposit" ? "Bank" : "Account / Phone"}</th>
                  {activeTab === "withdrawal" && <th className="px-4 py-3 font-semibold">Account Holder</th>}
                  <th className="px-4 py-3 font-semibold">Txn Reference</th>
                  <th className="px-4 py-3 font-semibold">Proof/URL</th>
                  <th className="px-4 py-3 font-semibold">Requested At</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {txLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: activeTab === "deposit" ? 9 : 10 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 w-16 bg-[#0B0F26] border border-[#29345E] rounded animate-pulse" /></td>)}</tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={activeTab === "deposit" ? 9 : 10} className="px-4 py-12 text-center text-[#6C7285]">No transactions found.</td></tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[#29345E]/20 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{tx.userName}</div>
                        {tx.userPhone && tx.userPhone !== 'N/A' && <div className="text-[10px] text-gray-500">{tx.userPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{formatETB(tx.amount)}</td>
                      <td className="px-4 py-3">
                        {tx.method ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-800/30">{tx.method}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-400">{tx.accountNumber || "—"}</td>
                      {activeTab === "withdrawal" && <td className="px-4 py-3 text-gray-300">{tx.accountHolder || "—"}</td>}
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-400">{tx.transactionId || "—"}</td>
                      <td className="px-4 py-3">
                        {tx.verification?.receiptUrl ? (
                          <a href={tx.verification.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-[11px] hover:underline">View Proof</a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-[11px]">{formatDate(tx.date)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          tx.status === "Approved" ? "bg-green-900/20 text-green-400 border-green-800/40" :
                          tx.status === "Rejected" ? "bg-red-900/20 text-red-400 border-red-800/40" :
                          "bg-amber-900/20 text-amber-400 border-amber-800/40"
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      {/* Actions Column */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewDetailsModal(tx)} title="View Details"
                            className="inline-flex h-7 w-7 items-center justify-center rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition">
                            <Eye size={13} />
                          </button>
                          {tx.status === "Pending" && tx.source === "pr" && (
                            <>
                              <button onClick={() => setApproveModal(tx)} title="Approve"
                                className="inline-flex h-7 w-7 items-center justify-center rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 transition">
                                <Check size={13} />
                              </button>
                              <button onClick={() => setRejectModal(tx)} title="Reject"
                                className="inline-flex h-7 w-7 items-center justify-center rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition">
                                <X size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-[#29345E]/50 text-xs text-gray-500">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || txLoading}
              className="px-3 py-1.5 rounded-lg border border-[#29345E] disabled:opacity-40 hover:bg-[#29345E]/30 transition"
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || txLoading}
              className="px-3 py-1.5 rounded-lg border border-[#29345E] disabled:opacity-40 hover:bg-[#29345E]/30 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Render Modals when triggered */}
      {showBankModal && agent && (
        <BankDetailsModal agent={agent} onClose={() => setShowBankModal(false)} />
      )}
      {showWalletModal && agent && (
        <WalletModal agent={agent} onClose={() => setShowWalletModal(false)} onSaved={(updated) => { setAgent(updated); loadTransactions(); }} />
      )}
      {showEditModal && agent && (
        <EditAgentModal agent={agent} onClose={() => setShowEditModal(false)} onSaved={(updated) => setAgent(updated)} />
      )}

      {/* Add Bank Account Modal */}
      {showAddAccountModal && (
        <AddBankAccountModal
          onClose={() => setShowAddAccountModal(false)}
          onSaved={handleAddAccount}
        />
      )}

      {/* Edit Bank Account Modal */}
      {editingAccount && (
        <EditBankAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={(updated) => handleUpdateAccount(editingAccount.id, updated)}
        />
      )}

      {/* Approve / Reject / View Modals */}
      {approveModal && (
        <ApproveModal
          row={approveModal}
          onConfirm={handleApproveConfirm}
          onCancel={() => setApproveModal(null)}
          isLoading={modalLoading}
        />
      )}
      {rejectModal && (
        <RejectModal
          row={rejectModal}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectModal(null)}
          isLoading={modalLoading}
        />
      )}
      {viewDetailsModal && (
        <ViewDetailsModal
          row={viewDetailsModal}
          onClose={() => setViewDetailsModal(null)}
        />
      )}
    </div>
  );
}

