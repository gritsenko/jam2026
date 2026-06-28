/**
 * Enemy-speed multiplier — a difficulty dial distinct from the global game-speed
 * tempo ({@link import('./gameSpeed')}). Where game-speed fast-forwards the WHOLE
 * sim (towers included, balance unchanged), this scales ONLY enemy march, so it
 * shifts how much ground enemies cover against a fixed tower DPS — a real
 * difficulty knob. Chosen on the main menu via a 3-way difficulty switch
 * ({@link DIFFICULTY_PRESETS}: Alpha 0.5× / Zoomer 1× / Daddy 1.5×).
 *
 * Applies live: BattleScene reads {@link getEnemySpeed} each frame and feeds it to
 * BattleSim.enemySpeedMult; it stacks on top of the game-speed time-scale.
 * Persisted to localStorage; no-ops where storage is unavailable. Default 1.0×.
 */

const STORAGE_KEY = 'sgtd.enemySpeed';

/** Stepper bounds/step (mirrors the game-speed control: 0.5 … 3.0 in 0.5 steps). */
export const ENEMY_SPEED_MIN = 0.5;
export const ENEMY_SPEED_MAX = 3;
export const ENEMY_SPEED_STEP = 0.5;
export const ENEMY_SPEED_DEFAULT = 1;

/** Clamp to [MIN, MAX] and snap to the 0.5× grid. */
function normalize(v: number): number {
  const snapped = Math.round(v / ENEMY_SPEED_STEP) * ENEMY_SPEED_STEP;
  return Math.min(ENEMY_SPEED_MAX, Math.max(ENEMY_SPEED_MIN, snapped));
}

function stored(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? normalize(v) : null;
  } catch {
    return null;
  }
}

let current: number = stored() ?? ENEMY_SPEED_DEFAULT;

/** The player-facing enemy-speed multiplier (0.5 … 3.0, in 0.5 steps). */
export function getEnemySpeed(): number {
  return current;
}

/** Persist a chosen enemy speed (snapped/clamped). Applies live — no reload. */
export function setEnemySpeed(value: number): number {
  current = normalize(value);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(current));
    } catch {
      /* private mode — keep the in-memory choice for this session */
    }
  }
  return current;
}

/** Bump the enemy speed by one ±0.5 step and persist; returns the new value. */
export function stepEnemySpeed(dir: -1 | 1): number {
  return setEnemySpeed(current + dir * ENEMY_SPEED_STEP);
}

/** One named difficulty tier behind the main-menu switch (enemy-speed preset). */
export interface DifficultyPreset {
  /** Stable id (highlight + telemetry). */
  id: string;
  /** i18n key for the pill caption. */
  labelKey: string;
  /** Enemy-speed multiplier this tier maps to. */
  value: number;
}

/** The three difficulty tiers, easy → hard (left → right in the switch). */
export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  { id: 'alpha', labelKey: 'difficulty.alpha', value: 0.5 },
  { id: 'zoomer', labelKey: 'difficulty.zoomer', value: 1 },
  { id: 'batya', labelKey: 'difficulty.batya', value: 1.5 },
];

/** Id of the preset whose value is closest to the live enemy speed (for highlighting). */
export function getDifficultyId(): string {
  const v = getEnemySpeed();
  let bestId = DIFFICULTY_PRESETS[0]?.id ?? 'zoomer';
  let bestDelta = Infinity;
  for (const p of DIFFICULTY_PRESETS) {
    const d = Math.abs(p.value - v);
    if (d < bestDelta) {
      bestDelta = d;
      bestId = p.id;
    }
  }
  return bestId;
}
