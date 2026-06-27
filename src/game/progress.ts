import type { LevelState } from '../config/types';
import { LEVEL_ORDER, starsForClear } from '../config/progression';

/**
 * Persistent meta-campaign progress (docs/done/progression-and-tech-tree.md §7/§8).
 *
 * The single source of truth for what the player has unlocked: which levels are
 * cleared (which gates the next level and grants permanent tower/mechanic
 * unlocks), best stars per level, and the Admin override. Backed by
 * localStorage; gracefully no-ops where storage is unavailable.
 *
 * Admin mode (see {@link setAdmin}) unlocks every level so any level can be
 * reached and tested — it only affects level *availability*, never the per-level
 * tower roster (that is fixed by the level's place in the ladder, see
 * progression.unlockedTowersForLevel) and never combat balance.
 */

const STORAGE_KEY = 'sgtd.progress.v1';

interface ProgressData {
  /** Ids of cleared levels. */
  cleared: string[];
  /** Best stars (0..3) earned per level id. */
  stars: Record<string, number>;
  /** Admin override: all levels open (availability only). */
  admin: boolean;
  /** Test flag: tower sell enabled (admin toggle only). */
  sellEnabled: boolean;
  /** Test flag: burn placed towers in Reactor (admin toggle only). */
  burnFieldEnabled: boolean;
  /** Ids of tutorial lessons already shown (docs/done/tutorial-modals.md §4). */
  seenTutorials: string[];
  /**
   * Ids of story beats already shown (cutscenes + dialogue scripts, see
   * config/dialogue.ts / config/cutscenes.ts). Mirrors {@link seenTutorials}: a
   * beat plays the first time it's reached and is then skipped on replays unless
   * Admin mode is on (which re-plays everything, so story can be re-checked).
   */
  seenStory: string[];
}

function fresh(): ProgressData {
  return { cleared: [], stars: {}, admin: false, sellEnabled: false, burnFieldEnabled: false, seenTutorials: [], seenStory: [] };
}

function read(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<ProgressData>;
    return {
      cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((x) => typeof x === 'string') : [],
      stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
      admin: parsed.admin === true,
      sellEnabled: parsed.sellEnabled === true,
      burnFieldEnabled: parsed.burnFieldEnabled === true,
      // Soft migration: old saves without the field just get an empty list (their
      // tutorials will show once, which is fine).
      seenTutorials: Array.isArray(parsed.seenTutorials)
        ? parsed.seenTutorials.filter((s) => typeof s === 'string')
        : [],
      seenStory: Array.isArray(parsed.seenStory)
        ? parsed.seenStory.filter((s) => typeof s === 'string')
        : [],
    };
  } catch {
    return fresh();
  }
}

/** In-memory cache; loaded once and written through on every mutation. */
let state: ProgressData = read();

function write(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, headless) — keep the in-memory copy.
  }
}

/** True when Admin mode is on (all levels open, full roster). */
export function isAdmin(): boolean {
  return state.admin;
}

/** Toggle Admin mode (persists). */
export function setAdmin(on: boolean): void {
  state.admin = on;
  write();
}

/** True when tower sell is enabled (admin test toggle). */
export function isSellEnabled(): boolean {
  return state.sellEnabled;
}

/** Toggle tower sell (persists; only meaningful when admin enables the feature). */
export function setSellEnabled(on: boolean): void {
  state.sellEnabled = on;
  write();
}

/** True when field-tower Reactor burn is enabled (admin test toggle). */
export function isBurnFieldEnabled(): boolean {
  return state.burnFieldEnabled;
}

/** Toggle field-tower Reactor burn (persists). */
export function setBurnFieldEnabled(on: boolean): void {
  state.burnFieldEnabled = on;
  write();
}

/**
 * Session-only debug flag: suppresses telemetry while on. Never persisted — always
 * starts false on load and resets when Admin is turned off.
 */
let debugMode = false;

export function isDebugMode(): boolean {
  return debugMode;
}

export function setDebugMode(on: boolean): void {
  debugMode = on;
}

/** Best stars (0..3) recorded for a level. */
export function starsFor(levelId: string): number {
  return state.stars[levelId] ?? 0;
}

/** Whether a level has ever been cleared (independent of Admin mode). */
export function isCleared(levelId: string): boolean {
  return state.cleared.includes(levelId);
}

/**
 * Display state of a level node. Admin opens everything; otherwise the first
 * level is always available and each further level unlocks once the previous is
 * cleared (linear gate, §2).
 */
export function levelState(levelId: string): LevelState {
  const cleared = state.cleared.includes(levelId);
  if (state.admin) return cleared ? 'cleared' : 'available';
  if (cleared) return 'cleared';
  const idx = LEVEL_ORDER.indexOf(levelId);
  if (idx <= 0) return 'available';
  const prev = LEVEL_ORDER[idx - 1]!;
  return state.cleared.includes(prev) ? 'available' : 'locked';
}

/**
 * Record a level clear: mark it cleared (unlocks the next level) and keep the
 * best star count. `coreHp`/`coreMax` decide the stars (§4). Returns the stars
 * awarded this run.
 */
export function recordClear(levelId: string, coreHp: number, coreMax: number): number {
  const stars = starsForClear(coreHp, coreMax);
  if (!state.cleared.includes(levelId)) state.cleared.push(levelId);
  state.stars[levelId] = Math.max(state.stars[levelId] ?? 0, stars);
  write();
  return stars;
}

/** Ids of tutorial lessons the player has already been shown. */
export function seenTutorials(): ReadonlySet<string> {
  return new Set(state.seenTutorials);
}

/** Mark a batch of tutorial lesson ids as shown (persists), so they never repeat. */
export function markTutorialsSeen(ids: Iterable<string>): void {
  let changed = false;
  for (const id of ids) {
    if (!state.seenTutorials.includes(id)) {
      state.seenTutorials.push(id);
      changed = true;
    }
  }
  if (changed) write();
}

/**
 * Whether a story beat (cutscene / dialogue script id) should play now: true the
 * first time it's reached, and always in Admin mode (so story can be re-checked
 * by jumping around). Mirrors the tutorial gate.
 */
export function shouldPlayStory(id: string): boolean {
  return state.admin || !state.seenStory.includes(id);
}

/** True once a story beat has been shown at least once (ignores Admin). */
export function hasSeenStory(id: string): boolean {
  return state.seenStory.includes(id);
}

/** Mark a story beat as shown (persists), so it never auto-plays again. */
export function markStorySeen(id: string): void {
  if (!state.seenStory.includes(id)) {
    state.seenStory.push(id);
    write();
  }
}
