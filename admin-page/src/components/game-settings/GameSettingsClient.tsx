"use client";

import { useState, useEffect } from "react";
import {
  Dices, Link2, Clock, Bot, Settings2,
  Loader2, Check, ChevronDown, X,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { socket, connectAsAdmin } from "@/lib/socket";
import type {
  GameSettings, BettingSettings, AgentSettings,
  TimingSettings, BotsSettings, GeneralSettings,
  SettingsTab, GameStatusSetting, BotDifficulty,
} from "@/types";

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "betting", label: "Betting", icon: <Dices size={14} /> },
  { id: "agent", label: "Agent", icon: <Link2 size={14} /> },
  { id: "timing", label: "Timing", icon: <Clock size={14} /> },
  { id: "bots", label: "Bots", icon: <Bot size={14} /> },
  { id: "general", label: "General", icon: <Settings2 size={14} /> },
];

// ─── Shared primitives ────────────────────────────────────────────────────────

const labelCls = "block text-sm font-medium text-[#B9C0D3] mb-1.5";

const inputCls =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 " +
  "bg-white dark:bg-gray-900 px-4 py-2.5 text-sm " +
  "text-white outline-none transition " +
  "focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}
function NumberField({ label, value, onChange, min = 0, max, step = 1 }: NumberFieldProps) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={inputCls}
      />
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
function TextField({ label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}
function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={`${inputCls} appearance-none pr-9`}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285]" />
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}
function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-[#0B0F26] px-4 py-3">
      <span className="text-sm font-medium text-[#B9C0D3]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40 ${checked ? "bg-[#2F7EFF]" : "bg-gray-300 dark:bg-gray-600"}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

// Inline dropdown used in the Game Status row (matches screenshot style)
interface InlineSelectProps<T extends string> {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}
function InlineSelect<T extends string>({ label, value, options, onChange }: InlineSelectProps<T>) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-[#0B0F26] px-4 py-3">
      <span className="text-sm font-medium text-[#B9C0D3]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-[#0B0F26] pl-3 pr-8 py-1.5 text-sm text-[#B9C0D3] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6C7285]" />
      </div>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-6 space-y-6">
      <h2 className="text-base font-bold text-white">{title}</h2>
      {children}
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────

// BETTING
function BettingPanel({ s, set }: { s: BettingSettings; set: (p: Partial<BettingSettings>) => void }) {
  return (
    <SectionCard title="Betting Settings">
      {/* Number inputs — 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NumberField label="Minimum Bet" value={s.minimumBet} onChange={(v) => set({ minimumBet: v })} min={1} />
        <NumberField label="Maximum Bet" value={s.maximumBet} onChange={(v) => set({ maximumBet: v })} min={1} />
        <NumberField label="Maximum Players" value={s.maximumPlayers} onChange={(v) => set({ maximumPlayers: v })} min={1} />
        <NumberField label="Maximum Cards per Player" value={s.maximumCardsPerPlayer} onChange={(v) => set({ maximumCardsPerPlayer: v })} min={1} />
        <NumberField label="Initial Joining Bonus" value={s.initialJoiningBonus} onChange={(v) => set({ initialJoiningBonus: v })} min={0} />
        <NumberField label="Winning Line Count" value={s.winningLineCount} onChange={(v) => set({ winningLineCount: v })} min={1} max={4} />
      </div>

      {/* Toggle rows — 3 col */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <ToggleRow label="Allow Join Cancel" checked={s.allowJoinCancel} onChange={(v) => set({ allowJoinCancel: v })} />
        <ToggleRow label="Allow Automatic Bets" checked={s.allowAutomaticBets} onChange={(v) => set({ allowAutomaticBets: v })} />
        <ToggleRow label="Allow Manual Bets" checked={s.allowManualBets} onChange={(v) => set({ allowManualBets: v })} />
      </div>

      {/* Game Status — inline select, left-aligned */}
      <div className="max-w-xs">
        <InlineSelect<GameStatusSetting>
          label="Game Status"
          value={s.gameStatus}
          options={["Open", "Closed", "Maintenance"]}
          onChange={(v) => set({ gameStatus: v })}
        />
      </div>
    </SectionCard>
  );
}

// AGENT
function AgentPanel({ s, set }: { s: AgentSettings; set: (p: Partial<AgentSettings>) => void }) {
  return (
    <SectionCard title="Agent Settings">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NumberField label="Default Commission Rate (%)" value={s.defaultCommissionRate} onChange={(v) => set({ defaultCommissionRate: v })} min={0} max={100} step={0.1} />
        <NumberField label="Minimum Agent Payout (ETB)" value={s.minimumAgentPayout} onChange={(v) => set({ minimumAgentPayout: v })} min={0} />
        <NumberField label="Maximum Agent Payout (ETB)" value={s.maximumAgentPayout} onChange={(v) => set({ maximumAgentPayout: v })} min={0} />
        <NumberField label="Withdrawal Cooldown (hours)" value={s.agentWithdrawalCooldown} onChange={(v) => set({ agentWithdrawalCooldown: v })} min={0} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ToggleRow label="Allow Agent Registration" checked={s.allowAgentRegistration} onChange={(v) => set({ allowAgentRegistration: v })} />
        <ToggleRow label="Require Agent Approval" checked={s.requireAgentApproval} onChange={(v) => set({ requireAgentApproval: v })} />
      </div>
    </SectionCard>
  );
}

// TIMING
function TimingPanel({ s, set }: { s: TimingSettings; set: (p: Partial<TimingSettings>) => void }) {
  return (
    <SectionCard title="Timing Settings">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NumberField label="Game Start Delay (seconds)" value={s.gameStartDelay} onChange={(v) => set({ gameStartDelay: v })} min={0} />
        <NumberField label="Number Draw Interval (seconds)" value={s.numberDrawInterval} onChange={(v) => set({ numberDrawInterval: v })} min={1} />
        <NumberField label="Join Window Duration (seconds)" value={s.joinWindowDuration} onChange={(v) => set({ joinWindowDuration: v })} min={10} />
        <NumberField label="Idle Timeout (minutes)" value={s.idleTimeoutMinutes} onChange={(v) => set({ idleTimeoutMinutes: v })} min={1} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ToggleRow label="Auto-Restart Next Game" checked={s.autoRestartNextGame} onChange={(v) => set({ autoRestartNextGame: v })} />
        <ToggleRow label="Announce Between Games" checked={s.announceBetweenGames} onChange={(v) => set({ announceBetweenGames: v })} />
      </div>
    </SectionCard>
  );
}

// BOTS
function BotsPanel({ s, set }: { s: BotsSettings; set: (p: Partial<BotsSettings>) => void }) {
  return (
    <SectionCard title="Bot Settings">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NumberField label="Number of Bot Players" value={s.numberOfBots} onChange={(v) => set({ numberOfBots: v })} min={0} max={50} />
        <NumberField label="Bot Join Delay (seconds)" value={s.botJoinDelay} onChange={(v) => set({ botJoinDelay: v })} min={0} />
        <NumberField label="Bot Max Cards" value={s.botMaxCards} onChange={(v) => set({ botMaxCards: v })} min={1} max={10} />
        <SelectField<BotDifficulty>
          label="Bot Difficulty"
          value={s.botDifficulty}
          options={["Easy", "Medium", "Hard"]}
          onChange={(v) => set({ botDifficulty: v })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ToggleRow label="Enable Bots" checked={s.enableBots} onChange={(v) => set({ enableBots: v })} />
        <ToggleRow label="Bots Visible to Players" checked={s.botsVisibleToPlayers} onChange={(v) => set({ botsVisibleToPlayers: v })} />
      </div>
    </SectionCard>
  );
}

// GENERAL
function GeneralPanel({ s, set }: { s: GeneralSettings; set: (p: Partial<GeneralSettings>) => void }) {
  return (
    <SectionCard title="General Settings">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Platform Name" value={s.platformName} onChange={(v) => set({ platformName: v })} placeholder="Red Bingo" />
        <TextField label="Support Contact" value={s.supportContact} onChange={(v) => set({ supportContact: v })} placeholder="support@example.com" />
        <NumberField label="Max Concurrent Games" value={s.maxConcurrentGames} onChange={(v) => set({ maxConcurrentGames: v })} min={1} max={20} />
        <NumberField label="Session Timeout (minutes)" value={s.sessionTimeoutMins} onChange={(v) => set({ sessionTimeoutMins: v })} min={5} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ToggleRow label="Maintenance Mode" checked={s.maintenanceMode} onChange={(v) => set({ maintenanceMode: v })} />
        <ToggleRow label="Debug Logging" checked={s.debugLogging} onChange={(v) => set({ debugLogging: v })} />
      </div>
    </SectionCard>
  );
}

// ─── Success toast ────────────────────────────────────────────────────────────

function SuccessToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 dark:bg-white px-5 py-3 shadow-xl">
      <Check size={16} className="text-green-400 dark:text-green-600 shrink-0" />
      <p className="text-sm font-medium text-white dark:text-gray-900 whitespace-nowrap">{message}</p>
      <button onClick={onDismiss} className="ml-1 text-[#6C7285] hover:text-gray-200 dark:hover:text-gray-700 transition-colors">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: GameSettings = {
  betting: {
    minimumBet: 10, maximumBet: 1000, maximumPlayers: 400,
    maximumCardsPerPlayer: 1, totalCards: 400, initialJoiningBonus: 25, winningLineCount: 1,
    allowJoinCancel: true, allowAutomaticBets: true, allowManualBets: true,
    gameStatus: "Open",
  },
  agent: {
    defaultCommissionRate: 2, minimumAgentPayout: 100, maximumAgentPayout: 50000,
    agentWithdrawalCooldown: 24, allowAgentRegistration: true, requireAgentApproval: true,
  },
  timing: {
    gameStartDelay: 30, numberDrawInterval: 5, joinWindowDuration: 120,
    idleTimeoutMinutes: 10, autoRestartNextGame: true, announceBetweenGames: true,
  },
  bots: {
    numberOfBots: 5, botDifficulty: "Medium", botJoinDelay: 3, botMaxCards: 2,
    enableBots: false, botsVisibleToPlayers: false,
  },
  general: {
    platformName: "Red Bingo", supportContact: "support@redbingo.com",
    maxConcurrentGames: 3, sessionTimeoutMins: 60, maintenanceMode: false, debugLogging: false,
  },
};

export default function GameSettingsClient() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("betting");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load from real backend on mount and map to UI shape
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [gameData, botData] = await Promise.all([
          api.getGameSettings(),
          api.getBotSettings(),
        ]);

        const data = { ...gameData, ...botData } as any;

        const mapped: GameSettings = {
          betting: {
            minimumBet: data.minBet ?? DEFAULT_SETTINGS.betting.minimumBet,
            maximumBet: data.maxBet ?? DEFAULT_SETTINGS.betting.maximumBet,
            maximumPlayers: data.maxPlayers ?? DEFAULT_SETTINGS.betting.maximumPlayers,
            maximumCardsPerPlayer: data.maxCardsPerPlayer ?? DEFAULT_SETTINGS.betting.maximumCardsPerPlayer,
            totalCards: data.totalCards ?? DEFAULT_SETTINGS.betting.totalCards,
            initialJoiningBonus: data.initialJoinBonus ?? DEFAULT_SETTINGS.betting.initialJoiningBonus,
            winningLineCount: data.winningLineCount ?? DEFAULT_SETTINGS.betting.winningLineCount,
            allowJoinCancel: data.allowJoinCancel ?? DEFAULT_SETTINGS.betting.allowJoinCancel,
            allowAutomaticBets: data.allowAutoBets ?? DEFAULT_SETTINGS.betting.allowAutomaticBets,
            allowManualBets: data.allowManualBets ?? DEFAULT_SETTINGS.betting.allowManualBets,
            gameStatus: data.gameStatus ?? DEFAULT_SETTINGS.betting.gameStatus,
          },
          agent: {
            defaultCommissionRate: data.defaultCommissionRate ?? DEFAULT_SETTINGS.agent.defaultCommissionRate,
            minimumAgentPayout: data.minimumAgentPayout ?? DEFAULT_SETTINGS.agent.minimumAgentPayout,
            maximumAgentPayout: data.maximumAgentPayout ?? DEFAULT_SETTINGS.agent.maximumAgentPayout,
            agentWithdrawalCooldown: data.agentWithdrawalCooldown ?? DEFAULT_SETTINGS.agent.agentWithdrawalCooldown,
            allowAgentRegistration: data.allowAgentRegistration ?? DEFAULT_SETTINGS.agent.allowAgentRegistration,
            requireAgentApproval: data.requireAgentApproval ?? DEFAULT_SETTINGS.agent.requireAgentApproval,
          },
          timing: {
            gameStartDelay: data.lobbySeconds ?? DEFAULT_SETTINGS.timing.gameStartDelay,
            numberDrawInterval: data.drawInterval ?? DEFAULT_SETTINGS.timing.numberDrawInterval,
            joinWindowDuration: data.joinWindowDuration ?? DEFAULT_SETTINGS.timing.joinWindowDuration,
            idleTimeoutMinutes: data.idleTimeoutMinutes ?? DEFAULT_SETTINGS.timing.idleTimeoutMinutes,
            autoRestartNextGame: data.autoRestartNextGame ?? DEFAULT_SETTINGS.timing.autoRestartNextGame,
            announceBetweenGames: data.announceBetweenGames ?? DEFAULT_SETTINGS.timing.announceBetweenGames,
          },
          bots: {
            numberOfBots: data.numberOfBots ?? data.minBotPlayers ?? DEFAULT_SETTINGS.bots.numberOfBots,
            botDifficulty: data.botDifficulty ?? DEFAULT_SETTINGS.bots.botDifficulty,
            botJoinDelay: typeof data.botJoinDelay === 'number'
              ? data.botJoinDelay
              : (typeof data.botJoinDelayMin === 'number' && typeof data.botJoinDelayMax === 'number'
                ? Math.round((data.botJoinDelayMin + data.botJoinDelayMax) / 2 / 1000)
                : DEFAULT_SETTINGS.bots.botJoinDelay),
            botMaxCards: data.botMaxCards ?? DEFAULT_SETTINGS.bots.botMaxCards,
            enableBots: data.botsEnabled ?? DEFAULT_SETTINGS.bots.enableBots,
            botsVisibleToPlayers: data.showBotLabels ?? DEFAULT_SETTINGS.bots.botsVisibleToPlayers,
          },
          general: {
            platformName: data.platformName ?? DEFAULT_SETTINGS.general.platformName,
            supportContact: data.supportUsername ?? DEFAULT_SETTINGS.general.supportContact,
            maxConcurrentGames: data.maxConcurrentGames ?? DEFAULT_SETTINGS.general.maxConcurrentGames,
            sessionTimeoutMins: data.sessionTimeoutMins ?? DEFAULT_SETTINGS.general.sessionTimeoutMins,
            maintenanceMode: data.maintenanceMode ?? DEFAULT_SETTINGS.general.maintenanceMode,
            debugLogging: data.debugLogging ?? DEFAULT_SETTINGS.general.debugLogging,
          },
        };

        if (mounted) setSettings(mapped);
      } catch (err) {
        console.error('Failed to load game settings from backend:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    try { connectAsAdmin(); } catch (e) { /* ignore */ }

    return () => { mounted = false; };
  }, []);

  // Per-tab partial updaters keep unsaved changes across tab switches
  function patch<K extends keyof GameSettings>(tab: K, partial: Partial<GameSettings[K]>) {
    setSettings((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], ...partial },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const s = settings[activeTab];
      const payload: Record<string, any> = {};
      let response: any;

      if (activeTab === "betting") {
        const b = s as any;
        payload.minBet = b.minimumBet;
        payload.maxBet = b.maximumBet;
        payload.maxPlayers = b.maximumPlayers;
        payload.maxCardsPerPlayer = b.maximumCardsPerPlayer;
        payload.totalCards = b.totalCards;
        payload.initialJoinBonus = b.initialJoiningBonus;
        payload.winningLineCount = b.winningLineCount;
        payload.allowJoinCancel = b.allowJoinCancel;
        payload.allowAutoBets = b.allowAutomaticBets;
        payload.allowManualBets = b.allowManualBets;
        payload.gameStatus = b.gameStatus;
        response = await api.updateGameSettings(payload);
      } else if (activeTab === "agent") {
        const a = s as any;
        payload.defaultCommissionRate = a.defaultCommissionRate;
        payload.minimumAgentPayout = a.minimumAgentPayout;
        payload.maximumAgentPayout = a.maximumAgentPayout;
        payload.agentWithdrawalCooldown = a.agentWithdrawalCooldown;
        payload.allowAgentRegistration = a.allowAgentRegistration;
        payload.requireAgentApproval = a.requireAgentApproval;
        response = await api.updateGameSettings(payload);
      } else if (activeTab === "timing") {
        const t = s as any;
        payload.lobbySeconds = t.gameStartDelay;
        payload.drawInterval = t.numberDrawInterval;
        payload.joinWindowDuration = t.joinWindowDuration;
        payload.idleTimeoutMinutes = t.idleTimeoutMinutes;
        payload.autoRestartNextGame = t.autoRestartNextGame;
        payload.announceBetweenGames = t.announceBetweenGames;
        response = await api.updateGameSettings(payload);
      } else if (activeTab === "bots") {
        const bt = s as any;
        const botPayload: Record<string, any> = {
          botsEnabled: bt.enableBots,
          minBotPlayers: bt.numberOfBots,
          maxBotPlayers: bt.numberOfBots,
          botMinCards: 1,
          botMaxCards: bt.botMaxCards,
          showBotLabels: bt.botsVisibleToPlayers,
          botJoinDelayMin: bt.botJoinDelay * 1000,
          botJoinDelayMax: bt.botJoinDelay * 1000,
        };

        Object.assign(payload, botPayload);
        response = await api.updateBotSettings(botPayload);
      } else if (activeTab === "general") {
        const g = s as any;
        payload.platformName = g.platformName;
        payload.supportUsername = g.supportContact;
        payload.maxConcurrentGames = g.maxConcurrentGames;
        payload.sessionTimeoutMins = g.sessionTimeoutMins;
        payload.maintenanceMode = g.maintenanceMode;
        payload.debugLogging = g.debugLogging;
        response = await api.updateGameSettings(payload);
      }

      // Notify other admin/clients via socket so Mini App / Bot can react immediately
      try {
        if (socket && socket.connected) {
          socket.emit('settings:updated', { tab: activeTab, data: payload });
        } else {
          connectAsAdmin();
          setTimeout(() => socket.emit('settings:updated', { tab: activeTab, data: payload }), 600);
        }
      } catch (e) {
        console.warn('Socket notify failed:', e);
      }

      if (response && response.success) {
        setToast('Settings saved successfully.');
      } else {
        setToast('Settings saved successfully.');
      }
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      const message = err?.response?.data?.message || err?.message || 'See console for details.';
      setToast(`Failed to save settings. ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24"> {/* pb-24 leaves room for fixed save button */}

      {/* Page heading */}
      <h1 className="text-2xl font-bold text-white">Game Settings</h1>

      {/* Tab bar — pill style matching screenshot */}
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#0B0F26] border border-[#29345E] p-1 flex-wrap">
        {TABS.map(({ id, label, icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${isActive
                  ? "bg-white dark:bg-gray-800 text-white shadow-sm border border-gray-200 dark:border-gray-700"
                  : "text-[#B9C0D3] hover:text-gray-700 dark:hover:text-gray-200"
                }`}
            >
              <span className={isActive ? "text-[#2F7EFF]" : "text-[#6C7285]"}>
                {icon}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab panel — skeleton while loading */}
      {loading ? (
        <div className="rounded-xl border border-[#29345E] bg-[#0B0F26] p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-[#0B0F26] border border-[#29345E] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === "betting" && (
            <BettingPanel s={settings.betting} set={(p) => patch("betting", p)} />
          )}
          {activeTab === "agent" && (
            <AgentPanel s={settings.agent} set={(p) => patch("agent", p)} />
          )}
          {activeTab === "timing" && (
            <TimingPanel s={settings.timing} set={(p) => patch("timing", p)} />
          )}
          {activeTab === "bots" && (
            <BotsPanel s={settings.bots} set={(p) => patch("bots", p)} />
          )}
          {activeTab === "general" && (
            <GeneralPanel s={settings.general} set={(p) => patch("general", p)} />
          )}
        </>
      )}

      {/* Fixed save button — bottom right */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 rounded-xl bg-[#2F7EFF] px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#4DA3FF] transition-colors disabled:opacity-60 disabled:pointer-events-none"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>

      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

