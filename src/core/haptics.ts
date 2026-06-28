/**
 * Light tap haptics — a buzz on single taps (buttons, hand cards, placed towers).
 *
 * iOS Safari has no Web Vibration API, but it *does* play a subtle "selection"
 * tick whenever a `<input switch type="checkbox">` toggles inside a user gesture.
 * That's the hack from github.com/tijnjh/ios-haptics. Their public API attaches a
 * hidden switch as a child of a real DOM button so the native tap lands on it —
 * but our whole game renders into a single Pixi `<canvas>`, so there are no
 * per-button DOM nodes to attach to. Instead we keep one hidden switch in the
 * document and toggle it programmatically from the Pixi pointer handlers: since
 * those run synchronously inside the real DOM pointer event, iOS still counts it
 * as user activation and fires the tick — and we get to choose *exactly* which
 * taps buzz.
 *
 * Elsewhere (Android etc.) we fall back to the real Vibration API. On platforms
 * with neither, {@link haptic} is a silent no-op. SSR-safe and persisted on/off.
 */

const STORAGE_KEY = 'sgtd.haptics';

/** Vibration-API fallback pulse, ms — a short tick to echo the iOS selection feel. */
const TAP_MS = 8;

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as desktop Safari ("MacIntel") but has a touch screen.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function storedEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = storedEnabled();
let switchEl: HTMLInputElement | null = null;
// null = not yet probed; once probed, true on iOS (use the switch trick) or false.
let useSwitch: boolean | null = null;

/** Lazily build (once) the hidden switch that iOS ticks on toggle. */
function ensureSwitch(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null;
  if (switchEl) return switchEl;
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.setAttribute('switch', ''); // iOS-only attribute that makes it a haptic toggle
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  // Visually gone but still laid out (display:none can suppress the tick) and
  // never a pointer target itself — we only ever toggle it from code.
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    margin: '0',
    opacity: '0',
    pointerEvents: 'none',
    clipPath: 'inset(0 round 999px)',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  switchEl = el;
  return el;
}

/** Is tap haptics currently on? */
export function isHapticsEnabled(): boolean {
  return enabled;
}

/** Turn tap haptics on/off and persist the choice. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode — keep the in-memory choice for this session */
  }
}

/**
 * Fire a single light haptic tick. MUST be called from inside a real pointer
 * handler (a tap on a button / card / tower) so iOS counts it as user
 * activation. No-op when disabled or unsupported.
 */
export function haptic(): void {
  if (!enabled) return;
  if (useSwitch === null) useSwitch = isIos();
  if (useSwitch) {
    ensureSwitch()?.click();
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(TAP_MS);
  }
}
