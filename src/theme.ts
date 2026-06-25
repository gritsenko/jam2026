/**
 * Central design tokens for Synergy Grid TD.
 *
 * Tuned to docs/visual_refs/new_style.jpg: a flat flash-cartoon (Iron Marines /
 * Kingdom Rush) look — dark dieselpunk metal + a warm base with element-coded
 * energy glows. Tweak values here to re-skin the whole game at once. Colors are
 * PixiJS-friendly hex numbers.
 */

export type ElementId = 'Fire' | 'Water' | 'Electricity' | 'Physical' | 'Energy';

/** Per-element accent colors used for card frames, glows and slot resonance. */
export interface ElementSkin {
  readonly base: number; // frame / primary
  readonly glow: number; // energy beam / emissive
  readonly dark: number; // shaded edge
  readonly label: string;
}

export const ELEMENTS: Record<ElementId, ElementSkin> = {
  Fire: { base: 0xff6b35, glow: 0xff3b1f, dark: 0x8c2a12, label: 'FIRE' },
  Water: { base: 0x36b6ff, glow: 0x6fe0ff, dark: 0x12517f, label: 'FROST' },
  Electricity: { base: 0xb56bff, glow: 0xe2c2ff, dark: 0x4f2a7a, label: 'STORM' },
  Physical: { base: 0xc2b39a, glow: 0xf0e6d2, dark: 0x5c4f3a, label: 'METAL' },
  Energy: { base: 0x58e06a, glow: 0xa8ff9e, dark: 0x1f6e34, label: 'ENERGY' },
};

/** All element ids in table order — for iterating/building per-element lookups. */
export const ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];

/**
 * Asset key for an element's symbol sprite (a bold motif drawn on cards / dots /
 * the info panel so the element reads by shape, not only color). The PNG lives at
 * `assets/sprites/sym_<element>.png`; see src/config/assetManifest.ts.
 */
export const elementSymbolKey = (e: ElementId): string => `sym_${e.toLowerCase()}`;

export const COLORS = {
  // Environment
  bgDeep: 0x0d0705,
  bgCanyon: 0x2a1810,
  bgSand: 0x6b4a2c,
  sandLight: 0xc79a5b,
  vignette: 0x000000,

  // Brass / steel chrome
  metalDark: 0x231d17,
  metalMid: 0x3a2f24,
  metalLight: 0x5a4836,
  brass: 0x8a6a3a,
  brassLight: 0xc79a5b,
  rivet: 0x1a130d,

  // Text
  textBright: 0xf3e6cf,
  textDim: 0xc79a5b,
  textMuted: 0x8a7a5e,
  textDark: 0x1a130d,

  // Resources
  gold: 0xffcf4d,
  crystal: 0x7fd5ff,
  synergy: 0x6fffa8,

  // Energy gauge states (Red Alert vibe)
  energyOk: 0x58e06a,
  energyWarn: 0xffd23f,
  energyDanger: 0xff4a2b,
  energyOverdrive: 0xffcf4d,

  // Feedback
  dropValid: 0x6fffa8,
  dropHover: 0xfff0a8,
  reactor: 0xff6a2b,

  white: 0xffffff,
  black: 0x000000,
} as const;

export const FONTS = {
  /** Chunky display face for titles, wave counter, big numbers. */
  display: '"Lilita One", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  /** Readable body face for card text and labels. */
  body: '"Lilita One", "Segoe UI", Roboto, system-ui, sans-serif',
} as const;

/** Layout reference. Everything is authored in this portrait coordinate space. */
export const DESIGN = {
  width: 1080,
  /** Reference height used to frame the portrait area on wide/landscape screens. */
  height: 1920,
  /** A phone may be taller than the reference; layout flexes between these. */
  minHeight: 1700,
  maxHeight: 2400,
} as const;

export const RADIUS = {
  sm: 10,
  md: 18,
  lg: 28,
  pill: 999,
} as const;

/** Convenience: PixiJS accepts numbers, but text strokes/fills sometimes want strings. */
export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
