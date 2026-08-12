/**
 * GamePage — Smart Bingo Mini App (live draw screen)
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLaunchParams } from '../lib/telegram';
import { socket, connectAsPlayer, joinGameRoom, leaveGameRoom } from '../lib/socket';
import { gamesApi, cardsApi, playerApi, type Game, type LobbyCard } from '../api/client';
import GameLiveView, { LETTERS, LETTER_COLORS, letterFor } from '../components/GameLiveView';
import LoadingScreen from './LoadingScreen';
import {
  BG_SURFACE,
  BORDER_LIGHT,
  TEXT_ON_DARK,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  ACCENT_BLUE,
  ACCENT_AMBER,
  BG_SURFACE_2,
} from '../lib/theme';

// Win patterns (column-major indexing, 0-24)
const WIN_PATTERNS = {
  row: [
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24]
  ],
  column: [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24]
  ],
  diagonal: [
    [0, 6, 12, 18, 24],
    [20, 16, 12, 8, 4]
  ],
  fourCorners: [
    [0, 4, 20, 24]
  ],
  HORIZONTAL: [
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24]
  ],
  VERTICAL: [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24]
  ],
  DIAGONAL: [
    [0, 6, 12, 18, 24],
    [20, 16, 12, 8, 4]
  ],
  FOUR_CORNERS: [
    [0, 4, 20, 24]
  ]
};

/** Uniform deep navy color used for all winning pattern cells and patterns. */
const PATTERN_BG: [string, string, string] = ['#1E3A8A', '#1E3A8A', '#1E3A8A'];
const BLINK_ALT = '#D97706'; // amber — the blink "off" colour

const PATTERN_LABEL_MAP: Record<string, string> = {
  row: 'Horizontal Row', column: 'Vertical Column',
  diagonal: 'Diagonal', fourCorners: 'Four Corners',
  HORIZONTAL: 'Horizontal Row', VERTICAL: 'Vertical Column',
  DIAGONAL: 'Diagonal', FOUR_CORNERS: 'Four Corners',
};

/** Returns the exact cell-indices of the first complete line for a pattern key. */
function resolvePatternIndices(
  snapshot: number[],
  drawnNumbers: number[],
  patternKey: string,
): number[] {
  const lines = WIN_PATTERNS[patternKey as keyof typeof WIN_PATTERNS];
  if (!lines) return [];
  const drawnSet = new Set(drawnNumbers);
  for (const line of lines) {
    if (line.every((i) => snapshot[i] === 0 || drawnSet.has(snapshot[i]))) {
      return line;
    }
  }
  return [];
}

interface WinningCardMiniProps {
  snapshot: number[];
  drawnNumbers: number[];
  winPattern: string;
}

