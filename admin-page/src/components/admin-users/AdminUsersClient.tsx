"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Eye, EyeOff,
  ShieldCheck, KeyRound, ChevronDown, Check,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { socket, connectAsAdmin } from "@/lib/socket";
import type {
  AdminUser, AdminRole, AdminStatus,
  NewAdminUserPayload, UpdateAdminUserPayload,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: AdminRole[] = ["Super Admin", "Admin", "Moderator", "Support"];

const rolePillColors: Record<AdminRole, string> = {
  "Super Admin": "bg-[#2F7EFF] text-white",
  Admin: "bg-blue-600  text-white",
  Moderator: "bg-amber-500 text-white",
  Support: "bg-teal-600  text-white",
  Agent: "bg-indigo-600 text-white",
};

// ─── Shared modal shell ───────────────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, subtitle, onClose, children }: ModalShellProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[#29345E] bg-[#171D3D] shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#29345E]/50 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">{title}</h2>
            <p className="text-sm text-[#6C7285] mt-0.5 leading-snug">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="ml-4 shrink-0 mt-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Shared field primitives ──────────────────────────────────────────────────

const labelCls = "block text-sm font-semibold text-[#B9C0D3] mb-1.5";

function fieldCls(error?: string) {
  return (
    "w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2 " +
    "text-white placeholder-gray-400 dark:placeholder-gray-600 " +
    (error
      ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-900/30"
      : "border-gray-200 dark:border-gray-700 bg-[#0B0F26] focus:border-[#2F7EFF] focus:ring-[#2F7EFF]/20")
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
}

function PasswordField({ label, value, onChange, error, autoComplete = "new-password", placeholder = "••••••••" }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldCls(error)} pr-11`}
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285] hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40 ${checked ? "bg-[#2F7EFF]" : "bg-gray-300 dark:bg-gray-600"}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
      <span className="text-sm text-[#B9C0D3] leading-snug">{label}</span>
    </div>
  );
}

// ─── Create Admin Modal ───────────────────────────────────────────────────────

interface CreateModalProps { onClose: () => void; onCreated: (u: AdminUser) => void; }

function CreateAdminModal({ onClose, onCreated }: CreateModalProps) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [role, setRole] = useState<AdminRole>("Support");
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = "Username is required.";
    if (!name.trim()) e.name = "Full name is required.";
    if (password.length < 4) e.password = "Password must be at least 4 characters.";
    if (confirm !== password) e.confirm = "Passwords do not match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: NewAdminUserPayload = {
        name: name.trim(), username: username.trim(),
        password, role, jobTitle: jobTitle.trim(),
        status: active ? "active" : "inactive",
      };
      const created = await api.createAdminUser(payload);
      onCreated(created);
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "Failed to create admin. Please try again.";
      setErrors({ form: message });
    }
    finally { setSubmitting(false); }
  }

  return (
    <ModalShell
      title="Create New Admin User"
      subtitle="Setup login credentials and assign an administrative role."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
        {errors.form && (
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">{errors.form}</p>
        )}

        {/* Row 1: Username + Full Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Username (Login ID)</label>
            <input ref={firstRef} type="text" placeholder="e.g., jane_admin" autoComplete="off"
              value={username} onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: "" })); }}
              className={fieldCls(errors.username)} />
            {errors.username && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.username}</p>}
          </div>
          <div>
            <label className={labelCls}>Full Name</label>
            <input type="text" placeholder="Jane Doe"
              value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
              className={fieldCls(errors.name)} />
            {errors.name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.name}</p>}
          </div>
        </div>

        {/* Row 2: Password + Confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PasswordField label="Password" value={password} error={errors.password}
            onChange={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: "" })); }} />
          <PasswordField label="Confirm Password" value={confirm} error={errors.confirm}
            onChange={(v) => { setConfirm(v); setErrors((p) => ({ ...p, confirm: "" })); }} />
        </div>

        {/* Row 3: Job Title + Role + Status toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
          <div>
            <label className={labelCls}>Job Title (Optional)</label>
            <input type="text" placeholder="Manager"
              value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
              className={fieldCls()} />
          </div>
          <div>
            <label className={labelCls}>Admin Role</label>
            <div className="relative">
              <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}
                className={`${fieldCls()} appearance-none pr-9`}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Account Status</label>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-[#0B0F26] px-3 py-2.5">
              <ToggleSwitch checked={active} onChange={setActive}
                label="Account is active and can log in." />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4DA3FF] transition-colors disabled:opacity-60 disabled:pointer-events-none">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Creating…" : "Create Admin"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Edit Admin Modal ─────────────────────────────────────────────────────────

interface EditModalProps { user: AdminUser; onClose: () => void; onUpdated: (u: AdminUser) => void; }

function EditAdminModal({ user, onClose, onUpdated }: EditModalProps) {
  const [username, setUsername] = useState(user.username);
  const [name, setName] = useState(user.name);
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [role, setRole] = useState<AdminRole>(user.role);
  const [active, setActive] = useState(user.status === "active");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-select Full Name input text on open
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.select(); }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = "Username is required.";
    if (!name.trim()) e.name = "Full name is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: UpdateAdminUserPayload = {
        name: name.trim(), username: username.trim(),
        role, jobTitle: jobTitle.trim(),
        status: active ? "active" : "inactive",
      };
      const updated = await api.updateAdminUser(user.id, payload);
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "Failed to save changes. Please try again.";
      setErrors({ form: message });
    }
    finally { setSubmitting(false); }
  }

  return (
    <ModalShell
      title="Edit Admin User"
      subtitle="Update the profile and access details for this admin."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
        {errors.form && (
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">{errors.form}</p>
        )}

        {/* Row 1: Username (editable) + Full Name (auto-selected) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Username (Login ID)</label>
            <input type="text" autoComplete="off"
              value={username} onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: "" })); }}
              className={fieldCls(errors.username)} />
            {errors.username && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.username}</p>}
          </div>
          <div>
            <label className={labelCls}>Full Name</label>
            <input ref={nameRef} type="text"
              value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
              className={`${fieldCls(errors.name)} selection:bg-[#2F7EFF]/20`} />
            {errors.name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{errors.name}</p>}
          </div>
        </div>

        {/* Job Title — full width */}
        <div>
          <label className={labelCls}>Job Title (Optional)</label>
          <input type="text" placeholder="e.g. Manager"
            value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
            className={fieldCls()} />
        </div>

        {/* Row 2: Role + Status toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div>
            <label className={labelCls}>Admin Role</label>
            <div className="relative">
              <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}
                className={`${fieldCls()} appearance-none pr-9`}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Account Status</label>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-[#0B0F26] px-3 py-2.5">
              <ToggleSwitch checked={active} onChange={setActive}
                label="Account is active and can log in." />
            </div>
          </div>
        </div>

        {/* Footer — Save Changes right-aligned only */}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4DA3FF] transition-colors disabled:opacity-60 disabled:pointer-events-none">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

interface ResetPasswordModalProps { user: AdminUser; onClose: () => void; }

function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  // PasswordField manages its own show/hide but we need a ref on the first one
  useEffect(() => { firstRef.current?.focus(); }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (newPass.length < 4) e.newPass = "Password must be at least 4 characters.";
    if (confirm !== newPass) e.confirm = "Passwords do not match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.resetAdminUserPassword(user.id, newPass);
      setSuccess(true);
      setTimeout(onClose, 1400);
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "Failed to reset password. Please try again.";
      setErrors({ form: message });
    }
    finally { setSubmitting(false); }
  }

  return (
    <ModalShell
      title={`Reset Password for ${user.username}`}
      subtitle="Enter a new password. The new password must be confirmed."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
        {errors.form && (
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">{errors.form}</p>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2.5">
            <Check size={14} className="text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-xs font-medium text-green-700 dark:text-green-400">Password reset successfully.</p>
          </div>
        )}

        <PasswordField label="New Password" value={newPass} error={errors.newPass}
          onChange={(v) => { setNewPass(v); setErrors((p) => ({ ...p, newPass: "" })); }} />
        <PasswordField label="Confirm New Password" value={confirm} error={errors.confirm}
          onChange={(v) => { setConfirm(v); setErrors((p) => ({ ...p, confirm: "" })); }} />

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={submitting || success}
            className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4DA3FF] transition-colors disabled:opacity-60 disabled:pointer-events-none">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Resetting…" : "Reset Password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

interface DeleteConfirmProps { user: AdminUser; onConfirm: () => void; onCancel: () => void; }

function DeleteConfirm({ user, onConfirm, onCancel }: DeleteConfirmProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-xl">
        <h3 className="text-base font-bold text-white mb-2">Delete Admin User</h3>
        <p className="text-sm text-[#B9C0D3] mb-5">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-gray-800 dark:text-gray-200">@{user.username}</span>?{" "}
          This action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ActiveModal = "create" | "edit" | "reset" | "delete" | null;

export default function AdminUsersClient() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [modal, setModal] = useState<ActiveModal>(null);
  const [target, setTarget] = useState<AdminUser | null>(null);

  const fetchAdmins = useCallback(() => {
    return api.getAdminUsers().then((data) => { setAdmins(data); setLoadingData(false); });
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  // Real-time sync: refresh whenever another admin session creates, edits,
  // or removes an admin user (backend emits on the shared `admin_room`).
  useEffect(() => {
    connectAsAdmin();
    const handleRealtimeUpdate = () => { fetchAdmins(); };
    socket.on("admin_users:updated", handleRealtimeUpdate);
    return () => { socket.off("admin_users:updated", handleRealtimeUpdate); };
  }, [fetchAdmins]);

  function openModal(m: ActiveModal, user?: AdminUser) {
    setTarget(user ?? null);
    setModal(m);
  }
  function closeModal() { setModal(null); setTarget(null); }

  function handleCreated(u: AdminUser) { setAdmins((p) => [...p, u]); }
  function handleUpdated(u: AdminUser) { setAdmins((p) => p.map((a) => (a.id === u.id ? u : a))); }
  async function handleDelete(u: AdminUser) {
    try {
      await api.deleteAdminUser(u.id);
      setAdmins((p) => p.filter((a) => a.id !== u.id));
      closeModal();
    } catch (err) {
      console.error("Failed to delete admin user:", err);
    }
  }

  const COLS = ["Username", "Full Name", "Role", "Title", "Status", "Actions"] as const;

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">
          Admin Users Management
        </h1>
        <button onClick={() => openModal("create")}
          className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4DA3FF] transition-colors">
          <Plus size={15} />
          Create Admin
        </button>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#29345E]/50">
          <ShieldCheck size={17} className="text-[#2F7EFF] shrink-0" />
          <h2 className="text-base font-bold text-white">System Admins</h2>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2F7EFF] border-t-transparent" />
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#171D3D] to-transparent z-10" aria-hidden="true" />
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#29345E] bg-[#171D3D]">
                  {COLS.map((col) => (
                    <th key={col} scope="col"
                      className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6C7285]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-[#0B0F26]">
                {admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-[#29345E]/30 transition-colors">

                    {/* Username */}
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-sm text-[#B9C0D3]">
                      {admin.username}
                    </td>

                    {/* Full Name */}
                    <td className="whitespace-nowrap px-5 py-3.5 font-medium text-white">
                      {admin.name}
                    </td>

                    {/* Role pill */}
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${rolePillColors[admin.role] ?? "bg-gray-200 text-gray-700"}`}>
                        {admin.role.toLowerCase()}
                      </span>
                    </td>

                    {/* Job Title */}
                    <td className="whitespace-nowrap px-5 py-3.5 text-gray-600 dark:text-gray-400 text-sm">
                      {admin.jobTitle || <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>

                    {/* Status */}
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${admin.status === "active" ? "text-green-600 dark:text-green-400" : "text-[#6C7285]"}`}>
                        <Check size={13} className={admin.status === "active" ? "text-green-500" : "opacity-0"} />
                        {admin.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <button onClick={() => openModal("edit", admin)} title="Edit admin"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[#B9C0D3] hover:hover:bg-[#29345E]/60 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                          <Pencil size={13} />
                        </button>
                        {/* Reset password */}
                        <button onClick={() => openModal("reset", admin)} title="Reset password"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[#B9C0D3] hover:hover:bg-[#29345E]/60 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                          <KeyRound size={13} />
                        </button>
                        {/* Delete */}
                        <button onClick={() => openModal("delete", admin)} title="Delete admin"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {admins.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="px-5 py-16 text-center text-sm text-[#6C7285]">
                      No admin users yet. Create one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "create" && (
        <CreateAdminModal onClose={closeModal} onCreated={handleCreated} />
      )}
      {modal === "edit" && target && (
        <EditAdminModal user={target} onClose={closeModal} onUpdated={handleUpdated} />
      )}
      {modal === "reset" && target && (
        <ResetPasswordModal user={target} onClose={closeModal} />
      )}
      {modal === "delete" && target && (
        <DeleteConfirm
          user={target}
          onConfirm={() => handleDelete(target)}
          onCancel={closeModal}
        />
      )}
    </>
  );
}

