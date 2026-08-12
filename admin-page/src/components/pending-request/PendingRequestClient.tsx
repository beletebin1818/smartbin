"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CreditCard, CircleArrowDown, Link2, Hourglass,
  PlusCircle, MinusCircle, Calendar, Search,
  ChevronDown, Check, X, Eye, Hash,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { socket, connectAsAdmin } from "@/lib/socket";
import type {
  PendingRequest,
  PendingRequestStats,
  RequestType,
  RequestStatusFilter,
} from "@/types";
import SimplePagination from "@/components/ui/SimplePagination";

function formatDate(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return isToday
    ? `Today, ${time}`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + `, ${time}`;
}

function formatETB(n: number): string {
  return `ETB ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface StatCardProps { title: string; value: string; icon: React.ReactNode; iconBg: string; loading: boolean; }
function StatCard({ title, value, icon, iconBg, loading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6C7285] leading-tight">{title}</p>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}>{icon}</div>
      </div>
      {loading
        ? <div className="h-8 w-28 rounded-md bg-[#0B0F26] border border-[#29345E] animate-pulse" />
        : <p className="text-3xl font-bold text-white leading-none tracking-tight">{value}</p>}
    </div>
  );
}

const STATUS_BADGE: Record<PendingRequest["status"], string> = {
  Pending:  "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400",
  Approved: "bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
  Rejected: "bg-red-100    text-red-600    dark:bg-red-900/30    dark:text-red-400",
};

interface SelectProps<T extends string> { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string; }
function Select<T extends string>({ value, options, onChange, className = "" }: SelectProps<T>) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 pr-9 text-sm text-[#B9C0D3] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-4 pr-9 py-2 text-sm text-[#B9C0D3] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20 [color-scheme:light] dark:[color-scheme:dark]" />
      <Calendar size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
    </div>
  );
}

const STATUS_OPTIONS: { value: RequestStatusFilter; label: string }[] = [
  { value: "all", label: "All" }, { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" },
];

function DetailRow({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#B9C0D3] shrink-0">{label}</span>
      <span className={`text-right ${highlight ? "font-bold text-[#2F7EFF]" : "font-medium text-white"} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function ApproveModal({ row, onConfirm, onCancel, isLoading }: {
  row: PendingRequest; onConfirm: (txId: string) => void; onCancel: () => void; isLoading: boolean;
}) {
  const [txId, setTxId] = useState(row.transactionId || "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
                {row.verification.mismatchFields.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-xl border border-[#29345E]/50 bg-[#171D3D] p-4 space-y-2.5 text-sm">
          <DetailRow label="Player" value={row.userName} />
          <DetailRow label="Method" value={row.method || "\u2014"} />
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
            <Check size={14} />{isLoading ? "Approving\u2026" : "Confirm Approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ row, onConfirm, onCancel, isLoading }: {
  row: PendingRequest; onConfirm: (note: string) => void; onCancel: () => void; isLoading: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
            <X size={14} />{isLoading ? "Rejecting\u2026" : "Confirm Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewDetailsModal({ row, onClose }: { row: PendingRequest; onClose: () => void }) {
  const isWithdrawal = row.type === "withdrawal";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
          <DetailRow label="Player ID" value={row.playerId || "\u2014"} />
          <DetailRow label="Player Name" value={row.userName} />
          <DetailRow label="Username" value={row.username ? `@${row.username}` : "\u2014"} />
          <DetailRow label="Phone" value={row.userPhone} />
          <hr className="border-gray-200 dark:border-gray-700" />
          <DetailRow label="Type" value={row.type.charAt(0).toUpperCase() + row.type.slice(1)} />
          <DetailRow label="Amount" value={formatETB(row.amount)} highlight />
          {isWithdrawal && (
            <>
              <DetailRow label="Method" value={row.method || "\u2014"} />
              <DetailRow label={row.method === "Telebirr" ? "Telebirr Phone" : "CBE Account No."} value={row.accountNumber || "\u2014"} mono />
              <DetailRow label="Account Holder" value={row.accountHolder || "\u2014"} />
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
              <DetailRow label="SMS Amount" value={row.verification.smsAmount ? formatETB(row.verification.smsAmount) : "\u2014"} />
              <DetailRow label="Receipt Amount" value={row.verification.receiptAmount ? formatETB(row.verification.receiptAmount) : "\u2014"} />
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
                    {row.verification.mismatchFields.map((msg, i) => <li key={i}>{msg}</li>)}
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

export default function PendingRequestClient() {
  const [stats, setStats] = useState<PendingRequestStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RequestType>("deposit");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<PendingRequest[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [approveModal, setApproveModal] = useState<PendingRequest | null>(null);
  const [rejectModal, setRejectModal] = useState<PendingRequest | null>(null);
  const [detailsModal, setDetailsModal] = useState<PendingRequest | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStats = useCallback(async (df?: string, dt?: string, q?: string) => {
    try {
      const response = await api.getPendingRequestStats({ dateFrom: df || undefined, dateTo: dt || undefined, search: q || undefined });
      setStats(response);
      setStatsLoading(false);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { refreshStats(dateFrom, dateTo, search); }, [refreshStats, dateFrom, dateTo, search]);

  const fetchRows = useCallback(async (
    tab: RequestType, p: number,
    q: string, sf: RequestStatusFilter, df: string, dt: string,
  ) => {
    setLoading(true);
    try {
      const response = await api.getPendingRequests({
        type: tab,
        status: sf === "all" ? undefined : sf.toLowerCase(),
        page: p - 1,
        limit: 20,
        search: q || undefined,
        dateFrom: df || undefined,
        dateTo: dt || undefined,
      });
      setRows(response.data || []);
      setTotalPages(Math.ceil((response.total || 0) / 20));
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
      setRows([]);
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(activeTab, page, search, statusFilter, dateFrom, dateTo); }, [activeTab, page]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchRows(activeTab, 1, search, statusFilter, dateFrom, dateTo);
    }, 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    connectAsAdmin();
    const handleRealtimeUpdate = () => {
      fetchRows(activeTab, page, search, statusFilter, dateFrom, dateTo);
      refreshStats(dateFrom, dateTo, search);
    };
    socket.on("pending:new", handleRealtimeUpdate);
    socket.on("pending:updated", handleRealtimeUpdate);
    return () => {
      socket.off("pending:new", handleRealtimeUpdate);
      socket.off("pending:updated", handleRealtimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, search, statusFilter, dateFrom, dateTo]);

  function handleTabChange(tab: RequestType) {
    setActiveTab(tab); setPage(1); setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo("");
  }

  async function handleApproveConfirm(txId: string) {
    if (!approveModal) return;
    setModalLoading(true);
    try {
      await api.approveRequest(parseInt(approveModal.id), approveModal.amount, txId || undefined);
      setApproveModal(null);
      await fetchRows(activeTab, page, search, statusFilter, dateFrom, dateTo);
      refreshStats(dateFrom, dateTo, search);
    } catch (error) { console.error("Failed to approve:", error); }
    finally { setModalLoading(false); }
  }

  async function handleRejectConfirm(note: string) {
    if (!rejectModal) return;
    setModalLoading(true);
    try {
      await api.rejectRequest(parseInt(rejectModal.id), note || undefined);
      setRejectModal(null);
      await fetchRows(activeTab, page, search, statusFilter, dateFrom, dateTo);
      refreshStats(dateFrom, dateTo, search);
    } catch (error) { console.error("Failed to reject:", error); }
    finally { setModalLoading(false); }
  }

  const inputCls = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-4 py-2 text-sm text-[#B9C0D3] placeholder-gray-400 dark:placeholder-gray-600 outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20";

  const DEPOSIT_COLUMNS    = ["User", "Amount", "Agent", "Date", "Status", "Verification", "Actions"] as const;
  const WITHDRAWAL_COLUMNS = ["Player ID", "Username", "Player Name", "Amount", "Method", "Agent", "Account / Phone", "Account Holder", "Date and Time", "Status", "Transaction ID", "Actions"] as const;
  const COLUMNS = activeTab === "withdrawal" ? WITHDRAWAL_COLUMNS : DEPOSIT_COLUMNS;

  function ActionButtons({ row }: { row: PendingRequest }) {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => setDetailsModal(row)} title="View Details"
          className="inline-flex items-center gap-1 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <Eye size={11} />View
        </button>
        {row.status === "Pending" && (
          <>
            <button onClick={() => setApproveModal(row)} title="Approve"
              className="inline-flex items-center gap-1 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 px-2.5 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">
              <Check size={11} />Approve
            </button>
            <button onClick={() => setRejectModal(row)} title="Reject"
              className="inline-flex items-center gap-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
              <X size={11} />Reject
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {approveModal && <ApproveModal row={approveModal} onConfirm={handleApproveConfirm} onCancel={() => setApproveModal(null)} isLoading={modalLoading} />}
      {rejectModal && <RejectModal row={rejectModal} onConfirm={handleRejectConfirm} onCancel={() => setRejectModal(null)} isLoading={modalLoading} />}
      {detailsModal && <ViewDetailsModal row={detailsModal} onClose={() => setDetailsModal(null)} />}

      <div className="space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Pending Requests</h1>
          <p className="text-sm text-[#6C7285] mt-0.5">Review and action deposit and withdrawal requests.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard title="Pending Deposits" value={stats ? String(stats.pendingDeposits) : "\u2014"} icon={<CreditCard size={16} className="text-[#2F7EFF]" />} iconBg="bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15" loading={statsLoading} />
          <StatCard title="Pending Withdrawals" value={stats ? String(stats.pendingWithdrawals) : "\u2014"} icon={<CircleArrowDown size={16} className="text-amber-500 dark:text-amber-400" />} iconBg="bg-amber-50 dark:bg-amber-900/25" loading={statsLoading} />
          <StatCard title="Total Deposit (ETB)" value={stats ? stats.totalDepositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "\u2014"} icon={<Link2 size={16} className="text-indigo-500 dark:text-indigo-400" />} iconBg="bg-indigo-50 dark:bg-indigo-900/25" loading={statsLoading} />
          <StatCard title="Total Withdrawal (ETB)" value={stats ? stats.totalWithdrawalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "\u2014"} icon={<Hourglass size={16} className="text-green-600 dark:text-green-400" />} iconBg="bg-green-50 dark:bg-green-900/25" loading={statsLoading} />
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#0B0F26] border border-[#29345E] p-1">
          <button onClick={() => handleTabChange("deposit")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === "deposit" ? "bg-white dark:bg-gray-800 text-white shadow-sm border border-gray-200 dark:border-gray-700" : "text-[#B9C0D3] hover:text-gray-700 dark:hover:text-gray-200"}`}>
            <PlusCircle size={15} className={activeTab === "deposit" ? "text-[#2F7EFF]" : "text-[#6C7285]"} />
            Deposits
          </button>
          <button onClick={() => handleTabChange("withdrawal")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === "withdrawal" ? "bg-white dark:bg-gray-800 text-white shadow-sm border border-gray-200 dark:border-gray-700" : "text-[#B9C0D3] hover:text-gray-700 dark:hover:text-gray-200"}`}>
            <MinusCircle size={15} className={activeTab === "withdrawal" ? "text-[#2F7EFF]" : "text-[#6C7285]"} />
            Withdrawals
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
            <input type="text"
              placeholder={activeTab === "withdrawal" ? "Search by name, phone or account no." : "Search by user name or phone"}
              value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} />
          </div>
          <Select<RequestStatusFilter> value={statusFilter} options={STATUS_OPTIONS} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
          <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
          <DateInput value={dateTo}   onChange={(v) => { setDateTo(v);   setPage(1); }} />
        </div>

        <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] overflow-hidden">
          <div className="relative overflow-x-auto">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#171D3D] to-transparent z-10 rounded-r-xl" aria-hidden="true" />
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#29345E] bg-[#171D3D]">
                  {COLUMNS.map((col) => (
                    <th key={col} scope="col"
                      className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6C7285]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[#0B0F26] divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: COLUMNS.length }).map((_, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-4 w-24 rounded bg-[#0B0F26] border border-[#29345E] animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-5 py-14 text-center text-sm text-[#6C7285]">
                      No {activeTab} requests match your filters.
                    </td>
                  </tr>
                ) : activeTab === "withdrawal" ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#29345E]/30 transition-colors">
                      {/* Player ID */}
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[#B9C0D3]">
                        #{row.playerId || "\u2014"}
                      </td>
                      {/* Username */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[#B9C0D3]">
                        {row.username ? <span className="font-mono">@{row.username}</span> : <span className="text-gray-300 dark:text-gray-600">\u2014</span>}
                      </td>
                      {/* Player Name */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div>
                          <span className="font-medium text-[#2F7EFF] text-sm">{row.userName}</span>
                          <p className="text-xs text-[#6C7285] tabular-nums mt-0.5">{row.userPhone}</p>
                        </div>
                      </td>
                      {/* Amount */}
                      <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-white tabular-nums">
                        {formatETB(row.amount)}
                      </td>
                      {/* Method */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {row.method ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.method === "Telebirr"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}>
                            {row.method}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>}
                      </td>

                      {/* Agent */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {row.status === "Pending" ? (
                          <span className="text-[#6C7285] text-xs">Pending</span>
                        ) : row.agentUsername ? (
                          // If agentUsername looks like a full name (contains space), show as plain text;
                          // otherwise treat it as a username and prefix with @ for consistency.
                          (row.agentUsername.indexOf(' ') >= 0) ? (
                            <span className="text-sm text-[#B9C0D3]">{row.agentUsername}</span>
                          ) : (
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">@{row.agentUsername}</span>
                          )
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>
                        )}
                      </td>
                      {/* Account / Phone */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {row.accountNumber
                          ? <span className="font-mono text-sm font-medium text-gray-800 dark:text-gray-200">{row.accountNumber}</span>
                          : <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>}
                      </td>
                      {/* Account Holder */}
                      <td className="px-5 py-3.5 max-w-[180px]">
                        {row.accountHolder
                          ? <span className="text-sm text-[#B9C0D3]">{row.accountHolder}</span>
                          : <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>}
                      </td>
                      {/* Date and Time */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#6C7285] text-xs">
                        {formatDate(row.date)}
                      </td>
                      {/* Status */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                          {row.status}
                        </span>
                      </td>
                      {/* Transaction ID */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {row.transactionId
                          ? <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{row.transactionId}</span>
                          : <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>}
                      </td>
                      {/* Actions */}
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <ActionButtons row={row} />
                      </td>
                    </tr>
                  ))
                ) : (
                  /* DEPOSIT TABLE */
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#29345E]/30 transition-colors">
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div>
                          <span className="font-medium text-[#2F7EFF] text-sm">{row.userName}</span>
                          <p className="text-xs text-[#6C7285] tabular-nums mt-0.5">{row.userPhone}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-white tabular-nums">
                        {formatETB(row.amount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                       {row.agentUsername ? (
                         (row.agentUsername.indexOf(' ') >= 0) ? (
                           <span className="text-sm text-[#B9C0D3]">{row.agentUsername}</span>
                         ) : (
                           <span className="font-mono text-xs text-gray-600 dark:text-gray-400">@{row.agentUsername}</span>
                         )
                       ) : (
                         <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>
                       )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#6C7285] text-xs">
                        {formatDate(row.date)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {row.verification ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.verification.status === 'VERIFIED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            row.verification.status === 'MISMATCH' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {row.verification.status}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-xs">\u2014</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <ActionButtons row={row} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4">
            <SimplePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>

      </div>
    </>
  );
}

