"use client";

import { Users, Layers, Calendar, Activity } from "lucide-react";
import type { LiveEngineStats } from "@/types";

interface LiveEngineStatsProps {
  stats: LiveEngineStats;
}

function formatStartTime(iso: string): string {
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

const statusStyles: Record<string, string> = {
  Active: "bg-green-900/40 text-green-400 border border-green-700/40",
  Completed: "bg-[#29345E]/60 text-[#B9C0D3] border border-[#29345E]",
  Paused: "bg-[#FFC83D]/10 text-[#FFC83D] border border-[#FFC83D]/30",
  Pending: "bg-[#2F7EFF]/15 text-[#4DA3FF] border border-[#2F7EFF]/30",
};

export default function LiveEngineStatsGrid({ stats }: LiveEngineStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

      {/* a. STATUS */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-4 flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6C7285]">
          Status
        </p>
        <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles[stats.status] ?? "bg-[#29345E]/60 text-[#B9C0D3] border border-[#29345E]"}`}>
          {stats.status}
        </span>
      </div>

      {/* b. TOTAL PRIZE POOL */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-4 flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6C7285]">
          Total Prize Pool
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-[#FFC83D] leading-none">
            {stats.totalPrizePool.toLocaleString()}
          </span>
          <span className="text-sm font-medium text-[#6C7285]">
            {stats.prizePoolCurrency}
          </span>
        </p>
      </div>

      {/* c. TOTAL ENROLLMENT */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-4 flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6C7285]">
          Total Enrollment
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users size={16} className="text-[#4DA3FF] shrink-0" />
            <span className="text-2xl font-bold text-white leading-none">
              {stats.totalPlayers}
            </span>
            <span className="text-xs text-[#6C7285]">({stats.totalPlayersInParens})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Layers size={16} className="text-[#7EA8FF] shrink-0" />
            <span className="text-2xl font-bold text-white leading-none">
              {stats.totalEnrollmentCards}
            </span>
            <span className="text-xs text-[#6C7285]">({stats.totalCardsInParens})</span>
          </div>
        </div>
      </div>

      {/* d. START TIME */}
      <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-4 flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6C7285]">
          Start Time
        </p>
        <div className="flex items-center gap-2 text-[#B9C0D3]">
          <Calendar size={15} className="text-[#6C7285] shrink-0" />
          <span className="text-sm font-medium">{formatStartTime(stats.startTime)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Outer card wrapper ────────────────────────────────────────────────────────

interface LiveEngineCardProps {
  stats: LiveEngineStats;
}

export function LiveEngineCard({ stats }: LiveEngineCardProps) {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#171D3D] overflow-hidden shadow-lg shadow-black/20">
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2F7EFF 0%, #4DA3FF 100%)' }} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-900/30 border border-green-700/30">
            <Activity size={18} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">
              Live Engine
            </h2>
            <p className="text-sm text-[#6C7285] mt-0.5">
              Real-time telemetry for the current active session
            </p>
          </div>
        </div>
        <LiveEngineStatsGrid stats={stats} />
      </div>
    </div>
  );
}
