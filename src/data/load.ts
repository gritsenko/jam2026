// Resolves and exposes the active GameConfig. Synchronous + eager: `activeGameConfig`
// is computed at module load (before any src/config/*.ts reads it). Selection order:
//   explicit arg  >  ?game_config=  >  localStorage['sgtd.gameConfig']  (browser)
//                 >  GAME_CONFIG env  (Node/tsx)  >  'default'.
// Isomorphic: no import.meta.glob, guards browser vs node access. See config-as-data.md.

import { GAME_CONFIGS, DEFAULT_GAME_CONFIG } from './registry';
import type { GameConfig } from './schema';

const STORAGE_KEY = 'sgtd.gameConfig';

function fromBrowser(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('game_config');
    if (q) return q;
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function fromNode(): string | null {
  if (typeof process === 'undefined') return null;
  return process.env?.GAME_CONFIG ?? null;
}

export function resolveGameConfigName(): string {
  const name = fromBrowser() ?? fromNode() ?? DEFAULT_GAME_CONFIG;
  return name in GAME_CONFIGS ? name : DEFAULT_GAME_CONFIG;
}

/** Get a config by id (explicit). Falls back to default for an unknown id. */
export function loadGameConfig(name: string): GameConfig {
  return GAME_CONFIGS[name] ?? GAME_CONFIGS[DEFAULT_GAME_CONFIG]!;
}

/** Persist config choice in the browser and reload (active config is eager at module load). */
export function persistGameConfigName(name: string): void {
  if (typeof window === 'undefined') return;
  const resolved = name in GAME_CONFIGS ? name : DEFAULT_GAME_CONFIG;
  try {
    window.localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    /* private mode */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('game_config', resolved);
  window.location.assign(url.toString());
}

/** The active config for this load — single source the config layer reads from. */
export const activeGameConfigName: string = resolveGameConfigName();
export const activeGameConfig: GameConfig = loadGameConfig(activeGameConfigName);

// Dev-only integrity check (referential consistency the compiler can't catch).
// Tree-shaken from production builds. Lazy import to avoid a load-time cycle.
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  void import('./validate').then((m) => m.validateGameConfig(activeGameConfig, activeGameConfigName));
}