/** Self-contained winning-card renderer used inside the completed overlay. */
function WinningCardMini({ snapshot, drawnNumbers, winPattern }: WinningCardMiniProps) {
  // React-state blink (avoids CSS-animation vs. inline-style conflict)
  const [blinkOn, setBlinkOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlinkOn((b) => !b), 500);
    return () => clearInterval(id);
  }, []);

  const patternTypes = useMemo(
    () => winPattern.split(',').map((p) => p.trim()).filter(Boolean),
    [winPattern],
  );

  // One Set<index> per pattern — accumulate ALL, never overwrite
  const patternSets = useMemo(
    () => patternTypes.map((pt) => new Set(resolvePatternIndices(snapshot, drawnNumbers, pt))),
    [patternTypes, snapshot, drawnNumbers],
  );

  const allWinningIndices = useMemo(() => {
    const all: number[] = [];
    patternSets.forEach((s) => s.forEach((i) => all.push(i)));
    return all;
  }, [patternSets]);

  // Last drawn number that sits in any winning line
  const lastWinNum = useMemo(() => {
    const winNums = allWinningIndices.map((i) => snapshot[i]).filter((n) => n !== 0);
    for (let i = drawnNumbers.length - 1; i >= 0; i--) {
      if (winNums.includes(drawnNumbers[i])) return drawnNumbers[i];
    }
    return null;
  }, [allWinningIndices, snapshot, drawnNumbers]);

  const drawnSet = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);

  const cellPatternIndex = (cellIdx: number): number => {
    const hits = patternSets.reduce<number[]>((acc, s, pi) => {
      if (s.has(cellIdx)) acc.push(pi);
      return acc;
    }, []);
    if (hits.length === 0) return -1;
    if (hits.length > 1)   return 2;
    return hits[0];
  };

  return (
    <div
      style={{
        width: '100%', maxWidth: 300, margin: '0 auto',
        borderRadius: 14, overflow: 'hidden',
        border: `3px solid ${BLINK_ALT}`,
        boxShadow: '0 6px 28px rgba(30,58,138,0.22)',
        background: '#FFFFFF',
      }}
    >
      {/* BINGO header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
        {LETTERS.map((l) => {
          const c = LETTER_COLORS[l];
          return (
            <div key={l} style={{
              backgroundColor: c.bg, color: c.text,
              height: 34, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 900, fontSize: 14,
            }}>
              {l}
            </div>
          );
        })}
      </div>

      {/* 5×5 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', background: '#FFFFFF' }}>
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const idx    = col * 5 + row;
            const value  = snapshot[idx] ?? 0;
            const isFree = value === 0;
            const isMarked = isFree || drawnSet.has(value);
            const pIdx = cellPatternIndex(idx);
            const isWinning = pIdx >= 0;
            const isLastWin = !isFree && value === lastWinNum;

            let bg: string;
            let fg: string;

            if (isLastWin) {
              // Blink between the pattern colour and amber to draw attention
              bg = blinkOn ? '#1E3A8A' : BLINK_ALT;
              fg = '#FFFFFF';
            } else if (isWinning) {
              // All winning pattern cells use the same uniform color
              bg = '#1E3A8A';
              fg = '#FFFFFF';
            } else {
              // All other cells (called or uncalled, non-winning): clean white
              bg = '#FFFFFF'; fg = '#1E293B';
            }

            return (
              <div key={`${row}-${col}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 44, fontSize: 13,
                fontWeight: isWinning ? 800 : 600,
                backgroundColor: bg, color: fg,
                border: `1px solid ${BORDER_LIGHT}`,
              }}>
                {isFree ? '★' : value}
              </div>
            );
          })
        )}
      </div>

      {/* Pattern legend */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 10, padding: '6px 8px',
        background: '#F8FAFC', borderTop: `1px solid ${BORDER_LIGHT}`, flexWrap: 'wrap',
      }}>
        {patternTypes.map((pt, i) => (
          <div key={pt} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: PATTERN_BG[i] ?? PATTERN_BG[0] }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#475569' }}>
              {PATTERN_LABEL_MAP[pt] ?? pt}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GameDrawPayload {
  gameId: number;
  number: number;
  drawnNumbers: number[];
  drawIndex: number;
}

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

interface GameCompletedPayload {
  gameId: number;
  winners: GameWinner[];
  prize: number;
  drawnNumbers: number[];
  endedAt: string;
  totalPlayers?: number;
  totalCards?: number;
}

interface GameStatusPayload {
  gameId: number;
  status: string;
  prize?: number;
  message?: string;
}

// Format win pattern string for display
function patternLabel(raw: string) {
  const map: Record<string, string> = {
    row: 'Horizontal Row',
    column: 'Vertical Column',
    diagonal: 'Diagonal',
    fourCorners: 'Four Corners',
    HORIZONTAL: 'Horizontal Row',
    VERTICAL: 'Vertical Column',
    DIAGONAL: 'Diagonal',
    FOUR_CORNERS: 'Four Corners',
    blackout: 'Blackout',
  };
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => map[p] || p)
    .join(' + ');
}

function BingoCard({ card, drawnSet }: { card: LobbyCard; drawnSet: Set<number> }) {
  const numbers = card.numbers ?? [];
  return (
    <div
      className="w-full h-full rounded-xl overflow-hidden flex flex-col p-1.5"
      style={{
        background: `linear-gradient(145deg, ${BG_SURFACE} 0%, ${BG_SURFACE_2} 100%)`,
        border: `1px solid ${BORDER_LIGHT}`,
        boxShadow: '0 0 20px rgba(124,109,255,0.12), 0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      {/* BINGO header */}
      <div className="grid grid-cols-5 gap-1 mb-0.5 shrink-0">
        {LETTERS.map((l) => {
          const c = LETTER_COLORS[l];
          return (
            <div key={l} className="flex justify-center">
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-extrabold"
                style={{ backgroundColor: c.bg, color: c.text, boxShadow: `0 0 10px ${c.glow}, 0 2px 4px rgba(0,0,0,0.4)` }}
              >
                {l}
              </div>
            </div>
          );
        })}
      </div>
      {/* Number grid — flex-1 fills card height, 1fr rows scale evenly */}
      <div
        className="flex-1 grid grid-cols-5 min-h-0"
        style={{ gap: '2px', gridTemplateRows: 'repeat(5, 1fr)' }}
      >
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const index = col * 5 + row;
            const value = numbers[index] ?? 0;
            const isFree = value === 0;
            const marked = isFree || drawnSet.has(value);
            const letter = isFree ? 'N' : (letterFor(value) as keyof typeof LETTER_COLORS);
            const palette = LETTER_COLORS[letter];
            return (
              <div key={`${row}-${col}`} className="flex items-center justify-center">
                <span
                  className="flex items-center justify-center rounded-full font-bold transition-all duration-300"
                  style={{
                    width: '92%',
                    height: '92%',
                    fontSize: isFree ? 8 : 10,
                    backgroundColor: marked ? palette.bg : BG_SURFACE_2,
                    color: marked ? palette.text : TEXT_SECONDARY,
                    border: marked ? `1px solid ${palette.border}` : `1px solid ${BORDER_LIGHT}`,
                    boxShadow: marked ? `0 0 10px ${palette.glow}, 0 2px 6px rgba(0,0,0,0.4)` : 'none',
                  }}
                >
                  {isFree ? '★' : value}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function GamePage() {
  const navigate = useNavigate();
  const { gameId: gameIdParam } = useParams<{ gameId: string }>();
  const gameId = Number(gameIdParam);
  const telegramId = getLaunchParams().telegramId;

  const [playerId, setPlayerId] = useState<number | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [myCards, setMyCards] = useState<LobbyCard[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [totalPlayerCount, setTotalPlayerCount] = useState(0);
  const [totalCards, setTotalCards] = useState(0);
  const [displayPlayerCount, setDisplayPlayerCount] = useState(0);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugErrors, setDebugErrors] = useState<string[]>([]);

  const [showGameCompleted, setShowGameCompleted] = useState(false);
  const [completedWinners, setCompletedWinners] = useState<GameWinner[]>([]);
  const [completedPrize, setCompletedPrize] = useState(0);
  const [completedDrawnNumbers, setCompletedDrawnNumbers] = useState<number[]>([]);
  const [completedCountdown, setCompletedCountdown] = useState(8);

  const joinedRoom = useRef(false);
  const playerIdRef = useRef<number | null>(null);
  
  // Read selected stake from sessionStorage (set in lobby) for display
  const selectedStake = (() => {
    try {
      const stored = sessionStorage.getItem('lobby_stake');
      return stored ? parseInt(stored, 10) : null;
    } catch {
      return null;
    }
  })();

  // Helper to add error to debug display
  const addDebugError = useCallback((error: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugErrors(prev => [`[${timestamp}] ${error}`, ...prev].slice(0, 20)); // Keep last 20 errors
    console.error('❌ [GamePage Debug]', error);
  }, []);

  const drawnSet = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);

  const recent = useMemo(() => {
    const without = currentNumber == null
      ? drawnNumbers
      : drawnNumbers.filter((n) => n !== currentNumber);
    return without.slice(-2).reverse();
  }, [drawnNumbers, currentNumber]);

  useEffect(() => {
    if (!telegramId) return;
    playerApi.getProfile(telegramId).then((res) => {
      if (res.success) {
        setPlayerId(res.data.id);
        playerIdRef.current = res.data.id;
        addDebugError(`Player profile loaded: ID=${res.data.id}, Balance=${res.data.balance}`);
      } else {
        addDebugError(`Player profile API failed: ${JSON.stringify(res)}`);
      }
    }).catch((err) => {
      addDebugError(`Player profile error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [telegramId, addDebugError]);

  const loadGame = useCallback(async () => {
    if (!Number.isFinite(gameId)) {
      addDebugError(`Invalid gameId: ${gameId}`);
      setLoading(false);
      return;
    }
    try {
      addDebugError(`Loading game: ${gameId}`);
      // Use the new public game endpoint to fetch specific game by ID
      const res = await gamesApi.getGame(gameId);

      if (res.success && res.data) {
        const selectedGame = res.data;
        addDebugError(`Using game data: ${selectedGame.id}`);
        setGame(selectedGame);
        setDrawnNumbers(selectedGame.drawnNumbers ?? []);
        setCurrentNumber(selectedGame.currentNumber ?? null);

        // Use server-calculated stats if available
        const serverStats = selectedGame.calculatedStats;

        if (serverStats) {
          // Use server-calculated stats
          // totalPlayers is already calculated as (bot + real player cards - 15) on server
          setPlayerCount(serverStats.totalPlayers);
          setTotalPlayerCount(serverStats.totalPlayersInParens);
          setTotalCards(serverStats.totalCardsInParens);
          setDisplayPlayerCount(serverStats.totalEnrollmentCards ?? Math.max(0, serverStats.totalCardsInParens - 15));
          addDebugError(`Stats set: totalPlayers=${serverStats.totalPlayers}, totalCards=${serverStats.totalCardsInParens}, enrollment=${serverStats.totalEnrollmentCards}`);
        } else {
          addDebugError(`No server stats found, using fallback`);
          // Fallback to client-side calculation
          const sessions = selectedGame.sessions || [];

          // Calculate total cards from all sessions (real + bots) - same as admin
          const allCardCount = sessions.reduce((sum: number, s: any) => sum + (s.cardCount ?? 1), 0);

          // Player count for display: total cards - 15 (real players + bot cards - 15)
          const displayCount = Math.max(0, allCardCount - 15);

          // Count all unique players (real + bots)
          const allUniquePlayers = new Set(sessions.map((s: any) => s.playerId));

          // Filter for real players only
          const realSessions = sessions.filter((session: any) => {
            const player = session?.player;
            if (!player) return false;
            if (player.isBot === false) return true;
            if (player.isBot === undefined || player.isBot === null) {
              return player.username ? true : false;
            }
            return false; // isBot === true
          });

          const uniqueRealPlayers = new Set(realSessions.map((s: any) => s.playerId));

          setPlayerCount(realSessions.length);
          setTotalPlayerCount(allUniquePlayers.size);
          setTotalCards(allCardCount);
          setDisplayPlayerCount(displayCount);

          addDebugError(`Fallback stats: playerCount=${realSessions.length}, displayCount=${displayCount}`);
        }
      } else {
        addDebugError(`Game API failed: ${JSON.stringify(res)}`);
      }
    } catch (err) {
      addDebugError(`Error in loadGame: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setLoading(false); }
  }, [gameId, addDebugError]);

  // Load game data (independent of player ID)
  useEffect(() => { loadGame(); }, [loadGame]);

  // Load cards separately when player ID is available
  useEffect(() => {
    const loadCards = async () => {
      const pid = playerIdRef.current ?? playerId ?? undefined;
      if (pid == null) {
        addDebugError(`Waiting for player ID to load cards...`);
        return;
      }
      if (!Number.isFinite(gameId)) {
        addDebugError(`Invalid gameId for card loading: ${gameId}`);
        return;
      }
      try {
        addDebugError(`Loading cards for player ${pid} in game ${gameId}...`);
        const cardRes = await cardsApi.list(gameId, pid);
        if (cardRes.success) {
          const myCards = cardRes.data.filter((c) => c.isMine);
          addDebugError(`Cards loaded: ${myCards.length} cards → ${myCards.map((c) => c.cardNumber).join(', ') || 'none'}`);
          setMyCards(myCards);
        } else {
          addDebugError(`Card API failed: ${JSON.stringify(cardRes)}`);
        }
      } catch (err) {
        addDebugError(`Error loading cards: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    loadCards();
  }, [playerId, gameId, addDebugError]);

  useEffect(() => {
    if (!Number.isFinite(gameId)) return;
    if (telegramId) connectAsPlayer(telegramId);
    if (!joinedRoom.current) { joinGameRoom(gameId); joinedRoom.current = true; }

    const onDraw = (p: GameDrawPayload) => {
      if (p.gameId !== gameId) return;
      setDrawnNumbers(p.drawnNumbers);
      setCurrentNumber(p.number);
    };
    const onCompleted = (p: GameCompletedPayload) => {
      if (p.gameId !== gameId) return;
      setCompletedWinners(p.winners || []);
      setCompletedPrize(p.prize ?? 0);
      setCompletedDrawnNumbers(p.drawnNumbers || []);
      setShowGameCompleted(true);
      setCompletedCountdown(8);
    };
    const onStatus = (p: GameStatusPayload) => {
      if (p.gameId !== gameId) return;
      if (p.status === 'cancelled') navigate('/lobby');
      if (p.status === 'in_progress') {
        // Wait a bit for playerId to be set, then reload
        setTimeout(() => {
          loadGame();
        }, 500);
      }
    };

    socket.on('game:draw', onDraw);
    socket.on('game:completed', onCompleted);
    socket.on('game:status', onStatus);

    return () => {
      socket.off('game:draw', onDraw);
      socket.off('game:completed', onCompleted);
      socket.off('game:status', onStatus);
      if (joinedRoom.current) { leaveGameRoom(gameId); joinedRoom.current = false; }
    };
  }, [gameId, telegramId, navigate, loadGame]);

  useEffect(() => {
    if (!showGameCompleted) return;
    const tick = setInterval(() => {
      setCompletedCountdown((s) => {
        if (s <= 1) {
          clearInterval(tick);
          try { sessionStorage.setItem('fromCompleted', '1'); } catch {}
          navigate('/lobby', { replace: true });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [showGameCompleted, navigate]);

  if (loading) return <LoadingScreen />;

  const isSpectator = myCards.length === 0;

  return (
    <div className="relative">
            <GameLiveView
        playerCount={displayPlayerCount}
        cardPrice={selectedStake ?? (game?.cardPrice ?? 10)}
        prize={game?.prize ?? 0}
        drawnCount={drawnNumbers.length}
        drawnSet={drawnSet}
        currentNumber={currentNumber}
        recent={recent}
        totalPlayerCount={totalPlayerCount}
        totalCards={totalCards}
        isWaiting={game?.status === 'waiting'} // Pass waiting status
        waitingMessage={
          isSpectator
            ? 'Wait until this game is finished and you will join the next game.'
            : undefined
        }
        statusLabel={
          !isSpectator ? (
            <p className="text-[12px] font-bold tracking-wide" style={{ color: ACCENT_AMBER }}>🤖 Automatic 🤖</p>
          ) : undefined
        }
        footer={isSpectator}
      >
        {!isSpectator &&
          myCards.map((card) => (
            <BingoCard key={card.cardNumber} card={card} drawnSet={drawnSet} />
          ))}
      </GameLiveView>

      {showGameCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
               style={{ background: BG_SURFACE, border: `1px solid ${BORDER_LIGHT}`, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>

            {/* Stats bar hidden from UI — data and state unchanged */}

            <div className="p-5 text-center" style={{ color: TEXT_PRIMARY }}>
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: ACCENT_BLUE }}>
                Game Completed
              </h1>
              <p className="mt-1 text-sm" style={{ color: TEXT_SECONDARY }}>
                New game will start soon, you will be redirected to the lobby.
              </p>

               {/* Winners line */}
               <div className="mt-5 text-base font-bold leading-snug" style={{ color: TEXT_PRIMARY }}>
                 {completedWinners.length > 0 ? (
                   <span>
                     {completedWinners.map((w) => `${w.firstName || w.username || 'Player'} (${w.cardNumber})`).join(', ')} has won the game.
                   </span>
                 ) : (
                   <span style={{ color: TEXT_MUTED }}>No winner this round.</span>
                 )}
               </div>

               {/* Winning pattern + card display */}
               {completedWinners.length > 0 && completedWinners[0].cardSnapshot?.length === 25 && (
                 <div className="mt-4">
                   <WinningCardMini
                     snapshot={completedWinners[0].cardSnapshot}
                     drawnNumbers={completedDrawnNumbers}
                     winPattern={completedWinners[0].winPattern}
                   />
                   <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>
                     Card #{completedWinners[0].cardNumber}
                   </p>
                 </div>
               )}

              {/* Redirect countdown */}
              <p className="mt-6 text-[15px] font-medium" style={{ color: TEXT_MUTED }}>
                Redirecting to the Lobby in {completedCountdown} second{completedCountdown === 1 ? '' : 's'}...
              </p>

              {/* Manual redirect button */}
              <button
                onClick={() => {
                  try { sessionStorage.setItem('fromCompleted', '1'); } catch {}
                  navigate('/lobby', { replace: true });
                }}
                className="mt-4 px-6 py-2.5 rounded-lg text-sm font-bold text-white transition-colors active:scale-95"
                style={{ backgroundColor: ACCENT_BLUE }}
              >
                Go to Lobby Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
