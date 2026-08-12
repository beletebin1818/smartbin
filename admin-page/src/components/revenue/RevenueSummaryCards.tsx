"use client";

import {
  Wallet,
  Gamepad2,
  Gift,
  ArrowRightLeft,
  UserCog,
  User,
  ArrowLeftRight,
} from "lucide-react";
import type { RevenueSummaryCard } from "@/types";

// ─── Icon map ────────────────────────────────────────────────────────────────

function CardIcon({ type }: { type: RevenueSummaryCard["iconType"] }) {
  const cls = "text-[#7EA8FF]";
  const size = 16;
  switch (type) {
    case "wallet": return <Wallet size={size} className={cls} />;
    case "game": return <Gamepad2 size={size} className={cls} />;
    case "bonus": return <Gift size={size} className={cls} />;
    case "arrows": return <ArrowRightLeft size={size} className={cls} />;
    case "agent": return <UserCog size={size} className={cls} />;
    case "player": return <User size={size} className={cls} />;
    case "direct": return <ArrowLeftRight size={size} className={cls} />;
    default: return null;
  }
}

// ─── Amount formatter ────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-${abs}` : abs;
}

// ─── Single card ─────────────────────────────────────────────────────────────

function SummaryCard({ card }: { card: RevenueSummaryCard }) {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#171D3D] p-5 flex flex-col gap-2 hover:border-[#2F7EFF]/50 hover:shadow-lg hover:shadow-[#2F7EFF]/5 transition-all">
      {/* Title + icon row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[#B9C0D3] leading-tight">
          {card.title}
        </p>
        <span className="shrink-0 mt-0.5">
          <CardIcon type={card.iconType} />
        </span>
      </div>

      {/* Amount */}
      <p className="text-2xl font-bold leading-tight tracking-tight text-[#FFC83D]">
        {card.currency} {formatAmount(card.amount)}
      </p>

      {/* Subtitle */}
      <p className="text-xs text-[#6C7285] leading-snug">
        {card.subtitle}
      </p>
    </div>
  );
}

// ─── Loading card (skeleton) ──────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#171D3D] p-5 flex flex-col gap-2 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 rounded bg-[#29345E] w-3/4" />
        <div className="h-4 w-4 rounded bg-[#29345E] shrink-0 mt-0.5" />
      </div>
      <div className="h-7 rounded bg-[#29345E] w-1/2" />
      <div className="h-3 rounded bg-[#29345E] w-5/6" />
    </div>
  );
}

// ─── Grid layout ─────────────────────────────────────────────────────────────

interface RevenueSummaryCardsProps {
  cards: RevenueSummaryCard[];
  loading?: boolean;
}

export default function RevenueSummaryCards({ cards, loading = false }: RevenueSummaryCardsProps) {
  const row1 = cards.slice(0, 3);
  const row2 = cards.slice(3);

  return (
    <div className="space-y-4">
      {/* Row 1 — 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? [0, 1, 2].map((i) => <LoadingCard key={`loading-1-${i}`} />)
          : row1.map((card) => <SummaryCard key={card.id} card={card} />)
        }
      </div>

      {/* Row 2 — 4 cards */}
      {(loading || row2.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading
            ? [0, 1, 2, 3].map((i) => <LoadingCard key={`loading-2-${i}`} />)
            : row2.map((card) => <SummaryCard key={card.id} card={card} />)
          }
        </div>
      )}
    </div>
  );
}
