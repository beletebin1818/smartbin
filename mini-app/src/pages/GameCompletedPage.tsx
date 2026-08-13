/**
 * GameCompletedPage — Winner announcement, styled to match the reference design.
 *
 * UI rules (matching reference image):
 *  · No stats header bar
 *  · All winning-line cells  → deep navy #1E3A8A  (white text)
 *  · Drawn, not winning      → light gray #F1F5F9  (slate text)  — like cell 22 in image
 *  · Unmarked                → white #FFFFFF       (dark text)
 *  · FREE (★) centre         → always deep navy
 *  · Last drawn winning num  → blinks navy ↔ amber via React state (no CSS-animation conflict)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BG_PAGE,
  BG_SURFACE,
  BORDER_LIGHT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_MUTED,
  ACCENT_BLUE,
  ACCENT_AMBER,
  LETTER_COLORS as THEME_LETTER_COLORS,
} from '../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameWinner {
  playerId: number;
  username: string;
  firstName: string;
  prize: number;
  cardNumber: number;
  winPattern: string;
  cardSnapshot: number[];
  cardPrice?: number;
}

interface CompletedState {
  winners?: GameWinner[];
  prize?: number;
  drawnNumbers?: number[];
  totalPlayers?: number;
  totalCards?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
const REDIRECT_SECONDS = 3;

const WIN_COLOR   = '#1E3A8A'; // deep navy — all winning cells
const BLINK_COLOR = '#D97706'; // amber    — blink "off" state

// ─── Win-pattern definitions (column-major indexing, 0–24) ───────────────────

const WIN_PATTERNS: Record<string, number[][]> = {
  row:          [[0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24]],
  column:       [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24]],
  diagonal:     [[0,6,12,18,24],[20,16,12,8,4]],
  fourCorners:  [[0,4,20,24]],
  HORIZONTAL:   [[0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24]],
  VERTICAL:     [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24]],
  DIAGONAL:     [[0,6,12,18,24],[20,16,12,8,4]],
  FOUR_CORNERS: [[0,4,20,24]],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns cell indices of the completed line for a given pattern type. */
function findPatternIndices(
  cardNumbers: number[],
  drawnSet: Set<number>,
  patternType: string,
): number[] {
  const lines = WIN_PATTERNS[patternType];
  if (!lines) return [];
  for (const line of lines) {
    if (line.every((i) => cardNumbers[i] === 0 || drawnSet.has(cardNumbers[i]))) {
      return line;
    }
  }
  return [];
}

/** Most-recently drawn number that sits in any winning-line cell. */
function findLastWinNumber(
  winIndices: number[],
  cardNumbers: number[],
  drawnNumbers: number[],
): number | null {
  const winNums = winIndices.map((i) => cardNumbers[i]).filter((n) => n !== 0);
  for (let i = drawnNumbers.length - 1; i >= 0; i--) {
    if (winNums.includes(drawnNumbers[i])) return drawnNumbers[i];
  }
  return null;
}

// ─── WinningCard ──────────────────────────────────────────────────────────────

interface WinningCardProps {
  numbers: number[];
  drawnSet: Set<number>;
  winPattern: string;
  drawnNumbers: number[];
}

