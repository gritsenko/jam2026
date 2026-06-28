/**
 * Touch drag-assist preference: whether a lifted card outruns the finger vertically
 * (Block-Blast style, see BattleScene §2 — the card races ahead so the far platform
 * rows are reachable without sliding the thumb all the way up). On by default; the
 * player can switch it off in Settings if 1:1 vertical tracking feels more precise.
 *
 * Touch only — mouse / trackpad / pen always track 1:1 regardless of this flag, and
 * the small bottom-third lift (§3, so the finger never covers the card) stays on
 * either way. Applies live to the next pickup; persisted to localStorage, no-ops
 * where storage is unavailable.
 */

const STORAGE_KEY = 'sgtd.touchDragBoost';

function stored(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return raw === '1' || raw === 'true';
  } catch {
    return null;
  }
}

let enabled: boolean = stored() ?? true;

/** Whether the touch vertical drag-acceleration (§2) is currently active. Default on. */
export function isTouchDragBoostEnabled(): boolean {
  return enabled;
}

/** Persist the toggle; applies live to the next pickup. Returns the new value. */
export function setTouchDragBoostEnabled(on: boolean): boolean {
  enabled = on;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* private mode — keep the in-memory choice for this session */
    }
  }
  return enabled;
}
