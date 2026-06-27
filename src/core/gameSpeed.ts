/**
 * Global gameplay time-scale. A single multiplier the player can tune in the
 * settings panel; it scales the *battle simulation and its coupled visuals*
 * (enemy movement, projectile flight, turret rotation, fire cooldowns and every
 * buff/debuff/status duration) — but NOT UI chrome (counters, toasts, panels).
 *
 * The shipped default runs the game {@link BASELINE_DIVISOR}× slower than the raw
 * sim baseline: the player-facing value defaults to {@link SPEED_DEFAULT} (shown
 * as "1.0×"), while the time-scale actually fed to the sim is `value / 1.5`.
 * So 1.0× is a calm default, 3.0× the cap, 0.5× the floor (half the default).
 *
 * Unlike the language choice this applies live (no reload): BattleScene reads
 * {@link gameSpeedScale} every frame, the settings stepper writes it. Persisted
 * to localStorage; gracefully no-ops where storage is unavailable.
 */

const STORAGE_KEY = 'sgtd.gameSpeed';

/** Player-facing speed bounds/step (relative to the 1.0× default). */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 3;
export const SPEED_STEP = 0.5;
export const SPEED_DEFAULT = 1;

/** How much slower than the raw sim baseline the 1.0× setting runs. */
const BASELINE_DIVISOR = 1.5;

/** Clamp to [MIN, MAX] and snap to the 0.5× grid. */
function normalize(v: number): number {
  const snapped = Math.round(v / SPEED_STEP) * SPEED_STEP;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, snapped));
}

/** Read the persisted value (browser only). Returns null if none/unavailable. */
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

let current: number = stored() ?? SPEED_DEFAULT;

/** The player-facing multiplier (0.5 … 3.0, in 0.5 steps). */
export function getGameSpeed(): number {
  return current;
}

/** Persist a chosen speed (snapped/clamped). Applies live — no reload. */
export function setGameSpeed(value: number): number {
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

/** Bump the speed by one ±0.5 step and persist; returns the new value. */
export function stepGameSpeed(dir: -1 | 1): number {
  return setGameSpeed(current + dir * SPEED_STEP);
}

/** The time-scale to multiply gameplay `dt` by this frame. */
export function gameSpeedScale(): number {
  return current / BASELINE_DIVISOR;
}
