/**
 * LobbyPage � Smart Bingo Mini App
 * 
 * Real Bingo Business Logic:
 * - Players can claim/unclaim cards (max 5 per player)
 * - Stake ranges from minBet to maxBet (default 10)
 * - Auto-daub toggle for automatic marking
 * - Real-time updates via socket
 * - Player count shows unique players
 * - Countdown timer for game start
 * - Proper balance management
 */

import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLaunchParams, isInsideTelegram } from '../lib/telegram';
import {
  socket,
  connectAsPlayer,
  joinGameRoom,
  leaveGameRoom,
  type LobbyTickPayload,
  type GameStatusPayload,
  type CardClaimedPayload,
  type CardUnclaimedPayload,
  type BalanceUpdatedPayload,
  type LobbyStatsPayload,
} from '../lib/socket';
import { gamesApi, cardsApi, playerApi, type Game, type LobbyCard, type GameSettings } from '../api/client';
import LoadingScreen from './LoadingScreen';
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
  ACCENT_BLUE_LT,
  ACCENT_AMBER,
  CARD_AVAILABLE_BG,
  CARD_AVAILABLE_BORDER,
  CARD_AVAILABLE_TEXT,
  CARD_MINE_BG,
  CARD_MINE_BORDER,
  CARD_MINE_TEXT,
  CARD_OTHER_BG,
  CARD_OTHER_BORDER,
  CARD_OTHER_TEXT,
  CARD_SELECTED_BG,
  CARD_SELECTED_BORDER,
  CARD_SELECTED_TEXT,
  COLOR_SUCCESS_BG,
  COLOR_SUCCESS_TEXT,
  COLOR_ERROR_BG,
  COLOR_ERROR_TEXT,
} from '../lib/theme';

// -- Types ---------------------------------------------------------------------

interface PlayerInfo {
  id: number;
  balance: number;
  username: string | null;
  firstName: string | null;
}

// -- Helpers -------------------------------------------------------------------

function formatEtb(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// -- Sub-components ------------------------------------------------------------

function StatBox({ label, value, valueColor }: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl px-2 py-3.5 text-center min-w-0"
         style={{
           background: `linear-gradient(145deg, ${BG_SURFACE} 0%, ${BG_SURFACE_2} 100%)`,
           border: `1px solid ${BORDER_LIGHT}`,
           boxShadow: '0 0 20px rgba(124,109,255,0.10), 0 2px 8px rgba(0,0,0,0.4)',
         }}>
      <span className="mb-1.5 text-[11px] font-medium leading-tight" style={{ color: TEXT_MUTED }}>{label}</span>
      <span
        className="text-xl font-extrabold leading-none"
        style={{ color: valueColor ?? TEXT_PRIMARY }}
      >
        {value}
      </span>
    </div>
  );
}

// -- Main Component ------------------------------------------------------------

