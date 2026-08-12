"use client";

import { useState, useMemo } from "react";
import type { PlayerRow } from "@/types";
import Pagination from "@/components/ui/Pagination";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlayersTableProps {
  players: PlayerRow[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PlayersTable({ players }: PlayersTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalCards = useMemo(
    () => players.reduce((sum, p) => sum + p.cards, 0),
    [players],
  );

  const humanContribution = useMemo(
    () => players.reduce((sum, p) => sum + p.totalBet, 0),
    [players],
  );

  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const from = players.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, players.length);
  const pageRows = players.slice(from - 1, to);

  function handlePageChange(page: number) {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }

  return (
    <div>
      {/* Section heading */}
      <h3 className="text-lg font-bold text-white mb-4">
        {players.length} Real Players with {totalCards} Cards
      </h3>

      <div className="relative overflow-x-auto rounded-xl border border-[#29345E]">
        {/* Scroll-fade on right edge */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#171D3D] to-transparent z-10 rounded-r-xl"
          aria-hidden="true"
        />

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#29345E] bg-[#0B0F26]">
              {(["User", "Phone", "Stake", "Cards", "Total Bet"] as const).map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6C7285] cursor-pointer select-none hover:text-[#B9C0D3] transition-colors"
                  title={`Sort by ${col}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#29345E]/50 bg-[#171D3D]">
            {pageRows.map((player) => (
              <tr key={player.id} className="hover:bg-[#29345E]/30 transition-colors">
                {/* User */}
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2F7EFF]/15 text-[#4DA3FF] text-xs font-bold">
                      {player.name.charAt(0)}
                    </div>
                    <span className="font-medium text-[#4DA3FF]">
                      {player.name}
                    </span>
                  </div>
                </td>

                {/* Phone */}
                <td className="whitespace-nowrap px-4 py-3 text-[#B9C0D3] tabular-nums">
                  {player.phone}
                </td>

                {/* Stake */}
                <td className="whitespace-nowrap px-4 py-3 text-white font-semibold tabular-nums">
                  {player.stake}
                  <span className="ml-1 text-xs text-[#6C7285]">ETB</span>
                </td>

                {/* Cards */}
                <td className="whitespace-nowrap px-4 py-3 text-white font-semibold tabular-nums">
                  {player.cards}
                </td>

                {/* Total Bet */}
                <td className="whitespace-nowrap px-4 py-3 text-white tabular-nums">
                  <span className="font-semibold">{player.totalBet}</span>
                  <span className="ml-1 text-xs text-[#6C7285]">ETB</span>
                </td>
              </tr>
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-[#6C7285]">
                  No players found.
                </td>
              </tr>
            )}

            {/* Human Contribution footer row */}
            {players.length > 0 && (
              <tr className="bg-[#2F7EFF]/5 border-t border-[#29345E]">
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6C7285]">
                  Human Contribution
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="text-base font-bold text-[#FFC83D]">
                    {humanContribution} ETB
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {players.length > 0 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          from={from}
          to={to}
          total={players.length}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
