"use client";

import { useState, useMemo } from "react";
import { History } from "lucide-react";
import type { PreviousGame, PreviousGameStatus } from "@/types";
import Pagination from "@/components/ui/Pagination";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const statusStyles: Record<PreviousGameStatus, string> = {
  Completed:
    "bg-[#29345E]/60 text-[#B9C0D3] border border-[#29345E]",
  "Waiting for Players":
    "bg-[#2F7EFF]/15 text-[#4DA3FF] border border-[#2F7EFF]/30",
  Cancelled:
    "bg-red-900/30 text-red-400 border border-red-800/30",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return isToday
    ? `Today, ${timeStr}`
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    `, ${timeStr}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviousGamesTableProps {
  games: PreviousGame[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PreviousGamesTable({ games }: PreviousGamesTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const from = games.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, games.length);
  const pageRows = useMemo(() => games.slice(from - 1, to), [games, from, to]);

  function handlePageChange(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }

  const columns = ["ID", "Status", "Prize", "Cards", "Created At"] as const;

  return (
    <div className="rounded-xl border border-[#29345E] bg-[#171D3D] overflow-hidden shadow-lg shadow-black/20">
      {/* Gradient top border */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2F7EFF 0%, #4DA3FF 100%)' }} />

      <div className="p-5 sm:p-6">
        {/* ── Section header ── */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2F7EFF]/15 border border-[#2F7EFF]/30">
            <History size={18} className="text-[#4DA3FF]" />
          </div>
          <h2 className="text-xl font-bold text-white leading-tight">
            Previous Games
          </h2>
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
              <tr className="border-b border-[#29345E] bg-[#0B0F26]">
                {columns.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className={`whitespace-nowrap px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6C7285] ${col === "Created At" || col === "Prize"
                        ? "text-right"
                        : "text-left"
                      }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {pageRows.map((game, rowIdx) => (
                <tr
                  key={game.id}
                  className={`border-b border-[#29345E]/50 transition-colors hover:bg-[#29345E]/30 ${rowIdx % 2 === 1
                      ? "bg-[#0B0F26]/50"
                      : "bg-[#171D3D]"
                    }`}
                >
                  {/* ID */}
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <span className="font-mono text-xs text-[#6C7285] tracking-wide">
                      {game.id}
                    </span>
                  </td>

                  {/* Status badge */}
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[game.status]
                        }`}
                    >
                      {game.status}
                    </span>
                  </td>

                  {/* Prize */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums">
                    {game.prize > 0 ? (
                      <>
                        <span className="font-bold text-[#FFC83D]">
                          {game.prize}
                        </span>
                        <span className="ml-1 text-xs font-medium text-[#6C7285]">
                          ETB
                        </span>
                      </>
                    ) : (
                      <span className="text-[#6C7285] text-xs">ETB</span>
                    )}
                  </td>

                  {/* Cards */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-[#B9C0D3] tabular-nums">
                    {game.cards}
                  </td>

                  {/* Created At */}
                  <td className="whitespace-nowrap px-5 py-3.5 text-right text-[#6C7285] text-xs">
                    {formatCreatedAt(game.createdAt)}
                  </td>
                </tr>
              ))}

              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-[#6C7285]"
                  >
                    No previous games found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {games.length > 0 && (
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            from={from}
            to={to}
            total={games.length}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
