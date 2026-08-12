"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Megaphone,
  Users,
  Send,
  UploadCloud,
  X,
  Info,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api/client";
import type { BroadcastMode, Player } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_CHARS = 4000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Mode toggle ─────────────────────────────────────────────────────────────

interface ModeToggleProps {
  mode: BroadcastMode;
  onChange: (m: BroadcastMode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const btnBase =
    "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all select-none";
  const active =
    "bg-white dark:bg-gray-800 text-white shadow-sm border border-gray-200 dark:border-gray-700";
  const inactive =
    "text-[#B9C0D3] hover:text-gray-700 dark:hover:text-gray-200";

  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#0B0F26] border border-[#29345E] p-1 shrink-0">
      <button
        onClick={() => onChange("global")}
        className={`${btnBase} ${mode === "global" ? active : inactive}`}
      >
        <Megaphone size={14} className={mode === "global" ? "text-[#2F7EFF]" : "text-[#6C7285]"} />
        Global
      </button>
      <button
        onClick={() => onChange("targeted")}
        className={`${btnBase} ${mode === "targeted" ? active : inactive}`}
      >
        <Users size={14} className={mode === "targeted" ? "text-[#2F7EFF]" : "text-[#6C7285]"} />
        Targeted
      </button>
    </div>
  );
}

// ─── Image drop zone ──────────────────────────────────────────────────────────

interface ImageZoneProps {
  preview: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}

function ImageZone({ preview, onFile, onRemove }: ImageZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) return;
    onFile(file);
  }

  if (preview) {
    return (
      <div className="relative rounded-xl border border-[#29345E] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Attachment preview"
          className="w-full max-h-52 object-cover"
        />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          aria-label="Remove image"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors ${dragging
            ? "border-[#2F7EFF] bg-[#2F7EFF/15]/60 dark:bg-[#2F7EFF]/10"
            : "border-[#2F7EFF]/50 dark:border-[#2F7EFF]/25 bg-[#2F7EFF/15]/20 dark:bg-[#2F7EFF]/5 hover:bg-[#2F7EFF/15]/40 dark:hover:bg-[#2F7EFF]/10"
          }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15">
          <UploadCloud size={22} className="text-[#2F7EFF]" />
        </div>
        <p className="text-sm font-semibold text-[#B9C0D3]">
          Click or drag image here
        </p>
        <p className="text-xs text-[#6C7285]">
          PNG, JPG up to 5MB
        </p>
      </div>
    </>
  );
}

// ─── Targeted player picker ───────────────────────────────────────────────────

