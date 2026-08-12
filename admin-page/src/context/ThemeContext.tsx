"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ThemeMode } from "@/types";

// ─── Shape ───────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** The user's saved preference: "light" | "dark" | "system" */
  mode: ThemeMode;
  /** Whether the UI is actually dark right now (resolved after system check) */
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "rb_theme";

// ─── Helper — apply/remove "dark" class on <html> ────────────────────────────

function applyDark(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode,   setModeState] = useState<ThemeMode>("system");
  const [isDark, setIsDark]    = useState(false);

  // Resolve whether we're actually dark given a mode + optional system pref
  function resolve(m: ThemeMode, systemDark: boolean): boolean {
    if (m === "dark")   return true;
    if (m === "light")  return false;
    return systemDark;
  }

  // Bootstrap: read saved preference + current system preference
  useEffect(() => {
    const saved  = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
    const mq     = window.matchMedia("(prefers-color-scheme: dark)");
    const dark   = resolve(saved, mq.matches);

    setModeState(saved);
    setIsDark(dark);
    applyDark(dark);

    // Listen for OS-level changes (only relevant when mode === "system")
    function handleSystemChange(e: MediaQueryListEvent) {
      setModeState((current) => {
        if (current === "system") {
          setIsDark(e.matches);
          applyDark(e.matches);
        }
        return current;
      });
    }

    mq.addEventListener("change", handleSystemChange);
    return () => mq.removeEventListener("change", handleSystemChange);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    const mq   = window.matchMedia("(prefers-color-scheme: dark)");
    const dark = resolve(m, mq.matches);

    localStorage.setItem(STORAGE_KEY, m);
    setModeState(m);
    setIsDark(dark);
    applyDark(dark);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
