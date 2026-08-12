import React from 'react';
import {
  ACCENT_BLUE,
  ACCENT_AMBER,
  BG_PAGE,
  TEXT_SECONDARY,
  TEXT_ON_DARK,
} from '../lib/theme';

/**
 * LoadingScreen — Smart Bingo branded splash screen.
 * Displayed while the lobby is loading initial data.
 */
export default function LoadingScreen() {
  return (
    <div
      className="flex h-screen flex-col items-center justify-between py-14 text-center select-none"
      style={{ background: `linear-gradient(180deg, ${BG_PAGE} 0%, #EFF6FF 100%)` }}
    >
      {/* Top spacer */}
      <div />

      {/* Brand block */}
      <div className="flex flex-col items-center gap-5">
        {/* Logo mark */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-3xl"
          style={{
            background: `linear-gradient(135deg, ${ACCENT_BLUE} 0%, #1D4ED8 100%)`,
            boxShadow: `0 0 48px rgba(30,58,138,0.25), 0 8px 32px rgba(0,0,0,0.10)`,
          }}
        >
          <span
            className="font-black leading-none"
            style={{ fontSize: 40, color: TEXT_ON_DARK, letterSpacing: '-2px', textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          >
            S
          </span>
        </div>

        {/* Name + tagline */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            className="font-extrabold tracking-tight leading-none"
            style={{ fontSize: 34, color: ACCENT_BLUE, letterSpacing: '-0.5px' }}
          >
            Smart Bingo
          </h1>
          <p
            className="text-sm font-semibold tracking-wide uppercase"
            style={{ color: ACCENT_AMBER, letterSpacing: '0.12em' }}
          >
            Play Smart, Win Big!
          </p>
        </div>

        {/* Animated loading dots */}
        <div className="flex items-center gap-2 mt-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block rounded-full"
              style={{
                width: 7,
                height: 7,
                backgroundColor: ACCENT_BLUE,
                opacity: 0.9,
                animation: `sb-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Footer handle */}
      <p
        className="text-xs font-medium"
        style={{ color: TEXT_SECONDARY }}
      >
        @smartbingobot
      </p>

      {/* Keyframe injected inline */}
      <style>{`
        @keyframes sb-pulse {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.35; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