interface PlayerPickerProps {
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function PlayerPicker({ selected, onToggle }: PlayerPickerProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPlayers({ limit: 200 }).then((res) => {
      setPlayers(res.players);
      setLoading(false);
    }).catch((err) => {
      console.error("Error fetching players:", err);
      setLoading(false);
    });
  }, []);

  const filtered = players.filter(
    (p) =>
      (p.fullName || "").toLowerCase().includes(query.toLowerCase()) ||
      (p.phone || "").includes(query),
  );

  return (
    <div className="flex flex-col h-full gap-3">
      <div>
        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
          Select Recipients
        </p>
        <p className="text-xs text-[#6C7285] mt-0.5">
          {selected.size} player{selected.size !== 1 ? "s" : ""} selected
        </p>
      </div>

      <input
        type="text"
        placeholder="Search by name or phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20 transition"
      />

      <div className="flex-1 overflow-y-auto rounded-xl border border-[#29345E] bg-[#0B0F26] divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2F7EFF] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6C7285]">
            No players match your search.
          </p>
        ) : (
          filtered.map((player) => {
            const checked = selected.has(player.id);
            return (
              <label
                key={player.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[#29345E]/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(player.id)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-[#2F7EFF] accent-[#2F7EFF] cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {player.fullName}
                  </p>
                  <p className="text-xs text-[#6C7285] tabular-nums">
                    {player.phone}
                  </p>
                </div>
                {checked && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7EFF]" />
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Success toast ────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

function SuccessToast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 dark:bg-white px-5 py-3 shadow-xl border border-gray-800 dark:border-gray-200">
      <CheckCircle2 size={18} className="text-green-400 dark:text-green-600 shrink-0" />
      <p className="text-sm font-medium text-white dark:text-gray-900">{message}</p>
      <button onClick={onDismiss} className="ml-1 text-[#6C7285] hover:text-gray-200 dark:hover:text-gray-700">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Confirmation Modal ───────────────────────────────────────────────────────

interface ConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmGlobalModal({ onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl space-y-4 border border-[#29345E]/50">
        <div className="flex items-center gap-3 text-[#2F7EFF]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15">
            <AlertTriangle size={20} className="text-[#2F7EFF]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              Confirm Global Broadcast
            </h3>
            <p className="text-xs text-[#6C7285]">
              This action sends a message to all players.
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Are you sure you want to send this broadcast message to{" "}
          <strong className="text-white font-semibold">
            EVERY verified player
          </strong>{" "}
          in your database via Telegram Bot?
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-[#B9C0D3] hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-[#2F7EFF] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4DA3FF] transition"
          >
            Confirm & Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BroadcastCenter() {
  const [mode, setMode] = useState<BroadcastMode>("global");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function handleImageFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleImageRemove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
  }

  const handleTogglePlayer = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  async function executeSend() {
    setSending(true);
    try {
      let imageDataUrl: string | null = null;
      if (imageFile) {
        imageDataUrl = await readFileAsDataUrl(imageFile);
      }

      const res = await api.sendBroadcast({
        mode,
        playerIds: mode === "targeted" ? Array.from(selected) : undefined,
        subject: subject.trim() || undefined,
        message: message.trim(),
        imageUrl: imageDataUrl,
      });

      if (res?.success) {
        setToast(res.message);
        setSubject("");
        setMessage("");
        handleImageRemove();
        setSelected(new Set());
      } else {
        setToast("Failed to send broadcast.");
      }
    } catch (err: any) {
      console.error("Broadcast send error", err);
      setToast(err?.response?.data?.message || err?.message || "Failed to send broadcast.");
    } finally {
      setSending(false);
    }
  }

  function handleSendClick() {
    if (mode === "global") {
      setShowConfirm(true);
    } else {
      executeSend();
    }
  }

  const charCount = message.length;
  const canSend = message.trim().length > 0 && (mode === "global" || selected.size > 0);

  const labelCls =
    "block text-xs font-semibold uppercase tracking-wider text-[#B9C0D3] mb-1.5";
  const inputCls =
    "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-[#0B0F26] px-4 py-2.5 text-sm text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20";

  return (
    <>
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15 mt-0.5">
            <Megaphone size={20} className="text-[#2F7EFF]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">
              Broadcast Center
            </h1>
            <p className="text-sm text-[#6C7285] mt-0.5">
              Send updates via Telegram Bot.
            </p>
          </div>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">

        {/* ── LEFT: Compose card ── */}
        <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white">Compose</h2>
            <p className="text-sm text-[#6C7285] mt-0.5">
              {mode === "global"
                ? "Sending to all players."
                : "Sending to selected players."}
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className={labelCls}>Subject (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Announcement"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Image attachment */}
          <div>
            <label className={labelCls}>Image Attachment (Optional)</label>
            <ImageZone
              preview={previewUrl}
              onFile={handleImageFile}
              onRemove={handleImageRemove}
            />
          </div>

          {/* Message body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelCls} mb-0`}>Message Body</label>
              <span className={`text-xs tabular-nums ${charCount > MAX_CHARS * 0.9 ? "text-amber-500" : "text-[#6C7285]"}`}>
                {charCount} / {MAX_CHARS}
              </span>
            </div>
            <textarea
              rows={7}
              placeholder="Type your message here..."
              value={message}
              maxLength={MAX_CHARS}
              onChange={(e) => setMessage(e.target.value)}
              className={`${inputCls} resize-none`}
            />
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[#6C7285]">
              <Info size={12} className="shrink-0 mt-0.5" />
              MarkdownV2 is supported. Use{" "}
              <code className="font-mono">*bold*</code>,{" "}
              <code className="font-mono">_italic_</code>, or{" "}
              <code className="font-mono">[links](url)</code>.
            </p>
          </div>

          {/* Send button */}
          <button
            onClick={handleSendClick}
            disabled={sending || !canSend}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2F7EFF] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#4DA3FF] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40 disabled:opacity-50 disabled:pointer-events-none"
          >
            {sending
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} />
            }
            {sending ? "Sending…" : "Send Broadcast"}
          </button>

          {mode === "targeted" && selected.size === 0 && !sending && (
            <p className="text-center text-xs text-[#6C7285] -mt-3">
              Select at least one player to enable sending.
            </p>
          )}
        </div>

        {/* ── RIGHT: Preview / Player picker ── */}
        <div
          className={`rounded-xl border border-[#29345E] p-5 ${mode === "targeted"
              ? "bg-[#0B0F26] flex flex-col"
              : "bg-[#171D3D]"
            }`}
          style={mode === "targeted" ? { minHeight: "560px" } : {}}
        >
          {mode === "global" ? (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2F7EFF/15] dark:bg-[#2F7EFF]/15">
                <Megaphone size={28} className="text-[#2F7EFF]" />
              </div>
              <div>
                <p className="text-base font-bold text-white">
                  Global Broadcast Active
                </p>
                <p className="mt-2 text-sm text-[#B9C0D3] max-w-[260px] leading-relaxed">
                  This message will be sent to{" "}
                  <span className="font-semibold text-[#B9C0D3]">
                    every verified user
                  </span>{" "}
                  in your database. Please double-check your content before sending.
                </p>
              </div>
            </div>
          ) : (
            <PlayerPicker selected={selected} onToggle={handleTogglePlayer} />
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmGlobalModal
          onConfirm={() => {
            setShowConfirm(false);
            executeSend();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {toast && (
        <SuccessToast message={toast} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}

