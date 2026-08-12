"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Users, Radio, Wallet, Hourglass,
  Plus, Pencil, Trash2, X, Loader2, Eye, EyeOff,
  ChevronDown, Check, ExternalLink, Landmark, CreditCard,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { socket, connectAsAdmin } from "@/lib/socket";
import type {
  Agent, AgentStats, AgentFormPayload,
  AgentStatusFilter, AgentLiveFilter,
} from "@/types";
import SimplePagination from "@/components/ui/SimplePagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatETB(n: number): string {
  return `ETB ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// ─── Summary stat card ────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  loading: boolean;
}

function StatCard({ title, value, icon, iconBg, loading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6C7285] leading-tight">
          {title}
        </p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-24 rounded-md bg-[#0B0F26] border border-[#29345E] animate-pulse" />
      ) : (
        <p className="text-3xl font-bold text-white leading-none tracking-tight">
          {value}
        </p>
      )}
    </div>
  );
}

// ─── Select dropdown (reusable) ───────────────────────────────────────────────

interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

function Select<T extends string>({ value, options, onChange, className = "" }: SelectProps<T>) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="
          w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-900 px-4 py-2 pr-9 text-sm
          text-[#B9C0D3] outline-none transition
          focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20
        "
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]"
      />
    </div>
  );
}

// ─── Wallet Change Modal ─────────────────────────────────────────────────────────

interface WalletChangeModalProps {
  agent: Agent;
  onClose: () => void;
  onSaved: (agent: Agent) => void;
}

function WalletChangeModal({ agent, onClose, onSaved }: WalletChangeModalProps) {
  const [txType, setTxType] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.agentWalletChange(agent.id, { type: txType, amount: num, note: note.trim() || undefined });
      onSaved(result.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Wallet Change</h3>
            <p className="text-xs text-[#B9C0D3] mt-0.5">Deposit or withdraw funds for the selected agent.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Type + Amount row */}
          <div className="flex gap-2">
            {/* Dropdown */}
            <div className="relative">
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as 'deposit' | 'withdraw')}
                className="h-10 appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-3 pr-8 text-sm text-[#B9C0D3] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
              >
                <option value="deposit">Deposit</option>
                <option value="withdraw">Withdraw</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {/* Amount */}
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => { if (e.target.value === '0') setAmount(''); }}
              onBlur={(e) => { if (e.target.value === '') setAmount('0'); }}
              className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-white outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
            />
          </div>

          {/* Notes */}
          <textarea
            placeholder="Notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-[#B9C0D3] placeholder-gray-400 dark:placeholder-gray-600 outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
          />

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2F7EFF] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#D81B60] focus:outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bank Details Modal (Image 3) ──────────────────────────────────────────────

interface BankModalProps {
  agent: Agent;
  onClose: () => void;
}

function BankModal({ agent, onClose }: BankModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Bank Details</h3>
            <p className="text-xs text-[#B9C0D3] mt-0.5">Agent financial information</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* CBE Section */}
          <div className="rounded-xl border border-[#29345E] bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base font-bold text-amber-800 dark:text-amber-500">🏦 CBE</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-[#6C7285] font-medium">Account</span>
                <span className="text-sm font-bold text-white block mt-0.5">
                  {agent.cbeAccount || "—"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-[#6C7285] font-medium">Holder</span>
                <span className="text-sm font-bold text-white block mt-0.5">
                  {agent.cbeHolder || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* TeleBirr Section */}
          <div className="rounded-xl border border-[#29345E] bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base font-bold text-sky-600 dark:text-sky-400">📱 TeleBirr</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-[#6C7285] font-medium">Phone</span>
                <span className="text-sm font-bold text-white block mt-0.5">
                  {agent.telebirrPhone || "—"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-[#6C7285] font-medium">Holder</span>
                <span className="text-sm font-bold text-white block mt-0.5">
                  {agent.telebirrHolder || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agent form modal (create + edit, Image 1) ─────────────────────────────

interface AgentModalProps {
  initial?: Agent | null;
  onClose: () => void;
  onSaved: (agent: Agent) => void;
}

function AgentModal({ initial, onClose, onSaved }: AgentModalProps) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rate, setRate] = useState(String(initial?.rate ?? "0.03"));
  const [active, setActive] = useState(initial?.active ?? true);
  const [role, setRole] = useState(initial?.role ?? "agent");

  const [cbeAccount, setCbeAccount] = useState(initial?.cbeAccount ?? "");
  const [cbeHolder, setCbeHolder] = useState(initial?.cbeHolder ?? "");
  const [telebirrPhone, setTelebirrPhone] = useState(initial?.telebirrPhone ?? "");
  const [telebirrHolder, setTelebirrHolder] = useState(initial?.telebirrHolder ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Full name is required.";
    if (!phone.trim()) e.phone = "Phone number is required.";
    if (!username.trim()) e.username = "Username is required.";
    if (!isEdit && password.length < 4) e.password = "Password must be at least 4 characters.";
    const r = parseFloat(rate);
    if (isNaN(r) || r < 0 || r > 1) e.rate = "Rate must be between 0 and 1.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: AgentFormPayload = {
        name, phone, username, rate: parseFloat(rate) || 0, active, role,
        cbeAccount, cbeHolder, telebirrPhone, telebirrHolder,
        ...(password ? { password } : {}),
      };
      const saved = isEdit
        ? await api.updateAgent(initial!.id, payload)
        : await api.createAgent(payload);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "Something went wrong. Please try again.";
      setErrors({ form: message });
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2 " +
    "text-white placeholder-gray-400 dark:placeholder-gray-600 bg-white dark:bg-gray-900 ";
  const fieldCls = (k: string) =>
    inputBase + (errors[k]
      ? "border-red-300 dark:border-red-700 focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-900/30"
      : "border-gray-200 dark:border-gray-700 focus:border-[#2F7EFF] focus:ring-[#2F7EFF]/20");
  const labelCls = "block text-xs font-semibold text-[#B9C0D3] mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#29345E]/50 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? "Edit Agent" : "Create Agent"}
            </h2>
            <p className="text-xs text-[#B9C0D3] mt-0.5 leading-relaxed">
              Fill the form to add a new agent. The agent will use their Username and the Temporary Password to log in.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {errors.form && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
              {errors.form}
            </p>
          )}

          {/* Row 1: Full Name & Username */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Full Name</label>
              <input ref={firstRef} type="text" placeholder="Agent Name" value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                className={fieldCls("name")} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className={labelCls}>Username (Login ID)</label>
              <input type="text" placeholder="e.g., agent_john123" value={username}
                onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: "" })); }}
                className={fieldCls("username")} />
              {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
            </div>
          </div>

          {/* Row 2: Phone & Password */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone Number</label>
              <input type="text" placeholder="+251..." value={phone}
                onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: "" })); }}
                className={fieldCls("phone")} />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className={labelCls}>Initial Password</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} placeholder="••••••••" value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: "" })); }}
                  className={fieldCls("password")} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>
          </div>

          {/* Row 3: Commission Rate & Account Status */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <div>
              <label className={labelCls}>Commission Rate (0-1)</label>
              <input type="number" step="0.01" min="0" max="1" placeholder="0.03" value={rate}
                onChange={(e) => { setRate(e.target.value); setErrors((p) => ({ ...p, rate: "" })); }}
                className={fieldCls("rate")} />
              {errors.rate && <p className="text-xs text-red-500 mt-1">{errors.rate}</p>}
            </div>
            <div>
              <label className={labelCls}>Account Status</label>
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    active ? "bg-[#2F7EFF]" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-xs text-[#B9C0D3]">Account is active and can log in.</span>
              </div>
            </div>
          </div>

          {/* Row 4: Role */}
          <div>
            <label className={labelCls}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm text-[#B9C0D3] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
            >
              <option value="agent">Agent</option>
              <option value="super_agent">Super Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Bank Details Section */}
          <div className="pt-2">
            <h3 className="text-xs font-semibold text-[#B9C0D3] uppercase tracking-wider mb-3">Bank Details</h3>

            {/* CBE */}
            <div className="mb-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-500">
                <span>🏦</span> CBE
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Account Number</label>
                  <input type="text" placeholder="1000234567890" value={cbeAccount}
                    onChange={(e) => setCbeAccount(e.target.value)}
                    className={fieldCls("cbeAccount")} />
                </div>
                <div>
                  <label className={labelCls}>Holder Name</label>
                  <input type="text" placeholder="John Doe" value={cbeHolder}
                    onChange={(e) => setCbeHolder(e.target.value)}
                    className={fieldCls("cbeHolder")} />
                </div>
              </div>
            </div>

            {/* TeleBirr */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400">
                <span>📱</span> TeleBirr
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="text" placeholder="+251..." value={telebirrPhone}
                    onChange={(e) => setTelebirrPhone(e.target.value)}
                    className={fieldCls("telebirrPhone")} />
                </div>
                <div>
                  <label className={labelCls}>Holder Name</label>
                  <input type="text" placeholder="John Doe" value={telebirrHolder}
                    onChange={(e) => setTelebirrHolder(e.target.value)}
                    className={fieldCls("telebirrHolder")} />
                </div>
              </div>
            </div>
          </div>

          {/* Submit button */}
          <div className="flex justify-end pt-4 border-t border-[#29345E]/50">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2F7EFF] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#D81B60] focus:outline-none focus:ring-2 focus:ring-[#2F7EFF]/20 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : isEdit ? "Save Changes" : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

interface DeleteConfirmProps {
  agent: Agent;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({ agent, onConfirm, onCancel }: DeleteConfirmProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 mb-4">
          <Trash2 size={22} />
        </div>
        <h3 className="text-base font-bold text-white">Remove Agent</h3>
        <p className="mt-1 text-xs text-[#B9C0D3]">
          Are you sure you want to remove <span className="font-semibold text-[#B9C0D3]">{agent.name}</span> (@{agent.username})? This action cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-1/2 rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-xs font-semibold text-[#B9C0D3] hover:bg-[#29345E]/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-1/2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Delete Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AgentStatusFilter; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const LIVE_OPTIONS: { value: AgentLiveFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "offline", label: "Offline" },
];

export default function AgentsClient() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Filters
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatusFilter>("all");
  const [liveFilter, setLiveFilter] = useState<AgentLiveFilter>("all");

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Agent | null>(null);
  const [bankTarget, setBankTarget] = useState<Agent | null>(null);
  const [walletTarget, setWalletTarget] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  // Debounce search
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load
  useEffect(() => {
    api.getAgentStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setStatsLoading(false));
  }, []);

  const fetchAgents = useCallback((
    p: number,
    fn: string,
    ph: string,
    st: AgentStatusFilter,
    lv: AgentLiveFilter,
  ) => {
    setLoading(true);
    api.getAgents({ page: p, fullName: fn || undefined, phone: ph || undefined, statusFilter: st, liveFilter: lv })
      .then((res) => {
        setAgents(res.agents);
        setTotalPages(res.totalPages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter change (debounced for text inputs)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchAgents(1, fullName, phone, statusFilter, liveFilter);
    }, 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fullName, phone, statusFilter, liveFilter, fetchAgents]);

  // Page change
  useEffect(() => {
    fetchAgents(page, fullName, phone, statusFilter, liveFilter);
  }, [page, fetchAgents]);

  function refreshStats() {
    api.getAgentStats().then(setStats);
  }

  useEffect(() => {
    connectAsAdmin();
    const handleRealtimeUpdate = () => {
      fetchAgents(page, fullName, phone, statusFilter, liveFilter);
      refreshStats();
    };
    socket.on("agents:updated", handleRealtimeUpdate);
    return () => { socket.off("agents:updated", handleRealtimeUpdate); };
  }, [page, fullName, phone, statusFilter, liveFilter, fetchAgents]);

  function handleSaved(saved: Agent) {
    const isNew = !agents.some((a) => a.id === saved.id);
    if (isNew) {
      setAgents((prev) => [saved, ...prev]);
    } else {
      setAgents((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    }
    refreshStats();
  }

  function handleWalletSaved(updated: Agent) {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    refreshStats();
  }

  async function handleDelete(agent: Agent) {
    try {
      await api.deleteAgent(agent.id);
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      setDeleteTarget(null);
      refreshStats();
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-gray-200 dark:border-gray-700 " +
    "bg-white dark:bg-gray-900 px-4 py-2 text-sm " +
    "text-[#B9C0D3] placeholder-gray-400 dark:placeholder-gray-600 " +
    "outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20";

  const COLUMNS = [
    "Username", "Phone No.", "Name", "Rate", "Active", "Live",
    "Balance", "Reserved", "Registered By", "Created At", "Actions",
  ] as const;

  return (
    <div className="space-y-6">

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        <p className="text-sm text-[#6C7285] mt-0.5">
          Manage all registered agents and their wallet balances.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Agents"
          value={stats ? String(stats.totalAgents) : "—"}
          icon={<Users size={16} className="text-[#2F7EFF]" />}
          iconBg="bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15"
          loading={statsLoading}
        />
        <StatCard
          title="Live Agents"
          value={stats ? String(stats.liveAgents) : "—"}
          icon={<Radio size={16} className="text-green-600 dark:text-green-400" />}
          iconBg="bg-green-50 dark:bg-green-900/25"
          loading={statsLoading}
        />
        <StatCard
          title="Total Wallet Balance"
          value={stats ? `ETB ${stats.totalWalletBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
          icon={<Wallet size={16} className="text-indigo-500 dark:text-indigo-400" />}
          iconBg="bg-indigo-50 dark:bg-indigo-900/25"
          loading={statsLoading}
        />
        <StatCard
          title="Total Reserved Balance"
          value={stats ? `ETB ${stats.totalReservedBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
          icon={<Hourglass size={16} className="text-amber-500 dark:text-amber-400" />}
          iconBg="bg-amber-50 dark:bg-amber-900/25"
          loading={statsLoading}
        />
      </div>

      {/* Agents card */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#2F7EFF] to-[#FF9800]" />

        <div className="p-5 sm:p-6">

          {/* Card header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                <Users size={17} className="text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Agents</h2>
            </div>
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4DA3FF] transition-colors shrink-0"
            >
              <Plus size={15} />
              Create New Agent
            </button>
          </div>

          {/* Search and filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
            />
            <Select<AgentStatusFilter>
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            <Select<AgentLiveFilter>
              value={liveFilter}
              options={LIVE_OPTIONS}
              onChange={(v) => { setLiveFilter(v); setPage(1); }}
            />
          </div>

          {/* Table */}
          <div className="relative overflow-x-auto rounded-xl border border-[#29345E]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#29345E] bg-[#171D3D]">
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6C7285]"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-[#0B0F26] divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {COLUMNS.map((col) => (
                        <td key={col} className="px-4 py-3">
                          <div className="h-4 w-20 rounded bg-[#0B0F26] border border-[#29345E] animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : agents.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-4 py-14 text-center text-sm text-[#6C7285]">
                      No agents match your filters.
                    </td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-[#29345E]/30 transition-colors">

                      {/* Username */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/agents/${agent.id}`} className="inline-flex items-center gap-1 text-[#2F7EFF] hover:underline font-medium text-sm">
                          {agent.username}
                          <ExternalLink size={11} className="shrink-0 opacity-70" />
                        </Link>
                      </td>

                      {/* Phone */}
                      <td className="whitespace-nowrap px-4 py-3 text-[#B9C0D3] tabular-nums text-sm">
                        {agent.phone}
                      </td>

                      {/* Name */}
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                        {agent.name}
                      </td>

                      {/* Rate */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#B9C0D3]">
                        {agent.rate.toFixed(2)}%
                      </td>

                      {/* Active */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {agent.active ? (
                          <Check size={16} className="text-green-500" />
                        ) : (
                          <X size={16} className="text-red-500" />
                        )}
                      </td>

                      {/* Live */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex h-3 w-3 rounded-full border-2 ${agent.live
                              ? "bg-green-500 border-green-500"
                              : "bg-transparent border-gray-300 dark:border-gray-600"
                            }`}
                          title={agent.live ? "Live" : "Offline"}
                        />
                      </td>

                      {/* Balance */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#B9C0D3]">
                        {formatETB(agent.balance)}
                      </td>

                      {/* Reserved */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#B9C0D3]">
                        {formatETB(agent.reserved)}
                      </td>

                      {/* Registered By */}
                      <td className="whitespace-nowrap px-4 py-3 text-[#6C7285] text-xs">
                        {agent.registeredBy}
                      </td>

                      {/* Created At */}
                      <td className="whitespace-nowrap px-4 py-3 text-[#6C7285] text-xs">
                        {formatCreatedAt(agent.createdAt)}
                      </td>

                      {/* Actions (Matching Image 2: 4 icons in order) */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* 1. Bank Icon -> Open Bank Details Modal */}
                          <button
                            title="Bank details"
                            onClick={() => setBankTarget(agent)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#29345E] text-[#B9C0D3] hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          >
                            <Landmark size={15} />
                          </button>
                          {/* 2. Wallet Change Icon */}
                          <button
                            title="Wallet change"
                            onClick={() => setWalletTarget(agent)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#29345E] text-[#B9C0D3] hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          >
                            <CreditCard size={15} />
                          </button>
                          {/* 3. Pencil Icon -> Edit Agent */}
                          <button
                            title="Edit agent"
                            onClick={() => { setEditTarget(agent); setShowModal(true); }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#29345E] text-[#B9C0D3] hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          {/* 4. Trash Icon -> Delete Agent */}
                          <button
                            title="Remove agent"
                            onClick={() => setDeleteTarget(agent)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#29345E] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <AgentModal
          initial={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSaved={handleSaved}
        />
      )}
      {bankTarget && (
        <BankModal
          agent={bankTarget}
          onClose={() => setBankTarget(null)}
        />
      )}
      {walletTarget && (
        <WalletChangeModal
          agent={walletTarget}
          onClose={() => setWalletTarget(null)}
          onSaved={(updated) => { handleWalletSaved(updated); setWalletTarget(null); }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          agent={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