function WinningCard({ numbers, drawnSet, winPattern, drawnNumbers }: WinningCardProps) {
  // React-state blink — avoids CSS-animation vs. inline-style conflict
  const [blinkOn, setBlinkOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlinkOn((b) => !b), 500);
    return () => clearInterval(id);
  }, []);

  const patternTypes = useMemo(
    () => winPattern.split(',').map((p) => p.trim()).filter(Boolean),
    [winPattern],
  );

  // Collect cell indices from ALL patterns (never overwrite, never break early)
  const winningSet = useMemo(() => {
    const s = new Set<number>();
    for (const pt of patternTypes) {
      findPatternIndices(numbers, drawnSet, pt).forEach((i) => s.add(i));
    }
    return s;
  }, [patternTypes, numbers, drawnSet]);

  const allWinIndices = useMemo(() => Array.from(winningSet), [winningSet]);

  const lastWinNum = useMemo(
    () => findLastWinNumber(allWinIndices, numbers, drawnNumbers),
    [allWinIndices, numbers, drawnNumbers],
  );

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 340,
        margin: '0 auto',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1.5px solid #CBD5E1',
        boxShadow: '0 2px 12px rgba(30,58,138,0.10)',
      }}
    >
      {/* BINGO header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
        {LETTERS.map((l) => {
          const c = THEME_LETTER_COLORS[l];
          return (
            <div
              key={l}
              style={{
                backgroundColor: c.bg,
                color: c.text,
                height: 46,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: 1,
              }}
            >
              {l}
            </div>
          );
        })}
      </div>

      {/* 5×5 grid — column-major, index 12 = FREE */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5,1fr)',
          background: BG_SURFACE,
        }}
      >
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const idx     = col * 5 + row;
            const value   = numbers[idx] ?? 0;
            const isFree  = value === 0;
            const isWin   = winningSet.has(idx);
            const isMarked = isFree || drawnSet.has(value);
            const isLast  = !isFree && value === lastWinNum;

            // Colour logic — matches image exactly
            let bg: string;
            let fg: string;

            if (isLast) {
              bg = blinkOn ? WIN_COLOR : BLINK_COLOR;
              fg = '#FFFFFF';
            } else if (isWin) {
              // All winning pattern cells use the same uniform color
              bg = WIN_COLOR;
              fg = '#FFFFFF';
            } else if (isMarked && !isFree) {
              // Drawn but NOT in any winning line — light gray (like cell 22 in image)
              bg = '#F1F5F9';
              fg = '#64748B';
            } else {
              // Unmarked — plain white
              bg = BG_SURFACE;
              fg = TEXT_PRIMARY;
            }

            return (
              <div
                key={`${row}-${col}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 52,
                  fontSize: 15,
                  fontWeight: isWin ? 800 : isMarked ? 500 : 700,
                  backgroundColor: bg,
                  color: fg,
                  border: `1px solid ${BORDER_LIGHT}`,
                  userSelect: 'none',
                }}
              >
                {isFree ? '★' : value}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GameCompletedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as CompletedState;

  const winners      = state.winners ?? [];
  const drawnNumbers = state.drawnNumbers ?? [];
  const drawnSet     = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);

  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (seconds <= 0) {
      try { sessionStorage.setItem('fromCompleted', '1'); } catch {}
      navigate('/lobby', { replace: true, state: { fromCompleted: true } });
    }
  }, [seconds, navigate]);

  const winnersLine =
    winners.length > 0
      ? winners
          .map((w) => `${w.firstName || w.username || 'Player'} (${w.cardNumber})`)
          .join(', ')
      : null;

  const primaryWinner = winners[0];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '20px 16px',
        background: BG_PAGE,
      }}
    >
      {/* White card container */}
      <div
        style={{
          width: '100%',
          maxWidth: 390,
          borderRadius: 18,
          overflow: 'hidden',
          background: BG_SURFACE,
          border: `1px solid ${BORDER_LIGHT}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 18px 28px', textAlign: 'center' }}>

          {/* Title */}
          <h1
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: ACCENT_BLUE,
              margin: 0,
              letterSpacing: '-0.3px',
            }}
          >
            Game Completed
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 6, lineHeight: 1.5 }}>
            New game will start soon, you will be redirected to the lobby.
          </p>

          {/* Winner announcement */}
          <div
            style={{
              marginTop: 16,
              fontSize: 16,
              fontWeight: 800,
              color: TEXT_PRIMARY,
              lineHeight: 1.4,
            }}
          >
            {winnersLine ? (
              <span>{winnersLine} has won the game.</span>
            ) : (
              <span style={{ color: TEXT_MUTED }}>No winner this round.</span>
            )}
          </div>

          {/* Winning card */}
          {primaryWinner?.cardSnapshot?.length === 25 && (
            <div style={{ marginTop: 16 }}>
              <WinningCard
                numbers={primaryWinner.cardSnapshot}
                drawnSet={drawnSet}
                winPattern={primaryWinner.winPattern}
                drawnNumbers={drawnNumbers}
              />
            </div>
          )}

          {/* Redirect countdown */}
          <p style={{ marginTop: 18, fontSize: 14, color: TEXT_MUTED }}>
            Redirecting to the Lobby in{' '}
            <strong style={{ color: TEXT_PRIMARY }}>{seconds}</strong>{' '}
            second{seconds === 1 ? '' : 's'}...
          </p>

          {/* Manual redirect */}
          <button
            onClick={() => navigate('/lobby', { replace: true })}
            style={{
              marginTop: 12,
              padding: '10px 32px',
              borderRadius: 10,
              border: 'none',
              background: ACCENT_BLUE,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Go to Lobby Now
          </button>
        </div>
      </div>
    </div>
  );
}
