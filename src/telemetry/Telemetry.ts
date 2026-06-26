// Telemetry facade. The rest of the game calls only Telemetry.track(...) /
// .setContext(...) / .init(). Everything is best-effort and guarded — telemetry
// must never throw into gameplay. Disabled entirely when VITE_TELEMETRY_URL is
// empty or the player opted out. See docs/backlog/analytics-and-backend.md.

import { EVENT_SCHEMA_VERSION } from './events';
import type { EventEnvelope } from './events';
import { getClientId, sessionId, nextSeq, isOptedOut, setOptedOut } from './client';
import * as transport from './transport';
import { activeGameConfigName } from '../data/load';
import { isBurnFieldEnabled, isDebugMode, isSellEnabled } from '../game/progress';

// Injected by Vite `define` at build time (git sha). Guarded for non-Vite contexts.
let balanceVersion = 'dev';
try {
  balanceVersion = __BALANCE_VERSION__;
} catch {
  /* not built by Vite — keep 'dev' */
}

const ctx: { level?: string; wave?: number } = {};
let started = false;

/** Update the rolling context stamped onto subsequent events. A key that is
 *  present (even as undefined) is applied — pass `{ level: undefined }` to clear. */
export function setContext(next: { level?: string; wave?: number }): void {
  if ('level' in next) ctx.level = next.level;
  if ('wave' in next) ctx.wave = next.wave;
}

/** Record an event. No-op when disabled/opted-out; never throws. */
export function track(type: string, props?: Record<string, unknown>): void {
  try {
    if (!transport.enabled() || isOptedOut() || isDebugMode()) return;
    const ev: EventEnvelope = {
      schema: EVENT_SCHEMA_VERSION,
      source: 'user',
      clientId: getClientId(),
      sessionId,
      balanceVersion,
      config: activeGameConfigName,
      ts: Date.now(),
      seq: nextSeq(),
      level: ctx.level,
      wave: ctx.wave,
      sellEnabled: isSellEnabled(),
      burnFieldEnabled: isBurnFieldEnabled(),
      type,
      props,
    };
    transport.enqueue(ev);
  } catch {
    /* telemetry must never affect gameplay */
  }
}

export function flush(): void {
  void transport.flush();
}

/** Opt-out toggle (e.g. from a settings panel). */
export function setEnabled(on: boolean): void {
  setOptedOut(!on);
}

export function isEnabled(): boolean {
  return transport.enabled() && !isOptedOut();
}

/** Call once at boot. Installs lifecycle flushers and emits session_start. */
export function init(): void {
  if (started) return;
  started = true;
  try {
    if (typeof window === 'undefined') return;
    window.addEventListener('visibilitychange', () => {
      const state = document.visibilityState;
      track('visibility_change', { state });
      if (state === 'hidden') transport.flushBeacon();
    });
    window.addEventListener('pagehide', () => {
      track('dropoff', { reason: 'pagehide' });
      transport.flushBeacon();
    });
    track('session_start', {
      screen: { w: window.screen?.width ?? 0, h: window.screen?.height ?? 0 },
      sellEnabled: isSellEnabled(),
      burnFieldEnabled: isBurnFieldEnabled(),
    });
  } catch {
    /* ignore */
  }
}
