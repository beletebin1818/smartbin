"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Gamepad2, TrendingUp, MessageSquare, Users, UserCog,
  ClipboardList, ArrowLeftRight, ShieldCheck, Settings,
  Sun, Moon, Monitor, ChevronRight, X, LogOut, User, KeyRound, Check,
  Smartphone,
} from "lucide-react";
import type { NavItem, ThemeMode } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

// ─── Nav config ───────────────────────────────────────────────────────────────

const navItems: NavItem[] = [
  { id: "games", label: "Games", href: "/games" },
  { id: "revenue", label: "Revenue", href: "/revenue" },
  { id: "messages", label: "Messages", href: "/messages" },
  { id: "players", label: "Players", href: "/players" },
  { id: "agents", label: "Agents", href: "/agents" },
  { id: "pending-request", label: "Pending Request", href: "/pending-request" },
  { id: "transactions", label: "Transactions", href: "/transactions" },
  { id: "devices", label: "Device Management", href: "/devices" },
  { id: "admin-users", label: "Admin Users", href: "/admin-users" },
  { id: "game-settings", label: "Game Settings", href: "/game-settings" },
];

const navIcons: Record<string, React.ReactNode> = {
  games: <Gamepad2 size={18} />,
  revenue: <TrendingUp size={18} />,
  messages: <MessageSquare size={18} />,
  players: <Users size={18} />,
  agents: <UserCog size={18} />,
  "pending-request": <ClipboardList size={18} />,
  transactions: <ArrowLeftRight size={18} />,
  devices: <Smartphone size={18} />,
  "admin-users": <ShieldCheck size={18} />,
  "game-settings": <Settings size={18} />,
};

// ─── Theme option config ──────────────────────────────────────────────────────

const themeOptions: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: "light", label: "Light", icon: <Sun size={14} /> },
  { mode: "dark", label: "Dark", icon: <Moon size={14} /> },
  { mode: "system", label: "System", icon: <Monitor size={14} /> },
];

function themeIcon(mode: ThemeMode, size = 16) {
  if (mode === "dark") return <Moon size={size} />;
  if (mode === "system") return <Monitor size={size} />;
  return <Sun size={size} />;
}

function themeLabel(mode: ThemeMode) {
  if (mode === "dark") return "Dark";
  if (mode === "system") return "System";
  return "Light";
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();

  const [themeOpen, setThemeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  // Close theme dropdown when clicking outside
  useEffect(() => {
    if (!themeOpen) return;
    function handler(e: MouseEvent) {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeOpen]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const displayName = user?.name ?? "—";
  const displayHandle = user?.username ?? "—";
  const displayInitial = displayName.charAt(0).toUpperCase();
  const displayRole = user?.role ?? "";

  const sidebarContent = (
    <aside className="flex h-full w-64 flex-col bg-[#171D3D] border-r border-[#29345E]">

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-lg shadow-[#2F7EFF]/30"
          style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
        >
          <span className="text-white font-black text-lg leading-none">S</span>
        </div>
        <div>
          <p className="font-bold text-white leading-tight">Smart Bingo</p>
          <p className="text-xs leading-tight text-[#4DA3FF]">Play Smart, Win Big!</p>
        </div>
        <button
          onClick={onMobileClose}
          className="ml-auto lg:hidden text-[#6C7285] hover:text-[#B9C0D3] transition-colors"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Section label ── */}
      <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6C7285]">
        Dashboard Menu
      </p>

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {navItems
            .filter((item) => {
              const rawRole = user?.role as string | undefined;
              if (rawRole === 'agent' || rawRole === 'Agent') {
                return item.id !== 'admin-users' && item.id !== 'game-settings';
              }
              return true;
            })
            .map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${isActive
                      ? "bg-[#2F7EFF]/15 text-[#4DA3FF] shadow-sm"
                      : "text-[#B9C0D3] hover:bg-[#29345E]/60 hover:text-white"
                      }`}
                  >
                    <span className={isActive ? "text-[#4DA3FF]" : "text-[#6C7285]"}>
                      {navIcons[item.id]}
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#2F7EFF]" />
                    )}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>

      {/* ── Bottom section ── */}
      <div className="border-t border-[#29345E] px-3 py-3 space-y-1">

        {/* Theme picker */}
        <div ref={themeRef} className="relative">
          <button
            onClick={() => setThemeOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#B9C0D3] hover:bg-[#29345E]/60 hover:text-white transition-colors"
          >
            <span className="text-[#6C7285]">
              {themeIcon(mode)}
            </span>
            <span className="flex-1 text-left">
              {themeLabel(mode)}
              <span className="ml-1 text-xs text-[#6C7285]">Theme</span>
            </span>
            <ChevronRight
              size={14}
              className={`text-[#6C7285] transition-transform ${themeOpen ? "rotate-90" : ""}`}
            />
          </button>

          {/* Dropdown */}
          {themeOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-[#29345E] bg-[#0B0F26] shadow-xl py-1 z-50">
              {themeOptions.map(({ mode: m, label, icon }) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setThemeOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[#B9C0D3] hover:bg-[#29345E]/60 hover:text-white transition-colors"
                >
                  <span className="text-[#6C7285]">{icon}</span>
                  <span className="flex-1 text-left">{label}</span>
                  {mode === m && (
                    <Check size={13} className="text-[#2F7EFF] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile row */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-[#29345E]/60 transition-colors"
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
            >
              {displayInitial}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="font-semibold text-white text-sm leading-tight truncate">
                {displayName}
              </p>
              <p className="text-xs text-[#6C7285] leading-tight truncate">
                {displayRole || displayHandle}
              </p>
            </div>
            <ChevronRight
              size={14}
              className={`text-[#6C7285] transition-transform ${profileOpen ? "rotate-90" : ""}`}
            />
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-[#29345E] bg-[#0B0F26] shadow-xl py-1 z-50">
              <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[#B9C0D3] hover:bg-[#29345E]/60 hover:text-white transition-colors">
                <User size={14} className="text-[#6C7285]" />
                Profile Settings
              </button>
              <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[#B9C0D3] hover:bg-[#29345E]/60 hover:text-white transition-colors">
                <KeyRound size={14} className="text-[#6C7285]" />
                Change Password
              </button>
              <hr className="my-1 border-[#29345E]" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="absolute left-0 top-0 bottom-0 flex">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