export default function LobbyPage() {
  const navigate = useNavigate();
  const launchParams = getLaunchParams();
  const telegramId = launchParams.telegramId;

  // Player state
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [playerError, setPlayerError] = useState(false);

  // Game state
  const [game, setGame] = useState<Game | null>(null);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
  const [liveDrawnNumbers, setLiveDrawnNumbers] = useState<number[]>([]);
  const [liveCurrentNumber, setLiveCurrentNumber] = useState<number | null>(null);
  const [livePlayerCount, setLivePlayerCount] = useState(0);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [cards, setCards] = useState<LobbyCard[]>([]);
  const [twinklingCards, setTwinklingCards] = useState<Record<number, boolean>>({});

  // My claimed cards (card numbers)
  const [myCards, setMyCards] = useState<number[]>([]);

  // Cart: selected but not yet claimed cards
  const [selectedCards, setSelectedCards] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('lobby_cart');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const selectedCardsRef = useRef<number[]>(selectedCards);
  useEffect(() => {
    selectedCardsRef.current = selectedCards;
    try {
      localStorage.setItem('lobby_cart', JSON.stringify(selectedCards));
    } catch { /* ignore */ }
  }, [selectedCards]);

  // UI state
  const [autoDaub, setAutoDaub] = useState(true);
  const [stake, setStake] = useState(() => {
    try {
      const stored = sessionStorage.getItem('lobby_stake');
      return stored ? parseInt(stored, 10) : 10;
    } catch {
      return 10;
    }
  }); // Default to 10
  const [stakeInputValue, setStakeInputValue] = useState(() => {
    try {
      return sessionStorage.getItem('lobby_stake') || '10';
    } catch {
      return '10';
    }
  });
  const [stakeError, setStakeError] = useState<string | null>(null); // Stake validation error
  const [loading, setLoading] = useState(true);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [claimingCard, setClaimingCard] = useState<number | null>(null);
  const [debugErrors, setDebugErrors] = useState<string[]>([]); // Store all errors for display

  // Refs for stable callbacks
  const currentGameId = useRef<number | null>(null);
  const liveGameId = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fromCompleted = useRef(false);
  const botQueueRef = useRef<any[]>([]);
  const isProcessingQueueRef = useRef(false);
  try { if (sessionStorage.getItem('fromCompleted') === '1') { fromCompleted.current = true; sessionStorage.removeItem('fromCompleted'); } } catch {}

  useEffect(() => {
    if (fromCompleted.current) {
      const timer = setTimeout(() => {
        fromCompleted.current = false;
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Helper to add error to debug display
  const addDebugError = useCallback((error: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugErrors(prev => [`[${timestamp}] ${error}`, ...prev].slice(0, 20)); // Keep last 20 errors
  }, []);

  // Debug Telegram launch params
  useEffect(() => {
    console.log({
      telegramId,
      username: launchParams.username,
      firstName: launchParams.firstName,
      isInsideTelegram: isInsideTelegram(),
    });
    
    if (!telegramId) {
      const timestamp = new Date().toLocaleTimeString();
      setDebugErrors(prev => [`[${timestamp}] ?? No telegramId from Telegram WebApp`, ...prev].slice(0, 20));
    } else {
      const timestamp = new Date().toLocaleTimeString();
      setDebugErrors(prev => [`[${timestamp}] ? Telegram ID: ${telegramId}`, ...prev].slice(0, 20));
    }
  }, [telegramId, launchParams]);

  // -- Calculate real business metrics --------------------------------------

  // Total claimed cards
  const totalClaimedCards = useMemo(() => {
    return cards.filter(c => c.claimed).length;
  }, [cards]);

  // Use server-calculated stats if available, otherwise fallback to client-side calculation
  const displayPlayerCount = useMemo(() => {
    const selectedCount = selectedCards.length;
    if (totalClaimedCards > 0) {
      return Math.max(0, totalClaimedCards - 15) + selectedCount;
    }
    const totalCards = game?.totalCards ?? 0;
    return Math.max(0, totalCards - 15) + selectedCount;
  }, [totalClaimedCards, game?.totalCards, selectedCards.length]);

  // Unique player count (real players, not cards) - for reference
  const uniquePlayerCount = useMemo(() => {
    const serverStats = game?.calculatedStats;
    if (serverStats?.totalPlayersInParens !== undefined) {
      return serverStats.totalPlayersInParens;
    }
    const uniquePlayers = new Set();
    cards.forEach(c => {
      if (c.playerId != null) {
        uniquePlayers.add(c.playerId);
      }
    });
    // Add current player if they have cards
    if (myCards.length > 0 && player?.id) {
      uniquePlayers.add(player.id);
    }
    return uniquePlayers.size;
  }, [game?.calculatedStats, cards, myCards, player?.id]);

  // Debug stats calculation
  useEffect(() => {
    addDebugError(`?? Stats: players=${displayPlayerCount}, cards=${totalClaimedCards}, myCards=${myCards.length}, playerId=${player?.id}`);
  }, [displayPlayerCount, totalClaimedCards, myCards.length, player?.id, addDebugError]);

  // -- Redirect to game if already in progress -------------------------------

  useEffect(() => {
    if (game?.status === 'in_progress' && !fromCompleted.current) {
      addDebugError(`Game ${game.id} is in progress, redirecting to game page`);
      navigate(`/game/${game.id}`);
    }
  }, [game?.status, game?.id, navigate, addDebugError]);

  // -- Poll for game status changes -------------------------------------------

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await gamesApi.getLobby();
        if (res.success && res.data) {
          const currentGame = res.data;
          addDebugError(`Poll: game status=${currentGame.status}, id=${currentGame.id}`);
          
          // If game status changed to in_progress, update state and redirect
          if (currentGame.status === 'in_progress' && game?.status !== 'in_progress') {
            addDebugError(`Game ${currentGame.id} transitioned to in_progress, updating state`);
            setGame(currentGame);
            // The redirect useEffect will handle the navigation
          }
        }
      } catch (err) {
        addDebugError(`Game status poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [game?.status, addDebugError]);

  // -- Poll for game start after countdown hits 0 --------------------------

  const startTransitionPoll = useCallback(() => {
    if (transitionPollRef.current) return;
    if (fromCompleted.current) return;
    addDebugError('Starting transition poll for game start');
    transitionPollRef.current = setInterval(async () => {
      try {
        const res = await gamesApi.getLobby();
        addDebugError(`Poll: game status=${res.data?.status}, id=${res.data?.id}`);
        if (res.data?.status === 'in_progress') {
          clearInterval(transitionPollRef.current!);
          transitionPollRef.current = null;
          addDebugError(`Game ${res.data.id} started, redirecting to game page`);
          navigate(`/game/${res.data.id}`);
        }
      } catch (err) {
        addDebugError(`Poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 1000);
  }, [navigate, addDebugError]);

  // -- Splash Screen State -------------------------------------------------

  const [showSplash, setShowSplash] = useState(true);
  const [fadeSplash, setFadeSplash] = useState(false);
  const [minTimerDone, setMinTimerDone] = useState(false);

  // -- Refs for stale closures ---------------------------------------------

  const myCardsRef = useRef(myCards);
  useEffect(() => {
    myCardsRef.current = myCards;
  }, [myCards]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const stakeRef = useRef(stake);
  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);

  const claimingCardRef = useRef(claimingCard);
  useEffect(() => {
    claimingCardRef.current = claimingCard;
  }, [claimingCard]);

  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // -- Splash screen timer -------------------------------------------------

  useEffect(() => {
    let delay = 300;
    try {
      if (fromCompleted.current || sessionStorage.getItem('fromCompleted') === '1') {
        delay = 50;
      }
    } catch {}

    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimerDone && !loading) {
      setFadeSplash(true);
      const removeTimer = setTimeout(() => {
        setShowSplash(false);
      }, 300);
      return () => clearTimeout(removeTimer);
    }
  }, [minTimerDone, loading]);

  // -- Load player profile -------------------------------------------------

  useEffect(() => {
    if (!telegramId) {
      addDebugError('?? Cannot load player profile - no telegramId');
      // Set a default player for testing when not in Telegram
      if (!isInsideTelegram()) {
        const testPlayer = {
          id: 0,
          balance: 1000,
          username: 'test_user',
          firstName: 'Test',
        };
        setPlayer(testPlayer);
        playerRef.current = testPlayer;
        addDebugError('?? Using test player for browser testing');
      }
      return;
    }
    
    playerApi
      .getProfile(telegramId)
      .then((res) => {
        if (res.success) {
          const playerData = {
            id: res.data.id,
            balance: res.data.balance,
            username: res.data.username ?? null,
            firstName: res.data.firstName ?? null
          };
          setPlayer(playerData);
          playerRef.current = playerData;
          addDebugError(`? Player profile loaded: ${playerData.firstName} (ID: ${playerData.id})`);
        } else {
          addDebugError(`? Player profile API failed: ${JSON.stringify(res)}`);
          setPlayerError(true);
        }
      })
      .catch((err) => {
        addDebugError(`? Player profile error: ${err instanceof Error ? err.message : String(err)}`);
        setPlayerError(true);
      });
  }, [telegramId, addDebugError]);

  // -- Load game settings --------------------------------------------------

  useEffect(() => {
    gamesApi
      .getSettings()
      .then((res) => {
        if (res.success) setSettings(res.data);
      })
      .catch(() => {/* non-fatal */ });
  }, []);

  // -- Sync stake with settings only (not game - per-player stakes allowed) -------------------------------------

  useEffect(() => {
    if (settings) {
      // Only sync if stake is outside valid range
      if (stake < settings.minBet || stake > settings.maxBet) {
        const clamped = Math.max(settings.minBet, Math.min(settings.maxBet, stake));
        setStake(clamped);
        setStakeInputValue(clamped.toString());
      }
    }
  }, [settings, stake]);

  // -- Load initial game + cards -------------------------------------------

  // Clear cart when game changes to avoid stale selections
  useEffect(() => {
    if (game) {
      setSelectedCards([]);
      try { localStorage.removeItem('lobby_cart'); } catch {}
    }
  }, [game?.id]);

  const loadLiveGameMeta = useCallback(async (live: Game) => {
    try {
      const cardRes = await cardsApi.list(live.id);
      if (cardRes.success) {
        const distinct = new Set(cardRes.data.filter((c) => c.playerId != null).map((c) => c.playerId));
        setLivePlayerCount(distinct.size);
      }
    } catch { /* non-fatal */ }
  }, []);

  const loadGame = useCallback(async () => {
    try {
      const res = await gamesApi.getLobby();
      if (!res.success || !res.data) {
        addDebugError(`Lobby API failed: ${JSON.stringify(res)}`);
        if (res.liveGame && !fromCompleted.current) {
          setLoading(false);
          navigate(`/game/${res.liveGame.id}`);
          return;
        }
        setGame(null);
        setLiveGame(null);
        setLoading(false);
        return;
      }
      const g = res.data;
      const live = res.liveGame ?? null;
      setLiveGame(live);

      // Debug: Log which game we received
      addDebugError(`?? Game loaded: id=${g.id}, status=${g.status}`);
      if (live) {
        addDebugError(`?? Live game: id=${live.id}, status=${live.status}`);
      }

      // Check if server stats are present
      if (g.calculatedStats) {
        const botCount = g.calculatedStats.botCount ?? (g.calculatedStats.totalPlayersInParens - g.calculatedStats.realPlayerCount);
        addDebugError(`? Server stats loaded: players=${g.calculatedStats.totalPlayers}, cards=${g.calculatedStats.totalCardsInParens}, realPlayers=${g.calculatedStats.realPlayerCount}, bots=${botCount}`);
        addDebugError(`?? Bot count for game ${g.id}: ${botCount}`);
      } else {
        addDebugError(`?? No server stats in game data, using fallback`);
      }

      if (live) {
        setLiveDrawnNumbers(live.drawnNumbers ?? []);
        setLiveCurrentNumber(live.currentNumber ?? null);
        if (liveGameId.current !== live.id) {
          if (liveGameId.current !== null) leaveGameRoom(liveGameId.current);
          liveGameId.current = live.id;
          joinGameRoom(live.id);
        }
        void loadLiveGameMeta(live);
      } else {
        if (liveGameId.current !== null) {
          leaveGameRoom(liveGameId.current);
          liveGameId.current = null;
        }
        setLiveDrawnNumbers([]);
      }

      const isNewGame = g.id !== currentGameId.current;
      const wasNewGame = isNewGame;
      currentGameId.current = g.id;
      // Ensure this client is in the waiting game room for lobby:tick and game:status
      joinGameRoom(g.id);
      setGame(g);
      // Server hardcodes lobby countdown to 30s; use same initial value here
      setCountdown(30);
      const pid = playerRef.current?.id;

      // Only initialise stake from the saved sessionStorage value or game default.
      // Never override from session.bet — the player's chosen stake must be preserved.
      if (wasNewGame) {
        const min = settingsRef.current?.minBet ?? 10;
        let savedStake: number | null = null;
        try {
          const stored = sessionStorage.getItem('lobby_stake');
          savedStake = stored ? parseInt(stored, 10) : null;
        } catch { savedStake = null; }
        // Use saved stake if within valid range; otherwise default to game cardPrice
        const gameDefault = g.cardPrice ?? min;
        const newStake = (savedStake !== null && !isNaN(savedStake) && savedStake >= min) ? savedStake : gameDefault;
        setStake(newStake);
        setStakeInputValue(newStake.toString());
        try { sessionStorage.setItem('lobby_stake', newStake.toString()); } catch {}
      }

      addDebugError(`Loading cards for player ${pid} in game ${g.id}...`);
      addDebugError(`Game status: ${g.status}, Game ID: ${g.id}`);
      const cardRes = await cardsApi.list(g.id, pid);
      if (cardRes.success) {
        addDebugError(`Cards loaded: ${cardRes.data.length} cards`);
        addDebugError(`My cards: ${cardRes.data.filter((c) => c.isMine).map((c) => c.cardNumber).join(', ')}`);
        setCards(cardRes.data);
        const myCardNumbers = cardRes.data.filter((c) => c.isMine).map((c) => c.cardNumber);
        setMyCards(myCardNumbers);

        // If game is in_progress and player has no cards, redirect to waiting game
        if (g.status === 'in_progress' && myCardNumbers.length === 0 && live) {
          addDebugError(`Game ${g.id} is in progress but player has no cards, switching to waiting game ${live.id}`);
          setGame(live);
          setCountdown(30);
          // Load cards for the waiting game instead
          const waitingCardRes = await cardsApi.list(live.id, pid);
          if (waitingCardRes.success) {
            setCards(waitingCardRes.data);
            const waitingMyCards = waitingCardRes.data.filter((c) => c.isMine).map((c) => c.cardNumber);
            setMyCards(waitingMyCards);
            addDebugError(`Switched to waiting game ${live.id} with ${waitingMyCards.length} cards`);
          }
        }
      } else {
        addDebugError(`Card API failed: ${JSON.stringify(cardRes)}`);
      }
    } catch (err) {
      addDebugError(`Load game error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [navigate, loadLiveGameMeta, addDebugError, settings]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // -- Socket setup --------------------------------------------------------

  useEffect(() => {
    if (telegramId) {
      connectAsPlayer(telegramId);
    }

    const onConnect = () => {
      if (currentGameId.current !== null) {
        joinGameRoom(currentGameId.current);
      }
    };

    const onLobbyTick = ({ secondsLeft }: LobbyTickPayload) => {
      setCountdown(secondsLeft);

      if (secondsLeft <= 1) {
        const pending = selectedCardsRef.current;
        if (pending.length > 0) {
          addDebugError(`Auto-claiming ${pending.length} cart card(s) before game start (secondsLeft=${secondsLeft})`);

          // Block transition until auto-claim completes
          const doAutoClaim = async () => {
            const currentGame = gameRef.current;
            const currentPlayer = playerRef.current;
            if (!currentGame || !currentPlayer) return;
            if (currentGame.status !== 'waiting') {
              addDebugError(`Skipping auto-claim: game status is ${currentGame.status}`);
              return;
            }
            const maxCards = 4;
            if (myCardsRef.current.length + pending.length > maxCards) {
              addDebugError(`Skipping auto-claim: max cards reached`);
              return;
            }
            const activeStake = stakeRef.current;
            if (currentPlayer.balance < activeStake * pending.length) {
              addDebugError(`Skipping auto-claim: insufficient balance`);
              return;
            }

            const cardsToClaim = [...pending];
            for (const cardNumber of cardsToClaim) {
              try {
                const res = await cardsApi.claim(currentGame.id, cardNumber, currentPlayer.id, activeStake);
                if (res.success) {
                  setCards((prev) =>
                    prev.map((c) =>
                      c.cardNumber === cardNumber ? { ...c, claimed: true, playerId: currentPlayer.id, isMine: true } : c
                    )
                  );
                  setMyCards((prev) => (prev.includes(cardNumber) ? prev : [...prev, cardNumber]));
                  setPlayer((p) => p ? { ...p, balance: res.data.newBalance } : p);
                  addDebugError(`Auto-claimed card #${cardNumber}`);
                }
              } catch (err) {
                addDebugError(`Auto-claim card #${cardNumber} failed: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
            setSelectedCards([]);
            try { localStorage.removeItem('lobby_cart'); } catch {}
          };

          // Run synchronously so countdown cannot reach 0 before claims finish
          doAutoClaim().then(() => {
            addDebugError(`Auto-claim complete, starting transition poll`);
            startTransitionPoll();
          }).catch(() => {
            startTransitionPoll();
          });
          return;
        }
      }

      if (secondsLeft <= 0) {
        startTransitionPoll();
      }
    };

    const onGameStatus = async ({ status, gameId }: GameStatusPayload) => {
      if (status === 'in_progress') {
        if (gameId && !fromCompleted.current) {
          // If there are pending cart cards, wait for auto-claim before navigating
          const pending = selectedCardsRef.current;
          if (pending.length > 0) {
            addDebugError(`Game ${gameId} started but ${pending.length} cart card(s) pending - waiting for auto-claim`);
            // Block navigation until auto-claim completes or timeout
            await new Promise((resolve) => {
              const checkInterval = setInterval(() => {
                if (selectedCardsRef.current.length === 0) {
                  clearInterval(checkInterval);
                  resolve(true);
                }
              }, 200);
              // Timeout after 5 seconds to avoid blocking forever
              setTimeout(() => {
                clearInterval(checkInterval);
                resolve(true);
              }, 5000);
            });
          }
          navigate(`/game/${gameId}`);
          return;
        }
      }
      loadGame();
    };    const processNextBot = () => {
      if (botQueueRef.current.length === 0) {
        isProcessingQueueRef.current = false;
        return;
      }

      isProcessingQueueRef.current = true;
      const claim = botQueueRef.current.shift();
      if (!claim) {
        processNextBot();
        return;
      }

      const { botId, cardNumber } = claim;

      // 1. Mark card as claimed in cards list
      setCards((prev) =>
        prev.map((c) =>
          c.cardNumber === cardNumber
            ? { ...c, claimed: true, playerId: botId, isMine: false }
            : c
        )
      );

      // 2. Trigger twinkle effect
      setTwinklingCards((prev) => ({ ...prev, [cardNumber]: true }));
      setTimeout(() => {
        setTwinklingCards((prev) => {
          const copy = { ...prev };
          delete copy[cardNumber];
          return copy;
        });
      }, 600);

      // Calculate stagger delay before next card claim
      // We aim to complete the whole queue in ~1.5 - 2.5 seconds
      const queueLen = botQueueRef.current.length;
      const nextDelay = queueLen > 0 ? Math.max(50, Math.min(300, 2000 / queueLen)) : 300;

      setTimeout(() => {
        processNextBot();
      }, nextDelay);
    };

    const onCardClaimed = ({ cardNumber, playerId, isBot }: CardClaimedPayload) => {
      const myId = playerRef.current?.id;
      if (myId === playerId) {
        setCards((prev) =>
          prev.map((c) =>
            c.cardNumber === cardNumber
              ? { ...c, claimed: true, playerId, isMine: true }
              : c
          )
        );
        setMyCards((prev) => (prev.includes(cardNumber) ? prev : [...prev, cardNumber]));
        setSelectedCards((prev) => prev.filter((n) => n !== cardNumber));

        // Read the stake from the player's current live game session
        const currentGame = gameRef.current;
        const mySession = currentGame?.sessions?.find((s: any) => s.playerId === myId);
        const displayStake = mySession?.bet ?? stakeRef.current;

        setClaimSuccess(`Card #${cardNumber} claimed for ETB ${displayStake}`);
        setTimeout(() => setClaimSuccess(null), 3000);
      } else if (!isBot) {
        setCards((prev) =>
          prev.map((c) =>
            c.cardNumber === cardNumber
              ? { ...c, claimed: true, playerId, isMine: false }
              : c
          )
        );
      }
      // If it is a bot (isBot === true), we ignore it here because it will be animated progressively
    };

    const onCardUnclaimed = ({ cardNumber }: CardUnclaimedPayload) => {
      setCards((prev) =>
        prev.map((c) =>
          c.cardNumber === cardNumber ? { ...c, claimed: false, playerId: null, isMine: false } : c
        )
      );
      setMyCards((prev) => prev.filter((n) => n !== cardNumber));
    };

    const onStakeUpdated = ({ cardPrice }: { cardPrice: number }) => {
      setStake(cardPrice);
      setStakeInputValue(cardPrice.toString());
      setGame((g) => (g ? { ...g, cardPrice } : g));
    };

    // Real-time stats updates - pushed immediately when a card is claimed/unclaimed
    const onLobbyStatsUpdated = ({ gameId: updatedGameId, stats }: LobbyStatsPayload) => {
      const currentGame = gameRef.current;
      if (updatedGameId !== currentGame?.id) return;

      setGame((g) => {
        if (!g) return g;
        return {
          ...g,
          calculatedStats: {
            totalPlayers: stats.totalPlayers,
            totalPlayersInParens: stats.totalPlayersInParens,
            totalCards: stats.totalCards,
            totalCardsInParens: stats.totalCardsInParens,
            realPlayerCount: stats.realPlayerCount,
            totalEnrollmentCards: stats.totalEnrollmentCards,
            botCount: stats.botCount,
          },
        };
      });

      // Update balance if included (only direct REST responses or targeted socket events)
      // stats.newBalance is broadcasted to the whole room and should not be used here.
    };

    // Pushed by the backend the moment an admin approves a deposit/withdrawal
    // request from the Admin Dashboard's Pending Requests page – keeps the
    // player's balance in sync here without needing to reload the app.
    const onBalanceUpdated = ({ balance }: BalanceUpdatedPayload) => {
      setPlayer((p) => (p ? { ...p, balance } : p));
    };

    const onStatusUpdated = ({ status }: { status: boolean }) => {
      if (!status) {
        setPlayerError(true);
      } else {
        setPlayerError(false);
      }
    };

    const onBotJoined = (bot: any) => {
      const { botId, claimedCards } = bot;
      if (Array.isArray(claimedCards)) {
        claimedCards.forEach((cardNumber: number) => {
          botQueueRef.current.push({ botId, cardNumber });
        });
      }
      if (!isProcessingQueueRef.current) {
        processNextBot();
      }
    };

    socket.on('connect', onConnect);
    socket.on('lobby:tick', onLobbyTick);
    socket.on('game:status', onGameStatus);
    socket.on('game:stake_updated', onStakeUpdated);
    socket.on('card:claimed', onCardClaimed);
    socket.on('card:unclaimed', onCardUnclaimed);
    socket.on('lobby:stats_updated', onLobbyStatsUpdated);
    socket.on('balance:updated', onBalanceUpdated);
    socket.on('player:status_updated', onStatusUpdated);
    socket.on('bot:joined', onBotJoined);

    return () => {
      socket.off('connect', onConnect);
      socket.off('lobby:tick', onLobbyTick);
      socket.off('game:status', onGameStatus);
      socket.off('game:stake_updated', onStakeUpdated);
      socket.off('card:claimed', onCardClaimed);
      socket.off('card:unclaimed', onCardUnclaimed);
      socket.off('lobby:stats_updated', onLobbyStatsUpdated);
      socket.off('balance:updated', onBalanceUpdated);
      socket.off('player:status_updated', onStatusUpdated);
      socket.off('bot:joined', onBotJoined);
      if (currentGameId.current !== null) {
        leaveGameRoom(currentGameId.current);
      }
      if (transitionPollRef.current) {
        clearInterval(transitionPollRef.current);
        transitionPollRef.current = null;
      }
      if (statsPollRef.current) {
        clearInterval(statsPollRef.current);
        statsPollRef.current = null;
      }
    };
  }, [telegramId, navigate, loadGame, startTransitionPoll]);

  // -- Poll lobby stats while waiting so enrollment/counts update live ------

  useEffect(() => {
    if (game?.status !== 'waiting') {
      if (statsPollRef.current) {
        clearInterval(statsPollRef.current);
        statsPollRef.current = null;
      }
      return;
    }

    statsPollRef.current = setInterval(async () => {
      try {
        const res = await gamesApi.getLobby();
        if (res.success && res.data) {
          setGame(res.data);
        }
      } catch { /* non-fatal */ }
    }, 5000); // 5-second fallback; real-time updates come via socket

    return () => {
      if (statsPollRef.current) {
        clearInterval(statsPollRef.current);
        statsPollRef.current = null;
      }
    };
  }, [game?.status]);

  // -- Poll for new game when in_progress ---------------------------------

  useEffect(() => {
    if (game?.status === 'in_progress') {
      pollRef.current = setInterval(async () => {
        try {
          const res = await gamesApi.getLobby();
          if (res.data && res.data.status === 'waiting') {
            clearInterval(pollRef.current!);
            loadGame();
          }
        } catch {/* ignore */ }
      }, 5000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [game?.status, loadGame]);

  // -- Cart selection handlers ---------------------------------------------

  const handleToggleSelect = useCallback(async (cardNumber: number) => {
    const currentGame = gameRef.current;
    const currentPlayer = playerRef.current;
    if (!currentGame || !currentPlayer) return;
    if (currentGame.status !== 'waiting') {
      setClaimError(`? Game is not open for card selection (status: ${currentGame.status})`);
      setTimeout(() => setClaimError(null), 4000);
      return;
    }

    const isSelected = selectedCardsRef.current.includes(cardNumber);
    const isMine = myCardsRef.current.includes(cardNumber);

    if (isSelected && !isMine) {
      // User deselecting from cart - remove from selection
      setSelectedCards((prev) => prev.filter((n) => n !== cardNumber));
      return;
    }

    if (isMine) {
      // User clicking their own claimed card  unclaim it
      setClaimingCard(cardNumber);
      setClaimError(null);
      try {
        const res = await cardsApi.unclaim(currentGame.id, cardNumber, currentPlayer.id);
        if (res.success) {
          setPlayer((p) => p ? { ...p, balance: res.data.newBalance } : p);
          setCards((prev) =>
            prev.map((c) =>
              c.cardNumber === cardNumber ? { ...c, claimed: false, playerId: null, isMine: false } : c
            )
          );
          setMyCards((prev) => prev.filter((n) => n !== cardNumber));
          setSelectedCards((prev) => prev.filter((n) => n !== cardNumber));
          setClaimSuccess(`Card #${cardNumber} unclaimed successfully`);
          setTimeout(() => setClaimSuccess(null), 3000);
        } else {
          setClaimError(`? Card #${cardNumber}: ${res.message || 'Failed to unclaim'}`);
          setTimeout(() => setClaimError(null), 4000);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to unclaim card';
        setClaimError(`? ${msg}`);
        setTimeout(() => setClaimError(null), 4000);
      } finally {
        setClaimingCard(null);
      }
      return;
    }

    // User selecting an available card  immediately claim it in the backend
    const maxCards = 4; // hardcoded max 4 cards per player
    const activeStake = stakeRef.current;
    const min = settingsRef.current?.minBet ?? 10;
    const max = 100;
        if (activeStake < min || activeStake > max) {
      setClaimError(`? Stake must be between ${min} and ${max} ETB`);
      setTimeout(() => setClaimError(null), 3000);
      return;
    }
    if (myCardsRef.current.length >= maxCards) {
      setClaimError(`? Maximum ${maxCards} cards per player`);
      setTimeout(() => setClaimError(null), 3000);
      return;
    }
        if (currentPlayer.balance < activeStake) {
          setClaimError(`? Insufficient balance. Need ${activeStake} ETB`);
      setTimeout(() => setClaimError(null), 3000);
      return;
    }

    setClaimError(null);

    // Optimistic update - immediate UI feedback
    setCards((prev) =>
      prev.map((c) =>
        c.cardNumber === cardNumber ? { ...c, claimed: true, playerId: currentPlayer.id, isMine: true } : c
      )
    );
    setMyCards((prev) => (prev.includes(cardNumber) ? prev : [...prev, cardNumber]));
    setSelectedCards((prev) => (prev.includes(cardNumber) ? prev : [...prev, cardNumber]));
    // Clear claiming state immediately since optimistic update already shows claimed
    setClaimingCard(null);

    try {
          const res = await cardsApi.claim(currentGame.id, cardNumber, currentPlayer.id, activeStake);
      if (res.success) {
        setPlayer((p) => p ? { ...p, balance: res.data.newBalance } : p);
            setClaimSuccess(`Card #${cardNumber} claimed for ETB ${activeStake}`);
        setTimeout(() => setClaimSuccess(null), 3000);
      } else {
        // Revert optimistic update on failure
        setCards((prev) =>
          prev.map((c) =>
            c.cardNumber === cardNumber ? { ...c, claimed: false, playerId: null, isMine: false } : c
          )
        );
        setMyCards((prev) => prev.filter((n) => n !== cardNumber));
        setSelectedCards((prev) => prev.filter((n) => n !== cardNumber));
        setClaimError(`? Card #${cardNumber}: ${res.message || 'Failed to claim'}`);
        setTimeout(() => setClaimError(null), 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to claim card';
      setClaimError(`? ${msg}`);
      setTimeout(() => setClaimError(null), 4000);
    } finally {
      setClaimingCard(null);
    }
   }, []);

  // -- Claim / unclaim handlers --------------------------------------------

  const handleClaim = useCallback(
    async (cardNumber: number) => {
      const currentGame = gameRef.current;
      const currentPlayer = playerRef.current;
      if (!currentGame || !currentPlayer) return;
      if (claimingCardRef.current !== null) return;

      // Block claims if the lobby game is no longer in waiting state
      if (currentGame.status !== 'waiting') {
        setClaimError(`? Game is not open for card selection (status: ${currentGame.status})`);
        setTimeout(() => setClaimError(null), 4000);
        return;
      }

      // Business rules - max cards per player (hardcoded to 4)
      const maxCards = 4;
      if (myCardsRef.current.length >= maxCards) {
        setClaimError(`? Maximum ${maxCards} cards per player`);
        setTimeout(() => setClaimError(null), 3000);
        return;
      }

       // Validate stake is within allowed range
      const min = settingsRef.current?.minBet ?? 10;
      const max = 100;
      if (stake < min || stake > max) {
        setStakeError(`? Stake must be between ${min} and ${max}`);
        setTimeout(() => setStakeError(null), 3000);
        return;
      }

      // Always use the latest stake selected by the player (via ref to avoid stale closure)
      const activeStake = stakeRef.current;
            if (currentPlayer.balance < activeStake) {
              setClaimError(`? Insufficient balance. Need ${activeStake} ETB (Balance: ${currentPlayer.balance} ETB)`);
        setTimeout(() => setClaimError(null), 3000);
        return;
      }

      setClaimError(null);

      // Optimistic update - immediate UI feedback
      setCards((prev) =>
        prev.map((c) =>
          c.cardNumber === cardNumber ? { ...c, claimed: true, playerId: currentPlayer.id, isMine: true } : c
        )
      );
      setMyCards((prev) => [...prev, cardNumber]);
      // Clear claiming state immediately since optimistic update already shows claimed
      setClaimingCard(null);

      try {
              const res = await cardsApi.claim(currentGame.id, cardNumber, currentPlayer.id, activeStake);
        if (res.success) {
          setPlayer((p) => p ? { ...p, balance: res.data.newBalance } : p);
                setClaimSuccess(`Card #${cardNumber} claimed for ETB ${activeStake}`);
          setTimeout(() => setClaimSuccess(null), 3000);
        } else {
          // Revert optimistic update on failure
          setCards((prev) =>
            prev.map((c) =>
              c.cardNumber === cardNumber ? { ...c, claimed: false, playerId: null, isMine: false } : c
            )
          );
          setMyCards((prev) => prev.filter((n) => n !== cardNumber));
          setClaimError(`? ${res.message || 'Failed to claim card'}`);
          setTimeout(() => setClaimError(null), 4000);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to claim card';
        setClaimError(`? ${msg}`);
        setTimeout(() => setClaimError(null), 4000);
      } finally {
        setClaimingCard(null);
      }
     },
      []
    );

   // -- Stake stepper --------------------------------------------------------

   const minBet = settings?.minBet ?? 10;
   const maxBet = 100;
   
   // Check if current stake is valid
   const isStakeValid = stake >= minBet && stake <= maxBet;

   // Disable stake editing when player has claimed any cards
   const stakeDisabled = myCards.length > 0;

  const updateStake = useCallback((newStake: number) => {
    const currentSettings = settingsRef.current;
    
    // Validate stake is within allowed range
    const min = currentSettings?.minBet ?? 10;
    const max = 100;
    if (newStake < min || newStake > max) {
      setStakeError(`? Stake must be between ${min} and ${max}`);
      setStakeInputValue(newStake.toString());
      return;
    }

    setStakeError(null);
    setStake(newStake);
    setStakeInputValue(newStake.toString());
    try { sessionStorage.setItem('lobby_stake', newStake.toString()); } catch {}
  }, []);

  const decreaseStake = () => {
    const step = 10;
    const next = Math.max(minBet, stake - step);
    if (next !== stake) {
      setStake(next);
      setStakeInputValue(next.toString());
      setStakeError(null);
      try { sessionStorage.setItem('lobby_stake', next.toString()); } catch {}
    }
  };
  const increaseStake = () => {
    const step = 10;
    let next = stake + step;
    if (next > maxBet) {
      next = minBet;
    }
    setStake(next);
    setStakeInputValue(next.toString());
    setStakeError(null);
    try { sessionStorage.setItem('lobby_stake', next.toString()); } catch {}
  };

  // -- Render --------------------------------------------------------------

  const renderLobbyContent = () => {
    if (!game) {
      return (
        <div className="flex h-screen flex-col overflow-hidden" style={{ background: BG_PAGE }}>
          <div className="flex gap-2 px-2 pt-3 pb-2 shrink-0">
            <StatBox label="ተጫዋች" value="0" valueColor={ACCENT_BLUE} />
            <StatBox label="ሊጀምር ነው" value="" valueColor={ACCENT_AMBER} />
            <StatBox label="ቀሪ ሂሳብ" value={player ? formatEtb(player.balance) : '0'} valueColor={TEXT_PRIMARY} />
          </div>
          <div className="mx-3 mt-8 rounded-xl p-6 text-center"
               style={{ background: BG_SURFACE, border: `1px solid ${BORDER_LIGHT}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p className="text-[15px] leading-relaxed font-medium" style={{ color: ACCENT_AMBER }}>
              አዲስ ጨዋታ ሲዘጋጅ ይጠብቁ...
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-screen flex-col overflow-hidden" style={{ background: BG_PAGE }}>
                {/* Stats bar � ????? | ?? | ?? (Bots and Cart hidden from UI) */}
        <div className="flex gap-2 px-2 pt-3 pb-2">
          <StatBox label="ተጫዋች" value={displayPlayerCount || '0'} valueColor={ACCENT_BLUE} />
          <StatBox
            label="ሊጀምር ነው"
            value={game?.status === 'in_progress' ? 'Live' : `${countdown > 0 ? countdown : '0'}s`}
            valueColor={ACCENT_AMBER}
          />
          <StatBox
            label="ቀሪ ሂሳብ"
            value={player ? formatEtb(player.balance) : '0'}
            valueColor={TEXT_PRIMARY}
          />
        </div>

        {game?.status !== 'in_progress' && (
          <>
            {/* Min / max stake hint */}
            <p className="mt-2 px-3 text-center text-[11px]" style={{ color: TEXT_MUTED }}>
              ተነሹ {minBet} | ትልቁ {maxBet}
            </p>

            {/* Auto toggle + stake stepper */}
            <div className="mt-2 flex items-center gap-2.5 px-2">
              <button
                type="button"
                onClick={() => setAutoDaub((v) => !v)}
                aria-label="Auto daub"
                className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200"
                style={{ backgroundColor: autoDaub ? ACCENT_BLUE : BORDER_MEDIUM }}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
                    autoDaub ? 'left-6' : 'left-1'
                  }`}
                />
              </button>

              <div
                className="flex flex-1 items-center rounded-xl overflow-hidden"
                style={{ background: BG_SURFACE_2, border: `1px solid ${BORDER_LIGHT}` }}
              >
                <span className="shrink-0 pl-3 pr-1 text-[11px] select-none" style={{ color: TEXT_MUTED }}>መደብ</span>
                 <button
                   type="button"
                   onClick={decreaseStake}
                   disabled={stake <= minBet || stakeDisabled}
                   className="px-3 py-2.5 text-lg active:bg-black/5 disabled:opacity-30 disabled:pointer-events-none select-none"
                   style={{ color: TEXT_SECONDARY }}
                 >
                   -
                 </button>
                 <input
                   type="number"
                   value={stakeInputValue}
                   onChange={(e) => {
                     const value = e.target.value;
                     setStakeInputValue(value);
                     // Clear error while typing, validate on blur
                     setStakeError(null);
                   }}
                   onBlur={(e) => {
                     const value = parseInt(e.target.value);
                     if (!isNaN(value)) {
                       updateStake(value);
                     } else {
                       setStakeInputValue(stake.toString());
                     }
                   }}
                   min={minBet}
                   max={maxBet}
                   disabled={stakeDisabled}
                   className="flex-1 text-center text-base font-bold bg-transparent outline-none disabled:opacity-50"
                   style={{ color: TEXT_PRIMARY }}
                 />
                 <button
                   type="button"
                   onClick={increaseStake}
                   disabled={stakeDisabled}
                   className="px-3 py-2.5 text-lg active:bg-black/5 disabled:opacity-30 disabled:pointer-events-none select-none"
                   style={{ color: TEXT_SECONDARY }}
                 >
                   +
                 </button>
              </div>
            </div>

            {/* Stake error message */}
            {stakeError && (
              <div className="mx-3 mt-2 rounded-lg px-3 py-2 text-center text-xs"
                   style={{ background: COLOR_ERROR_BG, color: COLOR_ERROR_TEXT }}>
                {stakeError}
              </div>
            )}

             {/* Instruction text */}
             <div className="mt-3 px-3 text-center">
               <p className="text-[13px] font-semibold leading-tight" style={{ color: ACCENT_AMBER }}>
                 ጨዋታው በሁለት ደቂቃ ነው
               </p>
               <p className="text-[15px] font-bold mt-1" style={{ color: TEXT_PRIMARY }}>
                 የካርቴላ ቁጥር ይምረጡ
               </p>
               {stakeDisabled && (
                 <p className="text-[11px] mt-1" style={{ color: ACCENT_BLUE }}>
                   ካርዴ ከወሰዱ በኋላ መደቡን መቀየር አይቻልም
                 </p>
               )}
               <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>
                 ምርጫዎችን ለማስወገድ /clear ያድርጉ
               </p>
             </div>

            {/* Clear cart button */}
            {selectedCards.length > 0 && (
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setSelectedCards([])}
                  className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{ color: TEXT_MUTED, background: BG_SURFACE_2 }}
                >
                  Clear Cart ({selectedCards.length})
                </button>
              </div>
            )}
          </>
        )}

        {/* Success / error toasts */}
        {claimSuccess && (
          <div className="mx-3 mt-2 rounded-lg px-3 py-2 text-center text-xs"
               style={{ background: COLOR_SUCCESS_BG, color: COLOR_SUCCESS_TEXT }}>
            {claimSuccess}
          </div>
        )}
        {claimError && (
          <div className="mx-3 mt-2 rounded-lg px-3 py-2 text-center text-xs"
               style={{ background: COLOR_ERROR_BG, color: COLOR_ERROR_TEXT }}>
            {claimError}
          </div>
        )}

        {/* Scrollable number grid � stats and controls above stay fixed */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {game?.status === 'in_progress' ? (
            <div className="mx-3 mt-8 rounded-xl p-6 text-center"
                 style={{ background: BG_SURFACE, border: `1px solid ${BORDER_LIGHT}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p className="text-[15px] leading-relaxed" style={{ color: ACCENT_AMBER }}>
                ጨዋታው ጀምሯል...
              </p>
              <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>ትኩስ ጨዋታ</p>
              <div className="mt-4 flex justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                     style={{ borderColor: ACCENT_BLUE, borderTopColor: 'transparent' }} />
              </div>
            </div>
          ) : cards.length === 0 ? (
            <div className="mx-3 mt-8 rounded-xl p-6 text-center"
                 style={{ background: BG_SURFACE, border: `1px solid ${BORDER_LIGHT}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p className="text-[15px] leading-relaxed" style={{ color: TEXT_MUTED }}>
                ካርቴላዎች እየተጫኑ ነው...
              </p>
              <div className="mt-4 flex justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                     style={{ borderColor: ACCENT_BLUE, borderTopColor: 'transparent' }} />
              </div>
            </div>
          ) : (
            <CardGrid
              cards={cards}
              myCards={myCards}
              selectedCards={selectedCards}
              claimingCard={claimingCard}
              onToggleSelect={handleToggleSelect}
              twinklingCards={twinklingCards}
            />
          )}

          {playerError && (
            <div className="mx-3 mt-4 mb-4 rounded-lg px-3 py-2 text-center text-sm"
                 style={{ background: ACCENT_BLUE_LT, color: ACCENT_BLUE }}>
              መለያዎ ታግዷል። አስተዳዳሪውን ያነጋግሩ።
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: BG_PAGE }}>
      {renderLobbyContent()}

      {showSplash && (
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${fadeSplash ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ background: `linear-gradient(180deg, ${BG_PAGE} 0%, #EFF6FF 100%)` }}
        >
          <LoadingScreen />
        </div>
      )}
    </div>
  );
}

// -- Card Grid component -------------------------------------------------------

interface CardGridProps {
  cards: LobbyCard[];
  myCards: number[];
  selectedCards: number[];
  claimingCard: number | null;
  onToggleSelect: (cardNumber: number) => void;
  twinklingCards: Record<number, boolean>;
}

function CardGrid({ cards, myCards, selectedCards, claimingCard, onToggleSelect, twinklingCards }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="mt-6 text-center text-sm" style={{ color: TEXT_MUTED }}>ካርቴላ የለም</div>
    );
  }

  return (
    <div className="mt-3 px-2 pb-4" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div
        className="grid gap-[5px]"
        style={{ gridTemplateColumns: 'repeat(9, minmax(0, 1fr))' }}
      >
        {cards.map((card) => (
          <CardBubble
            key={card.cardNumber}
            card={card}
            isMine={myCards.includes(card.cardNumber)}
            isSelected={selectedCards.includes(card.cardNumber)}
            isLoading={claimingCard === card.cardNumber}
            onToggleSelect={onToggleSelect}
            isTwinkling={!!twinklingCards[card.cardNumber]}
          />
        ))}
      </div>
    </div>
  );
}

// -- Card Bubble ----------------------------------------------------------------

interface CardBubbleProps {
  card: LobbyCard;
  isMine: boolean;
  isSelected: boolean;
  isLoading: boolean;
  onToggleSelect: (cardNumber: number) => void;
  isTwinkling: boolean;
}

const CardBubble = memo(
  function CardBubble({ card, isMine, isSelected, isLoading, onToggleSelect, isTwinkling }: CardBubbleProps) {
    const isClaimed = card.claimed;
    const isClaimedByOther = isClaimed && !isMine;

    const handleClick = () => {
      if (isLoading) return;
      if (isClaimedByOther) return; // claimed by someone else
      onToggleSelect(card.cardNumber);
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isClaimedByOther || isLoading}
        className={`
          aspect-square w-full rounded-2xl text-[11px] font-bold transition-all duration-200
          flex items-center justify-center select-none
          hover:scale-105 active:scale-95
          ${isLoading ? 'opacity-60 animate-pulse' : ''}
          ${isSelected ? 'ring-2 ring-offset-2' : ''}
          ${isClaimedByOther ? 'cursor-not-allowed' : ''}
          ${isTwinkling ? 'animate-twinkle ring-4 ring-amber-400 z-10' : ''}
        `}
        style={{
          backgroundColor: isMine || isClaimedByOther
            ? CARD_OTHER_BG
            : isSelected
            ? CARD_SELECTED_BG
            : CARD_AVAILABLE_BG,
          color: isMine || isClaimedByOther
            ? CARD_OTHER_TEXT
            : isSelected
            ? CARD_SELECTED_TEXT
            : CARD_AVAILABLE_TEXT,
          border: isMine || isClaimedByOther
            ? `1px solid ${CARD_OTHER_BORDER}`
            : isSelected
            ? `1px solid ${CARD_SELECTED_BORDER}`
            : `1px solid ${CARD_AVAILABLE_BORDER}`,
          boxShadow: isMine || isClaimedByOther
            ? '0 4px 12px rgba(37, 99, 235, 0.25)'
            : isSelected
            ? '0 4px 12px rgba(217, 119, 6, 0.25)'
            : '0 1px 2px rgba(0, 0, 0, 0.04)',
          ...(isSelected ? { ringColor: CARD_SELECTED_BORDER } : {}),
        }}
      >
        {card.cardNumber}
      </button>
    );
  },
  (prev, next) => {
    return (
      prev.card.id === next.card.id &&
      prev.card.claimed === next.card.claimed &&
      prev.card.playerId === next.card.playerId &&
      prev.isMine === next.isMine &&
      prev.isSelected === next.isSelected &&
      prev.isLoading === next.isLoading &&
      prev.isTwinkling === next.isTwinkling
    );
  }
);
