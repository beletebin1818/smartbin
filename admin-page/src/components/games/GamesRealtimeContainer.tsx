"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { LiveEngineStats, DrawnNumbersData, PlayerRow, PreviousGame, PreviousGameStatus, GameStatus } from "@/types";
import { connectAsAdmin } from "@/lib/socket";
import { api } from "@/lib/api/client";
import { LiveEngineCard } from "./LiveEngineStats";
import DrawnNumbers from "./DrawnNumbers";
import PlayersTable from "./PlayersTable";
import PreviousGamesTable from "./PreviousGamesTable";

function mapRoundStatus(raw: string | undefined | null): GameStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "in_progress": return "Active";
    case "completed":   return "Completed";
    case "cancelled":   return "Completed";
    case "waiting":     return "Pending";
    default:            return "Pending";
  }
}

function mapPreviousStatus(raw: string | undefined | null): PreviousGameStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "completed":   return "Completed";
    case "cancelled":   return "Cancelled";
    case "waiting":
    case "in_progress": return "Waiting for Players";
    default:            return "Completed";
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialStats: LiveEngineStats;
  initialDrawn: DrawnNumbersData;
  initialPlayers: PlayerRow[];
  initialPreviousGames: PreviousGame[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GamesRealtimeContainer({
  initialStats,
  initialDrawn,
  initialPlayers,
  initialPreviousGames,
}: Props) {
  const [stats, setStats] = useState<LiveEngineStats>({
    ...initialStats,
    realPlayerCount: initialStats.realPlayerCount ?? 0,
    totalEnrollmentCards: initialStats.totalEnrollmentCards ?? 0,
  });
  const [drawn, setDrawn] = useState<DrawnNumbersData>(initialDrawn);
  const [players, setPlayers] = useState<PlayerRow[]>(initialPlayers);
  const [previousGames, setPreviousGames] = useState<PreviousGame[]>(initialPreviousGames);

  // Debounce guard — prevent re-entrant fetches when many events arrive at once
  const pendingRef = useRef({ live: false, previous: false });

  // ── Fetch live game state ─────────────────────────────────────────────────

  const refreshLiveGame = useCallback(async () => {
    if (pendingRef.current.live) return;
    pendingRef.current.live = true;
    try {
      const res = await api.getLiveGame();
      const game = res?.data ?? null;

      if (!game) {
        // No active game — reset to idle state
        setStats((prev) => ({
          ...prev,
          status: "Pending",
          totalPrizePool: 0,
          totalPlayers: 0,
          totalPlayersInParens: 0,
          totalCards: 0,
          totalCardsInParens: 0,
          realPlayerCount: 0,
          totalEnrollmentCards: 0,
        }));
        setDrawn({ drawn: [], total: 75 });
        setPlayers([]);
        return;
      }

      // ── Update live engine stats ──────────────────────────────────────────
      const liveSessions = Array.isArray(game.sessions) ? game.sessions : [];

      console.log('🔍 [GamesRealtimeContainer] Total liveSessions:', liveSessions.length);
      console.log('🔍 [GamesRealtimeContainer] Server calculatedStats:', game.calculatedStats);

      // Filter for real players only (for players table)
      // Backend may omit `isBot` or `username` fields; treat only explicit isBot === true as bots.
      const isRealPlayer = (p: any) => !(p && p.isBot === true);
      const realSessions = liveSessions.filter((session: any) => {
        const player = session?.player;
        if (!player) return false; // no player info -> ignore
        return isRealPlayer(player);
      });

      // ── Calculate player rows for real players table ──────────────────────
      const playerRows: PlayerRow[] = realSessions.map((session: any) => {
        const p = session.player ?? {};
        const name =
          `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() ||
          `Player #${session.playerId}`;
        const cardCount = session.cardCount ?? 1;
        // Use the player's actual selected stake from the session (session.bet),
        // NOT the game-level cardPrice which may differ from the player's chosen stake.
        const stake = session.bet ?? game.cardPrice ?? 0;
        // Use the session's recorded totalBet if available (stake × cards, maintained by backend);
        // fall back to computing it locally.
        const totalBet =
          session.totalBet != null && session.totalBet > 0
            ? session.totalBet
            : stake * cardCount;
        return {
          id: String(session.playerId),
          name,
          phone: p.phoneNumber ?? "N/A",
          stake,
          cards: cardCount,
          totalBet,
          mode: "Auto" as const,
        };
      });

      const humanContribution = playerRows.reduce((sum, p) => sum + p.totalBet, 0);

      // Use server-calculated stats if available from socket data
      const serverStats = game.calculatedStats;
       
      if (serverStats) {
        console.log('🎯 [GamesRealtimeContainer] Using server-calculated stats:', serverStats);
        setStats({
          status: mapRoundStatus(game.status),
          totalPrizePool: serverStats.humanContribution ?? humanContribution,
          prizePoolCurrency: 'ETB',
          totalPlayers: serverStats.totalPlayers,
          totalPlayersInParens: serverStats.totalPlayersInParens,
          totalCards: serverStats.totalCards,
          totalCardsInParens: serverStats.totalCardsInParens,
          startTime: game.startedAt ?? game.createdAt,
          // Enrollment statistics
          realPlayerCount: serverStats.realPlayerCount,
          totalEnrollmentCards: serverStats.totalEnrollmentCards,
          botCount: serverStats.botCount,
        });
      } else {
        // Fallback to client-side calculation
        console.log('⚠️ [GamesRealtimeContainer] No server stats, using client-side calculation');
        
        // Calculate total cards from all sessions (real + bots)
        const allCardCount = liveSessions.reduce(
          (sum: number, s: any) => sum + (s.cardCount ?? 1),
          0
        );

        // Player count for display: total cards - 15 (real players + bot cards - 15)
        const displayPlayerCount = Math.max(0, allCardCount - 15);

        console.log('🎯 [GamesRealtimeContainer] Total cards:', allCardCount);
        console.log('🎯 [GamesRealtimeContainer] Display player count (cards - 15):', displayPlayerCount);

        // Count all unique players (real + bots)
        const allPlayerCount = liveSessions
          .reduce((unique: Set<string | number>, session: any) => {
            const key = session.playerId ?? session.id ?? session.player?.id;
            if (key != null) unique.add(key);
            return unique;
          }, new Set<string | number>()).size;

         const cardCount = realSessions.reduce(
           (sum: number, s: any) => sum + (s.cardCount ?? 1),
           0
         );

         // Unique real player count (deduplicated by playerId)
         const uniqueRealPlayerCount = liveSessions
           .filter((s: any) => {
             const p = s?.player;
             if (!p) return false;
             return isRealPlayer(p);
           })
           .reduce((unique: Set<string | number>, s: any) => {
             const key = s.playerId ?? s.id ?? s.player?.id;
             if (key != null) unique.add(key);
             return unique;
           }, new Set<string | number>()).size;

          setStats({
            status: mapRoundStatus(game.status),
            totalPrizePool: humanContribution,
            prizePoolCurrency: 'ETB',
            totalPlayers: uniqueRealPlayerCount,
            totalPlayersInParens: allPlayerCount,
           totalCards: cardCount,
           totalCardsInParens: allCardCount,
           startTime: game.startedAt ?? game.createdAt,
           // Enrollment statistics
           realPlayerCount: uniqueRealPlayerCount,
           totalEnrollmentCards: displayPlayerCount,
           botCount: allPlayerCount - uniqueRealPlayerCount,
         });
      }

      // ── Update drawn numbers ──────────────────────────────────────────────
      setDrawn({
        drawn: (game.drawnNumbers ?? []).filter(Boolean),
        total: 75,
      });

      setPlayers(playerRows);
    } catch (err) {
      console.error("[GamesRealtimeContainer] Failed to refresh live game:", err);
    } finally {
      // Short debounce to collapse burst of rapid events
      setTimeout(() => {
        pendingRef.current.live = false;
      }, 400);
    }
  }, []); // Empty deps - no external dependencies

  // ── Fetch previous (completed) games ─────────────────────────────────────

  const refreshPreviousGames = useCallback(async () => {
    if (pendingRef.current.previous) return;
    pendingRef.current.previous = true;
    try {
      const res = await api.getGames({ status: "completed", page: 0, limit: 50 });
      const list: any[] = Array.isArray(res?.data) ? res.data : [];
      const mapped: PreviousGame[] = list.map((g: any) => ({
        id: String(g.id ?? "").padStart(8, "0").toUpperCase(),
        status: mapPreviousStatus(g.status),
        prize: Number(g.prize ?? 0),
        prizeCurrency: "ETB",
        cards: Number(g._count?.sessions ?? g.totalCards ?? 0),
        createdAt: g.createdAt ?? new Date().toISOString(),
      }));
      setPreviousGames(mapped);
    } catch (err) {
      console.error("[GamesRealtimeContainer] Failed to refresh previous games:", err);
    } finally {
      setTimeout(() => {
        pendingRef.current.previous = false;
      }, 400);
    }
  }, []); // Empty deps - no external dependencies

  // Periodic refresh for player count (every 15 seconds) - much better than on every draw
  useEffect(() => {
    const interval = setInterval(() => {
      refreshLiveGame();
    }, 15000); // 15 seconds as requested
    return () => clearInterval(interval);
  }, [refreshLiveGame]);

  // Periodic refresh for previous games (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshPreviousGames();
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [refreshPreviousGames]);

  // ── Socket.io event subscriptions ────────────────────────────────────────

  useEffect(() => {
    const socket = connectAsAdmin();

    // ── game:draw ─ a new number was drawn ───────────────────────────────
    // Payload: { gameId, number, drawnNumbers, drawIndex }
    const onGameDraw = (payload: {
      gameId: number;
      number: number;
      drawnNumbers: number[];
      drawIndex: number;
    }) => {
      // Update drawn numbers immediately from socket payload (zero latency)
      setDrawn({ drawn: payload.drawnNumbers ?? [], total: 75 });
      // Don't refresh live game on every draw - player count doesn't change frequently
      // Player count will be refreshed periodically and on status changes
    };

    // ── lobby:tick ─ lobby countdown ticking ─────────────────────────────
    // Payload: { gameId, secondsLeft }
    // We only need this to keep the status badge accurate in the waiting phase.
    const onLobbyTick = (_payload: { gameId: number; secondsLeft: number }) => {
      // Only update status if we're not already showing Active
      setStats((prev) => {
        if (prev.status !== "Active") {
          return { ...prev, status: "Pending" };
        }
        return prev;
      });
    };

    // ── game:status ─ status changed (cancelled, in_progress) ────────────
    // Payload: { gameId, status, prize?, message? }
    const onGameStatus = (payload: {
      gameId: number;
      status: string;
      prize?: number;
      message?: string;
    }) => {
      setStats((prev) => ({
        ...prev,
        status: mapRoundStatus(payload.status),
        ...(payload.prize !== undefined ? { totalPrizePool: payload.prize } : {}),
      }));
      // Full refresh for accurate player count after status change
      refreshLiveGame();
    };

    // ── game:completed ─ game finished with winners ───────────────────────
    // Payload: { gameId, winners, prize, drawnNumbers, endedAt }
    const onGameCompleted = (payload: {
      gameId: number;
      winners: any[];
      prize?: number;
      drawnNumbers?: number[];
      endedAt?: string;
    }) => {
      setStats((prev) => ({
        ...prev,
        status: "Completed",
        ...(payload.prize !== undefined ? { totalPrizePool: payload.prize } : {}),
      }));
      if (payload.drawnNumbers) {
        setDrawn({ drawn: payload.drawnNumbers, total: 75 });
      }
      // Refresh previous games list now that a game ended
      refreshPreviousGames();
      // Also refresh live widget (will show next waiting game)
      setTimeout(() => refreshLiveGame(), 1500);
    };

    // ── revenue:updated ─ admin_room general update ─────────────────────
    // Payload: { type, gameId, prize? }
    const onRevenueUpdated = (payload: { type: string; gameId?: number }) => {
      if (payload.type === "game_completed") {
        // Game ended — refresh history list and reset live widget after a short delay
        refreshPreviousGames();
        setTimeout(() => refreshLiveGame(), 1500);
      } else if (payload.type === "card_claimed" || payload.type === "card_unclaimed") {
        refreshLiveGame();
      }
    };

    // ── players:updated ─ player joined or left ───────────────────────────
    // Payload: { playerId, action, ... }
    const onPlayersUpdated = (_payload: { playerId: number; action: string }) => {
      refreshLiveGame();
    };

    // Register all listeners
    socket.on("game:draw",      onGameDraw);
    socket.on("lobby:tick",     onLobbyTick);
    socket.on("game:status",    onGameStatus);
    socket.on("game:completed", onGameCompleted);
    socket.on("revenue:updated", onRevenueUpdated);
    socket.on("players:updated", onPlayersUpdated);

    // Initial load if the SSR data is stale (page was cached)
    refreshLiveGame();

    return () => {
      socket.off("game:draw",       onGameDraw);
      socket.off("lobby:tick",      onLobbyTick);
      socket.off("game:status",     onGameStatus);
      socket.off("game:completed",  onGameCompleted);
      socket.off("revenue:updated", onRevenueUpdated);
      socket.off("players:updated", onPlayersUpdated);
    };
  }, [refreshLiveGame, refreshPreviousGames]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <LiveEngineCard stats={stats} />
      <DrawnNumbers data={drawn} />
      <PlayersTable players={players} />
      <PreviousGamesTable games={previousGames} />
    </div>
  );
}
