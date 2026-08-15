/**
 * theme.ts — Smart Bingo DARK GAMING theme tokens
 *
 * Deep-space professional gaming palette.
 * Single source of truth for all colors used across the mini-app.
 * Import from here; never hard-code hex values in component files.
 */

// ── Backgrounds ───────────────────────────────────────────────────────────────
export const BG_PAGE       = '#07091A'; // ultra-deep space navy
export const BG_SURFACE    = '#0F1329'; // card surface — deep navy
export const BG_SURFACE_2  = '#161C35'; // secondary surface — slightly lighter
export const BG_INPUT      = '#161C35'; // input / stepper fill

// ── Borders ───────────────────────────────────────────────────────────────────
export const BORDER_LIGHT  = '#232A50'; // subtle glow border
export const BORDER_MEDIUM = '#3A4278'; // medium border

// ── Text ──────────────────────────────────────────────────────────────────────
export const TEXT_PRIMARY   = '#DDE0FF'; // soft lavender-white
export const TEXT_SECONDARY = '#7880BE'; // muted indigo-gray
export const TEXT_MUTED     = '#454C7A'; // very muted blue
export const TEXT_ON_DARK   = '#FFFFFF'; // text on dark/colored surfaces

// ── Brand accents ─────────────────────────────────────────────────────────────
export const ACCENT_BLUE    = '#7C6DFF'; // electric indigo — primary accent
export const ACCENT_BLUE_LT = '#7C6DFF1A'; // transparent indigo tint
export const ACCENT_AMBER   = '#F0B429'; // gold — CTA, highlights, timers
export const ACCENT_AMBER_LT= '#F0B42920'; // transparent gold tint

// ── Card states (lobby grid) ──────────────────────────────────────────────────
export const CARD_AVAILABLE_BG     = '#161C35'; // unclaimed — dark navy
export const CARD_AVAILABLE_BORDER = '#3A4278'; // unclaimed border
export const CARD_AVAILABLE_TEXT   = '#7880BE'; // unclaimed number

export const CARD_MINE_BG          = '#C2410C'; // my card — orange (player's own)
export const CARD_MINE_BORDER      = '#FB923C'; // my card border — bright orange
export const CARD_MINE_TEXT        = '#FFFFFF'; // my card text

export const CARD_OTHER_BG         = '#2563EB'; // claimed by other — blue
export const CARD_OTHER_BORDER     = '#60A5FA'; // claimed by other border
export const CARD_OTHER_TEXT       = '#FFFFFF'; // claimed by other text

export const CARD_SELECTED_BG      = '#2D1F00'; // selected in cart — dark gold
export const CARD_SELECTED_BORDER  = '#F0B429'; // selected border — gold
export const CARD_SELECTED_TEXT    = '#F0B429'; // selected text — gold

// ── BINGO calling board — professional dark-game palette ─────────────────────
export const BOARD_BG       = '#090D1E'; // darkest board background
export const BOARD_PANEL_BG = '#0F1329'; // ball panel bg (matches BG_SURFACE)
export const BOARD_CELL_BG  = '#161C35'; // uncalled cell — dark navy
export const BOARD_CELL_OUT = '#3A4278'; // uncalled cell border

export const LETTER_COLORS: Record<'B' | 'I' | 'N' | 'G' | 'O', { bg: string; text: string; border: string; glow: string }> = {
  B: { bg: '#3D8BFF', text: '#FFFFFF', border: '#6FACFF', glow: 'rgba(61,139,255,0.75)' },
  I: { bg: '#00C896', text: '#FFFFFF', border: '#2DE8B4', glow: 'rgba(0,200,150,0.75)' },
  N: { bg: '#9B6DFF', text: '#FFFFFF', border: '#BC9AFF', glow: 'rgba(155,109,255,0.75)' },
  G: { bg: '#FF8C3A', text: '#FFFFFF', border: '#FFB570', glow: 'rgba(255,140,58,0.75)' },
  O: { bg: '#FF4060', text: '#FFFFFF', border: '#FF7590', glow: 'rgba(255,64,96,0.75)' },
};

// ── Status / feedback ─────────────────────────────────────────────────────────
export const COLOR_SUCCESS_BG   = '#052E16';
export const COLOR_SUCCESS_TEXT = '#4ADE80';
export const COLOR_ERROR_BG     = '#1F0707';
export const COLOR_ERROR_TEXT   = '#F87171';
export const COLOR_WARNING_BG   = '#1C1200';
export const COLOR_WARNING_TEXT = '#FBBF24';
