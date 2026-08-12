import { api } from "@/lib/api/client";
import type { LiveEngineStats, DrawnNumbersData, PlayerRow, PreviousGame, PreviousGameStatus, GameStatus } from "@/types";

import AppShell from "@/components/layout/AppShell";
import GamesRealtimeContainer from "@/components/games/GamesRealtimeContainer";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Map the backend RoundStatus enum to the UI GameStatus union */
function mapRoundStatus(raw: string | undefined | null): GameStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'in_progress': return 'Active';
    case 'completed':   return 'Completed';
    case 'cancelled':   return 'Completed'; // treat cancelled as completed in live widget
    case 'waiting':     return 'Pending';
    default:            return 'Pending';
  }
}

/** Map backend RoundStatus to PreviousGameStatus for the history table */
function mapPreviousStatus(raw: string | undefined | null): PreviousGameStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'completed':   return 'Completed';
    case 'cancelled':   return 'Cancelled';
    case 'waiting':     return 'Waiting for Players';
    case 'in_progress': return 'Waiting for Players'; // active game shown in history = lobby
    default:            return 'Completed';
  }
}

export default async function GamesPage() {
  // ── 1) Live engine stats + drawn numbers ─────────────────────────────────
  // Use GET /api/games/live which returns the active in_progress game with sessions.
  // If no in_progress game, fall back to waiting game.
  const [liveStatsData, previousGamesData] = await Promise.allSettled([
    api.getLiveGame(),
    api.getGames({ status: 'completed', page: 0, limit: 50 }),
  ]);

  // ── Live game ─────────────────────────────────────────────────────────────
  const liveGame = liveStatsData.status === 'fulfilled'
    ? liveStatsData.value?.data ?? null
    : null;

  const liveSessions = liveGame ? (Array.isArray(liveGame.sessions) ? liveGame.sessions : []) : [];

  console.log('Admin Games Page - liveGame:', liveGame);
  console.log('Admin Games Page - liveSessions:', liveSessions);

  // Use server-calculated stats if available, otherwise calculate client-side (fallback)
  const serverStats = liveGame?.calculatedStats;
  const allCardCount = serverStats?.totalCardsInParens ?? 
    liveSessions.reduce((sum: number, s: any) => sum + (s.cardCount ?? 1), 0);
  const displayPlayerCount = serverStats?.totalPlayers ?? Math.max(0, allCardCount - 15);
  const allPlayerCount = serverStats?.totalPlayersInParens ?? 
    new Set(liveSessions.map((s: any) => s.playerId ?? s.player?.id).filter(Boolean)).size;

   // Filter for real players only (for players table)
   const realSessions = liveSessions.filter((session: any) => {
     const player = session?.player;
     if (!player) return false;
     if (player.isBot === false) return true;
     if (player.isBot === undefined || player.isBot === null) {
       return player.username ? true : false;
     }
     return false; // isBot === true
   });

   // Unique real player count (deduplicated by playerId)
   const uniqueRealPlayerCount = new Set(realSessions.map((s: any) => s.playerId ?? s.player?.id).filter(Boolean)).size;

  const players: PlayerRow[] = liveGame
    ? realSessions.map((session: any) => {
        const p = session.player;
        const firstName = p?.firstName ?? '';
        const lastName  = p?.lastName  ?? '';
        const name = `${firstName} ${lastName}`.trim() || `Player #${session.playerId}`;
        const cardCount = session.cardCount ?? 1;
        // Use the player's actual selected stake from the session (session.bet),
        // NOT the game-level cardPrice which may differ from the player's chosen stake.
        const stake = session.bet ?? liveGame.cardPrice ?? 0;
        // Use the session's recorded totalBet if available (stake × cards, maintained by backend);
        // fall back to computing it locally.
        const totalBet =
          session.totalBet != null && session.totalBet > 0
            ? session.totalBet
            : stake * cardCount;
        return {
          id: String(session.playerId),
          name,
          phone: p?.phoneNumber ?? 'N/A',
          stake,
          cards: cardCount,
          totalBet,
          mode: 'Auto' as const,
        };
      })
    : [];

  const humanContribution = players.reduce((sum, p) => sum + p.totalBet, 0);

  const stats: LiveEngineStats = liveGame
    ? {
        status: mapRoundStatus(liveGame.status),
        totalPrizePool: serverStats?.humanContribution ?? humanContribution,
        prizePoolCurrency: 'ETB',
        totalPlayers: uniqueRealPlayerCount,
        totalPlayersInParens: allPlayerCount,
        totalCards: serverStats?.totalCards ?? realSessions.reduce((sum: number, s: any) => sum + (s.cardCount ?? 1), 0),
        totalCardsInParens: allCardCount,
        startTime: liveGame.startedAt ?? liveGame.createdAt,
        // Enrollment statistics
        realPlayerCount: serverStats?.realPlayerCount ?? uniqueRealPlayerCount,
        totalEnrollmentCards: serverStats?.totalEnrollmentCards ?? displayPlayerCount,
        botCount: serverStats?.botCount ?? (allPlayerCount - uniqueRealPlayerCount),
      }
    : {
        status: 'Pending',
        totalPrizePool: 0,
        prizePoolCurrency: 'ETB',
        totalPlayers: 0,
        totalPlayersInParens: 0,
        totalCards: 0,
        totalCardsInParens: 0,
        startTime: new Date().toISOString(),
        realPlayerCount: 0,
        totalEnrollmentCards: 0,
        botCount: 0,
      };

  // ── Drawn numbers (for the active game) ──────────────────────────────────
  const drawnData: DrawnNumbersData = {
    drawn: Array.isArray(liveGame?.drawnNumbers) ? liveGame.drawnNumbers : [],
    total: 75,
  };

  // ── Previous (completed) games ────────────────────────────────────────────
  const completedPayload = previousGamesData.status === 'fulfilled'
    ? previousGamesData.value
    : null;

  // Backend shape: { success, data: Game[], total }
  const completedList: any[] = Array.isArray(completedPayload?.data)
    ? completedPayload.data
    : [];

  const previousGames: PreviousGame[] = completedList.map((g: any) => ({
    // Use numeric ID formatted as zero-padded hex for visual style
    id: String(g.id ?? '').padStart(8, '0').toUpperCase(),
    status: mapPreviousStatus(g.status),
    prize: Number(g.prize ?? 0),
    prizeCurrency: 'ETB',
    // cards = _count.sessions when available (backend select includes _count)
    cards: Number(g._count?.sessions ?? g.totalCards ?? 0),
    createdAt: g.createdAt ?? new Date().toISOString(),
  }));

  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Games" }]}>
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Client-side container handles realtime updates via socket.io */}
          <GamesRealtimeContainer
            initialStats={stats}
            initialDrawn={drawnData}
            initialPlayers={players}
            initialPreviousGames={previousGames}
          />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
