"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Trophy, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api/client";

interface GameAnalysisModalProps {
  gameId: number;
  targetPlayerId: number;
  onClose: () => void;
}

// ─── Column helpers ────────────────────────────────────────────────────────────

function getBingoColumn(num: number): "B" | "I" | "N" | "G" | "O" {
  if (num <= 15) return "B";
  if (num <= 30) return "I";
  if (num <= 45) return "N";
  if (num <= 60) return "G";
  return "O";
}

/** Tailwind classes for each BINGO column — used on the Full Board, Recent Draws circles */
function getColumnBg(col: "B" | "I" | "N" | "G" | "O"): string {
  switch (col) {
    case "B": return "bg-amber-400";
    case "I": return "bg-sky-400";
    case "N": return "bg-blue-500";
    case "G": return "bg-emerald-500";
    case "O": return "bg-purple-500";
  }
}

function getColumnText(col: "B" | "I" | "N" | "G" | "O"): string {
  switch (col) {
    case "B": return "text-amber-500";
    case "I": return "text-sky-500";
    case "N": return "text-blue-500";
    case "G": return "text-emerald-500";
    case "O": return "text-purple-500";
  }
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

export default function GameAnalysisModal({
  gameId,
  targetPlayerId,
  onClose,
}: GameAnalysisModalProps) {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGame() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getGame(gameId);
        if (res.success && res.data) {
          setGame(res.data);
        } else {
          setError(res.message || "Failed to load game details");
        }
      } catch (err: any) {
        setError(err.message || "Network error fetching game data");
      } finally {
        setLoading(false);
      }
    }
    loadGame();
  }, [gameId]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="rounded-2xl bg-white p-8 flex flex-col items-center gap-3 shadow-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-[#2F7EFF]" />
          <p className="text-sm font-medium text-gray-600">Loading Game Analysis…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !game) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
          <h3 className="text-lg font-bold text-red-600">Error Loading Game</h3>
          <p className="text-sm text-gray-600">{error || "Game data not found."}</p>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Data derivation ────────────────────────────────────────────────────────

  const drawnNumbers: number[] = game.drawnNumbers || [];
  const drawnSet = new Set(drawnNumbers);

  // The clinching number = last drawn number at game completion
  // (the single draw that triggered handleGameWinners to fire)
  const clinchingNumber: number | null =
    drawnNumbers.length > 0 ? drawnNumbers[drawnNumbers.length - 1] : null;

  // Recent draws: last 4 shown small, last 1 shown large
  const recentDraws = drawnNumbers.slice(-4);
  const currentNumber = clinchingNumber;

  // Sessions & player cards
  const sessions: any[] = game.sessions || [];
  const targetSession = sessions.find((s: any) => s.playerId === targetPlayerId);
  const playerCards: any[] = targetSession ? targetSession.cards || [] : [];

  // Winners
  const winners: any[] = game.winners || [];
  const targetWinner = winners.find((w: any) => w.playerId === targetPlayerId);
  const isPlayerWinner = !!targetWinner;

  // Stats row values (real data)
  const totalPlayers = sessions.length;
  const betAmount = game.cardPrice ?? 0;
  const prizePool = game.prize ?? 0;
  const totalDraws = drawnNumbers.length;
  const gameMode: string = game.mode ?? "automatic";

  // Wallet analysis values
  const totalWinners = game.winnerCount || winners.length || 1;
  const calculatedShare = totalWinners > 0 ? prizePool / totalWinners : 0;
  const actualPaidAmount = targetWinner ? targetWinner.prize : 0;
  // Real comparison: paid correctly if amounts match within floating-point tolerance
  const paidCorrectly =
    isPlayerWinner &&
    Math.abs(calculatedShare - actualPaidAmount) < 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <style>{`
        @keyframes clinch-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(249, 115, 22, 0);
          }
        }
        .clinch-cell {
          animation: clinch-pulse 1.8s ease-in-out infinite;
        }
      `}</style>

      <div className="relative w-full max-w-5xl rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden my-6 flex flex-col max-h-[95vh]">

        {/* ── Sticky Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4 bg-white sticky top-0 z-20">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 font-bold text-base">💰</span>
              <h2 className="text-lg font-bold text-gray-900">Game Analysis &amp; Verification</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Detailed breakdown of Game ID:{" "}
              <span className="font-mono text-[#2F7EFF] font-semibold">{game.id}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable Body ────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 1 — Top Stats Row
          ═══════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-5 gap-3">
            {/* Mode */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Mode</p>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-base">{gameMode === "automatic" ? "🤖" : "🕹️"}</span>
                <span className="font-bold text-gray-700 text-sm">
                  {gameMode === "automatic" ? "Auto" : "Manual"}
                </span>
              </div>
            </div>

            {/* Players */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Player</p>
              <p className="font-extrabold text-sky-500 text-lg leading-tight">{totalPlayers}</p>
            </div>

            {/* Bet */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Bet</p>
              <p className="font-extrabold text-blue-500 text-lg leading-tight">{betAmount}</p>
            </div>

            {/* Prize */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Prize</p>
              <p className="font-extrabold text-emerald-500 text-lg leading-tight">{prizePool}</p>
            </div>

            {/* Draws */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Draws</p>
              <p className="font-extrabold text-gray-500 text-lg leading-tight">{totalDraws}</p>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2 — Wallet Change Analysis Panel
          ═══════════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Wallet Change Analysis</h3>
              {isPlayerWinner ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-extrabold text-white uppercase">
                  🏆 WINNER
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-200 px-3 py-1 text-xs font-extrabold text-gray-500 uppercase">
                  Not a Winner
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {/* Total Prize Pool */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-0.5">Total Prize Pool</p>
                <p className="text-xl font-extrabold text-gray-900">{prizePool.toFixed(2)} ETB</p>
              </div>

              {/* Total Winners */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-0.5">Total Winners</p>
                <p className="text-xl font-extrabold text-gray-900">{totalWinners} Player(s)</p>
              </div>

              {/* Calculated Share */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-0.5">Calculated Share</p>
                <p className="text-xl font-extrabold text-gray-900">{calculatedShare.toFixed(2)} ETB</p>
              </div>

              {/* Actual Paid Amount */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-0.5">Actual Paid Amount</p>
                {isPlayerWinner ? (
                  <div>
                    <p className="text-xl font-extrabold text-emerald-600">{actualPaidAmount.toFixed(2)} ETB</p>
                    {paidCorrectly && (
                      <div className="flex items-center gap-1 mt-1 text-emerald-600 text-xs font-semibold">
                        <CheckCircle2 size={13} />
                        <span>Paid Correctly</span>
                      </div>
                    )}
                    {!paidCorrectly && (
                      <div className="flex items-center gap-1 mt-1 text-red-500 text-xs font-semibold">
                        <X size={13} />
                        <span>Amount Mismatch</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xl font-extrabold text-gray-400">0.00 ETB</p>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 3 — Recent Draws + Full Board (left) + Your Cards (right)
          ═══════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">

            {/* Left Column: Recent Draws + Full Board */}
            <div className="md:col-span-5 space-y-5">

              {/* Recent Draws */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
                <h4 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">Recent Draws</h4>

                {currentNumber !== null ? (
                  <div className="flex flex-col items-center gap-3">
                    {/* Big current number */}
                    <div
                      className={`flex h-20 w-20 items-center justify-center rounded-full text-white font-extrabold text-2xl shadow-lg ring-4 ring-white/30 ring-offset-1 ${getColumnBg(getBingoColumn(currentNumber))}`}
                    >
                      {getBingoColumn(currentNumber)}{currentNumber}
                    </div>

                    {/* 3 preceding draws */}
                    {recentDraws.length > 1 && (
                      <div className="flex items-center justify-center gap-2">
                        {recentDraws.slice(0, -1).map((num, i) => {
                          const col = getBingoColumn(num);
                          return (
                            <span
                              key={i}
                              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${getColumnBg(col)}`}
                            >
                              {col}{num}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-4">No numbers drawn yet</p>
                )}
              </div>

              {/* Full Board (1–75 grid) */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-3 text-center uppercase tracking-wider">Full Board</h4>
                <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
                  {/* BINGO header */}
                  <div className="grid grid-cols-5 gap-1 mb-2 text-center text-[11px] font-extrabold">
                    {(["B","I","N","G","O"] as const).map((col) => (
                      <div key={col} className={`${getColumnText(col)}`}>{col}</div>
                    ))}
                  </div>

                  {/* 15 rows × 5 columns */}
                  <div className="space-y-0.5">
                    {Array.from({ length: 15 }).map((_, rowIndex) => (
                      <div key={rowIndex} className="grid grid-cols-5 gap-1 text-center">
                        {(["B","I","N","G","O"] as const).map((col, colIndex) => {
                          // Mapping: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
                          const colOffsets: Record<string, number> = { B: 1, I: 16, N: 31, G: 46, O: 61 };
                          const num = colOffsets[col] + rowIndex;
                          const isDrawn = drawnSet.has(num);
                          return (
                            <div
                              key={colIndex}
                              className={`flex h-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                                isDrawn
                                  ? `${getColumnBg(col)} text-white shadow-sm`
                                  : "text-gray-300"
                              }`}
                            >
                              {num}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Your Cards */}
            <div className="md:col-span-7 space-y-3">
              <h4 className="text-sm font-bold text-gray-900">Your Cards ({playerCards.length})</h4>

              {playerCards.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
                  No cards found for this player in this game.
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 items-start">
                  {playerCards.map((card: any) => (
                    <BingoCardView
                      key={card.id || card.cardNumber}
                      cardNumber={card.cardNumber}
                      numbers={card.numbers}
                      drawnSet={drawnSet}
                      isWinner={card.isWinner}
                      clinchingNumber={card.isWinner ? clinchingNumber : null}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 5 — Game Winners List
          ═══════════════════════════════════════════════════════════════ */}
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold text-gray-900">Game Winners List</h4>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                {totalWinners} Official
              </span>
            </div>

            {winners.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No winners recorded for this game yet.</p>
            ) : (
              <div className="flex flex-wrap gap-6 items-start">
                {winners.map((winner: any) => {
                  const isYou = winner.playerId === targetPlayerId;

                  // Find the winning card object in sessions
                  // winner.cardNumbers is the 25-element grid array (same as card.numbers)
                  let winnerCardObj: any = null;
                  for (const sess of sessions) {
                    const found = (sess.cards || []).find(
                      (cd: any) =>
                        cd.isWinner &&
                        cd.playerId === winner.playerId &&
                        JSON.stringify(cd.numbers) === JSON.stringify(winner.cardNumbers)
                    );
                    if (found) {
                      winnerCardObj = found;
                      break;
                    }
                  }

                  // Fallback: find any winning card for this player
                  if (!winnerCardObj) {
                    for (const sess of sessions) {
                      const found = (sess.cards || []).find(
                        (cd: any) => cd.isWinner && cd.playerId === winner.playerId
                      );
                      if (found) {
                        winnerCardObj = found;
                        break;
                      }
                    }
                  }

                  const displayCardNumber = winnerCardObj?.cardNumber ?? "?";

                  return (
                    <div key={winner.id} className="flex flex-col items-center gap-1.5">
                      {/* Card label row */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-gray-700">#{displayCardNumber}</span>
                        {isYou && (
                          <span className="rounded-md bg-blue-600 text-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                            YOU
                          </span>
                        )}
                      </div>

                      {winnerCardObj ? (
                        <BingoCardView
                          cardNumber={winnerCardObj.cardNumber}
                          numbers={winnerCardObj.numbers}
                          drawnSet={drawnSet}
                          isWinner={true}
                          clinchingNumber={clinchingNumber}
                          compact
                          hideCardHeader
                        />
                      ) : (
                        <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 text-xs font-medium text-gray-500">
                          Card data unavailable
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Sticky Footer ─────────────────────────────────────────────── */}
        <div className="border-t border-gray-100 p-4 bg-gray-50/60 flex justify-end sticky bottom-0 z-20">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            Close Analysis
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Component: Single 5x5 Bingo Card ─────────────────────────────────────────

interface BingoCardViewProps {
  cardNumber: number;
  numbers: number[];
  drawnSet: Set<number>;
  isWinner?: boolean;
  clinchingNumber?: number | null;
  compact?: boolean;
  hideCardHeader?: boolean;
}

function BingoCardView({
  cardNumber,
  numbers,
  drawnSet,
  isWinner,
  clinchingNumber,
  compact,
  hideCardHeader,
}: BingoCardViewProps) {
  // Ensure 25 cells
  const grid = Array.isArray(numbers) && numbers.length === 25 ? numbers : Array(25).fill(0);

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Card number badge at top — hidden in winners list (label shown outside) */}
      {!hideCardHeader && (
        <div
          className={`rounded-t-lg px-4 py-1 text-white font-extrabold text-xs shadow-sm ${
            isWinner ? "bg-amber-500" : "bg-slate-600"
          }`}
        >
          {cardNumber}
        </div>
      )}

      {/* 5×5 Grid Box */}
      <div
        className={`rounded-xl p-1.5 bg-[#1E293B] text-white shadow-md border-2 transition-all ${
          isWinner ? "border-amber-400 ring-2 ring-amber-400/30" : "border-slate-700"
        } ${compact ? "w-44" : "w-48"}`}
      >
        {/* B I N G O Header */}
        <div className="grid grid-cols-5 gap-0.5 text-center font-black text-amber-400 text-[11px] mb-1">
          <div>B</div>
          <div>I</div>
          <div>N</div>
          <div>G</div>
          <div>O</div>
        </div>

        {/* Cells */}
        <div className="grid grid-cols-5 gap-0.5 text-center">
          {grid.map((num, idx) => {
            const isCenter = idx === 12;
            const isMatched = isCenter || (num > 0 && drawnSet.has(num));
            // Clinching cell: only on winning cards, only the exact clinching number
            const isClinching =
              isWinner &&
              clinchingNumber !== null &&
              clinchingNumber !== undefined &&
              !isCenter &&
              num === clinchingNumber;

            return (
              <div
                key={idx}
                className={`flex h-7 items-center justify-center rounded-md font-bold text-[11px] transition-all ${
                  isCenter
                    ? "bg-emerald-600 text-white"
                    : isClinching
                    ? "bg-orange-500 text-white clinch-cell"
                    : isMatched
                    ? "bg-emerald-600 text-white"
                    : "bg-[#0F172A] text-slate-300"
                }`}
              >
                {isCenter ? "Free" : num || ""}
              </div>
            );
          })}
        </div>
      </div>

      {/* Winner label below card */}
      {isWinner && !hideCardHeader && (
        <div className="flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-3 py-0.5 text-[11px] font-extrabold mt-0.5">
          <Trophy size={12} className="text-amber-500" />
          <span>Winning Card</span>
        </div>
      )}
    </div>
  );
}

