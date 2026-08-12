/**
 * Shared live-game layout — Smart Bingo professional light theme.
 *
 * Task 3: BingoBoard uses flex-1 + gridTemplateRows:'repeat(15,1fr)' so all
 *         75 numbers scale to fit the available height — no scrolling required.
 *
 * Task 4: Player-cards container uses CSS Container Queries (containerType:'size')
 *         so gridAutoRows:'calc((100cqh - 12px) / 3)' sizes each card so exactly
 *         3 fit without scrolling; a 4th card creates an overflow scroll.
 */

import React from 'react';
import {
  BG_PAGE,
  BG_SURFACE,
  BG_SURFACE_2,
  BORDER_LIGHT,
  BORDER_MEDIUM,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  TEXT_ON_DARK,
  ACCENT_BLUE,
  ACCENT_AMBER,
  LETTER_COLORS,
  BOARD_BG,
  BOARD_PANEL_BG,
  BOARD_CELL_BG,
  BOARD_CELL_OUT,
} from '../lib/theme';

export const LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
export type Letter = (typeof LETTERS)[number];

// Re-export LETTER_COLORS from theme so GamePage can still import it from here
export { LETTER_COLORS };

export function letterFor(n: number): Letter {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

export function formatEtb(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-1 py-2.5 text-center min-w-0 rounded-xl"
      style={{
        background: `linear-gradient(145deg, ${BG_SURFACE} 0%, ${BG_SURFACE_2} 100%)`,
        border: `1px solid ${BORDER_LIGHT}`,
        boxShadow: '0 0 20px rgba(124,109,255,0.10), 0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <span
        className="mb-1 text-[10px] leading-tight truncate w-full"
        style={{ color: TEXT_MUTED }}
      >
        {label}
      </span>
      <span
        className="text-xs font-bold leading-none"
        style={{ color: valueColor ?? TEXT_PRIMARY }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Bingo board ───────────────────────────────────────────────────────────────
// Task 3: the outer div is flex-1/min-h-0 (sized by parent flex).
// The number grid uses gridTemplateRows:'repeat(15,1fr)' + height:'100%'
// so all 75 circles scale proportionally to fill the space — zero scroll.

export function BingoBoard({ drawnSet }: { drawnSet: Set<number> }) {
  return (
    <div
      className="rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${BOARD_BG} 0%, #0C1025 100%)`,
        border: `1px solid ${BORDER_LIGHT}`,
        boxShadow: '0 0 30px rgba(124,109,255,0.15), 0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      {/* BINGO letter header row — bright colored circles */}
      <div className="grid grid-cols-5 gap-1.5 px-2 pt-2 pb-1 shrink-0">
        {LETTERS.map((l) => {
          const c = LETTER_COLORS[l];
          return (
            <div
              key={l}
              className="flex items-center justify-center rounded-full font-extrabold"
              style={{
                backgroundColor: c.bg,
                color: c.text,
                fontSize: 12,
                letterSpacing: 1,
                boxShadow: `0 0 14px ${c.glow}, 0 2px 6px rgba(0,0,0,0.4)`,
                width: 24,
                height: 24,
              }}
            >
              {l}
            </div>
          );
        })}
      </div>

      {/* Number grid — 5 columns × 15 rows, fills remaining height */}
      <div
        className="flex-1 grid grid-cols-5 gap-1.5 px-2 pb-2 min-h-0"
        style={{ gridTemplateRows: 'repeat(15, 1fr)' }}
      >
        {Array.from({ length: 15 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const num = col * 15 + row + 1;
            const called = drawnSet.has(num);
            const letter = letterFor(num) as keyof typeof LETTER_COLORS;
            const palette = LETTER_COLORS[letter];
            return (
              <div key={num} className="flex items-center justify-center">
                <span
                  className={`
                    flex items-center justify-center rounded-lg font-bold transition-all duration-300
                    ${called ? 'scale-100' : 'scale-95 hover:scale-100'}
                  `}
                  style={{
                    width: '100%',
                    height: '100%',
                    fontSize: 10,
                    backgroundColor: called ? palette.bg : BOARD_CELL_BG,
                    color: called ? palette.text : TEXT_SECONDARY,
                    border: called
                      ? `1px solid ${palette.border}`
                      : `1px solid ${BORDER_LIGHT}`,
                    boxShadow: called
                      ? `0 0 10px ${palette.glow}, 0 2px 6px rgba(0,0,0,0.4)`
                      : 'none',
                  }}
                >
                  {num}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Ball panel ────────────────────────────────────────────────────────────────

export function BallPanel({
  current,
  recent,
}: {
  current: number | null;
  recent?: number[];
}) {
  const letter = current ? letterFor(current) : null;
  const ballColor = letter ? LETTER_COLORS[letter].bg : '#E2E8F0';
  const ballBorder = letter ? LETTER_COLORS[letter].border : BORDER_LIGHT;
  const ballGlow = letter ? LETTER_COLORS[letter].glow : 'transparent';

  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center py-3 px-4 mb-2 shrink-0"
      style={{
        background: `linear-gradient(145deg, ${BOARD_PANEL_BG} 0%, #0C1025 100%)`,
        border: `1px solid ${BORDER_LIGHT}`,
        boxShadow: '0 0 24px rgba(124,109,255,0.12), 0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      {current && letter ? (
        <div
          className="flex items-center justify-center rounded-full font-extrabold mb-3"
          style={{
            width: 72,
            height: 72,
            backgroundColor: ballColor,
            color: TEXT_ON_DARK,
            fontSize: 20,
            border: `4px solid ${ACCENT_AMBER}`,
            boxShadow: `0 0 36px ${ballGlow}, 0 0 14px ${ballGlow}, 0 4px 20px rgba(0,0,0,0.5)`,
            letterSpacing: 1,
          }}
        >
          {letter}{current}
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded-full font-bold mb-3"
          style={{
            width: 72,
            height: 72,
            border: `3px solid ${BORDER_MEDIUM}`,
            fontSize: 18,
            color: TEXT_MUTED,
            background: BOARD_CELL_BG,
          }}
        >
          —
        </div>
      )}

      {/* Recent calls */}
      {recent && recent.length > 0 && (
        <div className="flex gap-2">
          {recent.slice(0, 3).map((num) => {
            const l = letterFor(num);
            const c = LETTER_COLORS[l];
            return (
              <div
                key={num}
                className="flex items-center justify-center rounded-full font-extrabold"
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: c.bg,
                  color: c.text,
                  fontSize: 11,
                  border: `2px solid ${c.border}`,
                  boxShadow: `0 0 14px ${c.glow}, 0 2px 6px rgba(0,0,0,0.4)`,
                }}
              >
                {l}{num}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export interface GameLiveViewProps {
  playerCount: number;
  cardPrice: number | string;
  prize: number;
  drawnCount: number;
  drawnSet: Set<number>;
  currentNumber: number | null;
  recent: number[];
  waitingMessage?: string;
  statusLabel?: React.ReactNode;
  footer?: boolean;
  children?: React.ReactNode;
  totalPlayerCount?: number;
  totalCards?: number;
  isWaiting?: boolean; // Add flag to distinguish waiting vs playing screen
}

export default function GameLiveView({
  playerCount,
  cardPrice,
  prize,
  drawnCount,
  drawnSet,
  currentNumber,
  recent,
  waitingMessage,
  statusLabel,
  footer = true,
  children,
  totalPlayerCount = playerCount,
  totalCards = 0,
  isWaiting = false,
}: GameLiveViewProps) {
  // Stake: use cardPrice prop directly (selected stake from lobby or game's cardPrice)
  const stake = typeof cardPrice === 'number' ? cardPrice : 10;
  
  // Player count for display: use server-calculated value (bot + real player cards - 15)
  // The server already calculates this correctly, so we use it directly
  const displayPlayerCount = playerCount;
  
  // Calculate dynamic prize: (bot + real player cards - 15) * 0.8 * stake
  const calculatedPrize = Math.round(displayPlayerCount * stake * 0.8);

  return (
    // h-screen + overflow-hidden: critical for Task 3 — board never scrolls
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: BG_PAGE, paddingBottom: footer ? 0 : 8 }}
    >
      {/* ── Stats bar — 4 boxes with stake (መደብ) ── */}
      <div className="flex gap-1.5 px-2 pt-3 shrink-0">
        <StatBox
          label="ተጫዋቾች"
          value={displayPlayerCount}
          valueColor={ACCENT_BLUE}
        />
        <StatBox
          label="መደብ"
          value={stake}
          valueColor={ACCENT_AMBER}
        />
        <StatBox
          label="ደራሽ"
          value={formatEtb(calculatedPrize)}
          valueColor={ACCENT_AMBER}
        />
        <StatBox
          label="የተጠራ"
          value={drawnCount}
          valueColor={ACCENT_BLUE}
        />
      </div>

      {/* ── Main split: left board | right cards ── */}
      <div className="flex flex-1 gap-2 px-2 mt-2 min-h-0">

        {/* Left panel: ball + calling board */}
        <div className="w-[42%] shrink-0 flex flex-col min-h-0">
          <BallPanel current={currentNumber} recent={recent} />
          <BingoBoard drawnSet={drawnSet} />
        </div>

        {/* Right panel: status label + player cards */}
        <div className="flex flex-1 flex-col gap-2 min-w-0 min-h-0">
          {waitingMessage ? (
            <div
              className="flex flex-1 items-center justify-center rounded-xl px-3 py-6 text-center"
              style={{
                background: `linear-gradient(145deg, ${BG_SURFACE} 0%, ${BG_SURFACE_2} 100%)`,
                border: `1px solid ${BORDER_LIGHT}`,
                boxShadow: '0 0 20px rgba(124,109,255,0.10), 0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              <p
                className="text-[13px] leading-relaxed font-semibold"
                style={{ color: ACCENT_BLUE }}
              >
                {waitingMessage}
              </p>
            </div>
          ) : (
            <>
              {statusLabel && (
                <div
                  className="rounded-xl py-1.5 text-center shrink-0"
                  style={{
                    background: `linear-gradient(145deg, ${BG_SURFACE} 0%, ${BG_SURFACE_2} 100%)`,
                    border: `1px solid ${BORDER_LIGHT}`,
                    boxShadow: '0 0 16px rgba(124,109,255,0.10)',
                  }}
                >
                  {statusLabel}
                </div>
              )}

              {/* Task 4: container query context + grid with cqh rows so
                  exactly 3 cards fill the space; a 4th triggers scroll */}
              {children && (
                <div
                  className="flex-1 min-h-0 overflow-y-auto"
                  style={{ containerType: 'size' }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gridAutoRows: 'calc((100cqh - 12px) / 3)',
                      gap: '6px',
                    }}
                  >
                    {children}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      {footer && (
        <div className="shrink-0 px-2 py-2">
          <div
            className="rounded-lg py-1.5 text-center text-xs font-semibold"
            style={{
              background: BG_SURFACE_2,
              border: `1px solid ${BORDER_LIGHT}`,
              color: TEXT_MUTED,
            }}
          >
            @smartbingobot
          </div>
        </div>
      )}
    </div>
  );
}
