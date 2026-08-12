"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Phone,
  Wallet,
  Calendar,
  Banknote,
  Gamepad2,
  RotateCcw,
  Search,
  Check,
  X,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api/client";
import GameAnalysisModal from "./GameAnalysisModal";

interface PlayerDetailClientProps {
  playerId: number;
}

export default function PlayerDetailClient({ playerId }: PlayerDetailClientProps) {
  const [player, setPlayer] = useState<any>(null);
  const [telegramPhoto, setTelegramPhoto] = useState<string | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Game History State
  const [games, setGames] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);

  // Filter State
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [winStatus, setWinStatus] = useState("all");

  // Deposit Modal State
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositMsg, setDepositMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Game Analysis Modal State
  const [analysisGameId, setAnalysisGameId] = useState<number | null>(null);

  // 1. Fetch Player Details
  const fetchPlayer = useCallback(async () => {
    setPlayerLoading(true);
    setPlayerError(null);
    try {
      const res = await api.getPlayer(playerId);
      if (res.success && res.data) {
        setPlayer(res.data);
      } else {
        setPlayerError(res.message || "Player not found");
      }
    } catch (err: any) {
      setPlayerError(err.message || "Failed to load player details");
    } finally {
      setPlayerLoading(false);
    }
  }, [playerId]);

  // 2. Fetch Telegram Photo
  const fetchPhoto = useCallback(async () => {
    try {
      const res = await api.getPlayerTelegramPhoto(playerId);
      if (res.success && res.photoUrl) {
        setTelegramPhoto(res.photoUrl);
      }
    } catch {
      // Photo fetch error ignored, fallback avatar used
    }
  }, [playerId]);

  // 3. Fetch Game History
  const fetchGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string; winStatus?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (winStatus !== "all") params.winStatus = winStatus;

      const res = await api.getPlayerGames(playerId, params);
      if (res.success && res.data) {
        setGames(res.data);
      }
    } catch (err) {
      console.error("Error loading player games:", err);
    } finally {
      setGamesLoading(false);
    }
  }, [playerId, dateFrom, dateTo, winStatus]);

  useEffect(() => {
    fetchPlayer();
    fetchPhoto();
  }, [fetchPlayer, fetchPhoto]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Handle Deposit / Balance Update
  async function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    const addVal = parseFloat(depositAmount);
    if (isNaN(addVal) || addVal <= 0) {
      setDepositMsg({ text: "Please enter a valid positive deposit amount", type: "error" });
      return;
    }

    setDepositSaving(true);
    setDepositMsg(null);
    try {
      const newBalance = player.balance + addVal;
      await api.updatePlayerBalance(player.id, { balance: newBalance });
      setPlayer((prev: any) => (prev ? { ...prev, balance: newBalance } : prev));
      setDepositMsg({ text: `Successfully deposited ${addVal.toFixed(2)} ETB!`, type: "success" });
      setDepositAmount("");
      setTimeout(() => {
        setDepositOpen(false);
        setDepositMsg(null);
      }, 1500);
    } catch (err: any) {
      setDepositMsg({ text: err.response?.data?.message || "Deposit failed", type: "error" });
    } finally {
      setDepositSaving(false);
    }
  }

  function formatDate(d?: string | Date) {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  }

  function formatTime(d?: string | Date) {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  function formatDateTime(d?: string | Date) {
    if (!d) return "—";
    const date = new Date(d);
    return `${date.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
  }

  if (playerLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2F7EFF]" />
      </div>
    );
  }

  if (playerError || !player) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-red-600">Player Not Found</h2>
        <p className="text-gray-500">{playerError || "Invalid player ID."}</p>
        <Link href="/players" className="inline-flex items-center gap-2 text-sm text-[#2F7EFF] font-semibold">
          <ArrowLeft size={16} /> Back to Players
        </Link>
      </div>
    );
  }

  const fullName = `${player.firstName || ""} ${player.lastName || ""}`.trim();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* ── Breadcrumb Navigation ── */}
      <div className="flex items-center gap-2 text-xs font-semibold text-[#6C7285]">
        <Link href="/" className="hover:text-gray-700 dark:hover:text-gray-300">Dashboard</Link>
        <span>&gt;</span>
        <Link href="/players" className="hover:text-gray-700 dark:hover:text-gray-300">Players</Link>
        <span>&gt;</span>
        <span className="text-[#B9C0D3]">{fullName}</span>
        <span>&gt;</span>
        <span className="text-[#2F7EFF]">Game Check</span>
      </div>

      {/* ── Player Header Profile Banner (Matching Image 2) ── */}
      <div className="rounded-2xl border border-[#29345E] bg-[#0B0F26] overflow-hidden shadow-sm">
        
        {/* Pink Banner Top */}
        <div className="relative h-28 bg-gradient-to-r from-[#2F7EFF] via-[#F44336] to-[#2F7EFF] flex items-center justify-center">
          {/* Circular Profile Avatar overlapping banner */}
          <div className="absolute -bottom-8 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white dark:border-gray-950 bg-[#0B0F26] border border-[#29345E] shadow-md overflow-hidden">
            {telegramPhoto ? (
              <img src={telegramPhoto} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-[#2F7EFF]">
                {player.firstName ? player.firstName.charAt(0) : "P"}
              </span>
            )}
          </div>
        </div>

        {/* Profile Info Row below Avatar */}
        <div className="pt-10 pb-6 px-6 text-center space-y-1">
          <h1 className="text-xl font-extrabold text-white">{fullName}</h1>
          <p className="text-xs text-[#6C7285] font-mono">
            {player.username ? `@${player.username}` : `@`}
          </p>

          {/* Quick Metrics Bar (Phone, Balance, Joined, Deposit, Check) */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-6 sm:gap-12 border-t border-[#29345E]/50 mt-6">
            
            {/* Phone Number */}
            <div className="flex items-center gap-2 text-left">
              <Phone size={16} className="text-gray-400" />
              <div>
                <p className="text-[11px] font-semibold text-[#6C7285]">Phone Number</p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {player.phoneNumber || "—"}
                </p>
              </div>
            </div>

            {/* Wallet Balance */}
            <div className="flex items-center gap-2 text-left">
              <Wallet size={16} className="text-gray-400" />
              <div>
                <p className="text-[11px] font-semibold text-[#6C7285]">Wallet Balance</p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {(player.balance || 0).toFixed(2)} ETB
                </p>
              </div>
            </div>

            {/* Joined Date */}
            <div className="flex items-center gap-2 text-left">
              <Calendar size={16} className="text-gray-400" />
              <div>
                <p className="text-[11px] font-semibold text-[#6C7285]">Joined Date</p>
                <p className="text-sm font-bold text-white">
                  {formatDate(player.registeredAt)}
                </p>
              </div>
            </div>

            {/* Deposit Action Button */}
            <div className="flex items-center gap-2 text-left">
              <div className="flex flex-col">
                <p className="text-[11px] font-semibold text-[#6C7285] mb-1 flex items-center gap-1">
                  <Banknote size={13} /> Deposit
                </p>
                <button
                  onClick={() => setDepositOpen(true)}
                  title="Deposit funds"
                  className="flex h-8 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors shadow-sm"
                >
                  <Banknote size={15} />
                </button>
              </div>
            </div>

            {/* Check Game Action */}
            <div className="flex items-center gap-2 text-left">
              <div className="flex flex-col">
                <p className="text-[11px] font-semibold text-[#6C7285] mb-1 flex items-center gap-1">
                  <Check size={13} /> Check
                </p>
                <button
                  onClick={() => {
                    if (games.length > 0) setAnalysisGameId(games[0].gameId);
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#2F7EFF] hover:underline"
                >
                  <Gamepad2 size={15} /> Check Game
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Filter History Section (Matching Image 2) ── */}
      <div className="rounded-2xl border border-[#29345E] bg-[#0B0F26] p-6 space-y-4 shadow-sm">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Search size={16} /> Filter History
        </h3>

        <div className="flex flex-wrap items-end gap-4">
          
          {/* Date Range Inputs */}
          <div>
            <label className="block text-xs font-semibold text-[#6C7285] mb-1">
              Date Range From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[#2F7EFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6C7285] mb-1">
              Date Range To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[#2F7EFF]"
            />
          </div>

          {/* Win Status Select */}
          <div>
            <label className="block text-xs font-semibold text-[#6C7285] mb-1">
              Win Status
            </label>
            <select
              value={winStatus}
              onChange={(e) => setWinStatus(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[#2F7EFF]"
            >
              <option value="all">All</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
            </select>
          </div>

          {/* Apply Filters Button */}
          <button
            onClick={fetchGames}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-xs font-bold text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors shadow-sm"
          >
            <RotateCcw size={14} /> Apply Filters
          </button>

        </div>
      </div>

      {/* ── Game History Table (Matching Image 2) ── */}
      <div className="rounded-2xl border border-[#29345E] bg-[#0B0F26] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#29345E]/50 bg-gray-50/50 dark:bg-gray-900/50 text-[#6C7285] font-semibold uppercase tracking-wider">
                <th className="px-5 py-3.5">Start</th>
                <th className="px-5 py-3.5">End</th>
                <th className="px-5 py-3.5">Cards</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Result</th>
                <th className="px-5 py-3.5">Bet</th>
                <th className="px-5 py-3.5">Players</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {gamesLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 w-16 bg-[#0B0F26] border border-[#29345E] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : games.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    No games found matching your filters.
                  </td>
                </tr>
              ) : (
                games.map((g) => (
                  <tr key={g.sessionId || g.gameId} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/40 transition-colors">
                    {/* Start Time */}
                    <td className="px-5 py-4 font-medium text-white whitespace-nowrap">
                      {formatDateTime(g.startTime)}
                    </td>

                    {/* End Time */}
                    <td className="px-5 py-4 text-[#B9C0D3] whitespace-nowrap">
                      {formatDateTime(g.endTime)}
                    </td>

                    {/* Cards Played (Orange Chips) */}
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1 items-center">
                        {(g.cardsPlayed || []).map((cardNum: number) => (
                          <span
                            key={cardNum}
                            className="rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-extrabold px-2 py-0.5 text-[11px]"
                          >
                            {cardNum}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {g.status === "completed" ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-500 text-white font-extrabold text-[10px] px-2.5 py-0.5">
                          Completed
                        </span>
                      ) : g.status === "in_progress" || g.status === "waiting" ? (
                        <span className="inline-flex items-center rounded-md border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300 font-bold text-[10px] px-2.5 py-0.5">
                          Counting Down
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-gray-200 text-gray-700 font-bold text-[10px] px-2.5 py-0.5">
                          {g.status}
                        </span>
                      )}
                    </td>

                    {/* Result Badge */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {g.result === "win" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-[11px] px-2.5 py-0.5">
                          <Check size={12} /> Win
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-extrabold text-[11px] px-2.5 py-0.5">
                          <X size={12} /> Loss
                        </span>
                      )}
                    </td>

                    {/* Bet Amount */}
                    <td className="px-5 py-4 font-semibold text-white tabular-nums">
                      {g.bet}
                    </td>

                    {/* Total Players */}
                    <td className="px-5 py-4 text-[#B9C0D3] tabular-nums font-medium">
                      {g.totalPlayers}
                    </td>

                    {/* Action: Check Button */}
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setAnalysisGameId(g.gameId)}
                        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-bold text-[#B9C0D3] hover:hover:bg-[#29345E]/60 transition-colors shadow-sm"
                      >
                        <RotateCcw size={13} /> Check
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Deposit Quick-Action Modal ── */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#29345E] bg-[#171D3D] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#29345E]/50 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Banknote className="text-[#2F7EFF]" size={18} /> Quick Deposit for {player.firstName}
              </h3>
              <button onClick={() => setDepositOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {depositMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  depositMsg.type === "success"
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border border-green-200"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200"
                }`}
              >
                {depositMsg.text}
              </div>
            )}

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Current Balance</label>
                <p className="text-lg font-bold text-white">
                  {(player.balance || 0).toFixed(2)} ETB
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Deposit Amount (ETB)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 100"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-[#171D3D] px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#2F7EFF]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositOpen(false)}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={depositSaving}
                  className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] text-white px-5 py-2 text-xs font-bold hover:bg-[#D81B60] disabled:opacity-50"
                >
                  {depositSaving && <Loader2 size={14} className="animate-spin" />}
                  Confirm Deposit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Game Analysis Modal ── */}
      {analysisGameId !== null && (
        <GameAnalysisModal
          gameId={analysisGameId}
          targetPlayerId={playerId}
          onClose={() => setAnalysisGameId(null)}
        />
      )}

    </div>
  );
}

