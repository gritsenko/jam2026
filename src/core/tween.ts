import { Ticker } from 'pixi.js';

/**
 * Minimal zero-dependency tween, driven by a PixiJS Ticker.
 *
 * We deliberately avoid pulling in a tween library — the brief asks for "pure
 * Pixi + TS", and our needs (fades, pops, slides) are small. Call
 * `setTweenTicker(app.ticker)` once at boot so tweens run on the app clock.
 */

export type Easing = (t: number) => number;

export const Easings = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
} as const;

let defaultTicker: Ticker | null = null;

/** Set once at boot to the application's ticker. */
export function setTweenTicker(t: Ticker): void {
  defaultTicker = t;
}

export interface TweenOptions {
  /** Duration in seconds. */
  duration: number;
  /** Called every frame with the eased 0..1 progress. */
  onUpdate: (eased: number, raw: number) => void;
  onComplete?: () => void;
  easing?: Easing;
  /** Delay in seconds before the tween starts. */
  delay?: number;
  ticker?: Ticker;
}

export interface TweenHandle {
  stop(): void;
  /** Fast-forward to the end and fire onComplete. */
  finish(): void;
}

export function tween(opts: TweenOptions): TweenHandle {
  const { duration, onUpdate, onComplete, easing = Easings.outCubic, delay = 0 } = opts;
  const ticker = opts.ticker ?? defaultTicker ?? Ticker.shared;
  let elapsed = -delay;
  let done = false;

  const finishNow = () => {
    if (done) return;
    done = true;
    ticker.remove(tick);
    onUpdate(easing(1), 1);
    onComplete?.();
  };

  const tick = (t: Ticker) => {
    elapsed += t.deltaMS / 1000;
    if (elapsed < 0) return;
    const raw = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
    onUpdate(easing(raw), raw);
    if (raw >= 1) finishNow();
  };

  ticker.add(tick);
  return {
    stop: () => {
      if (done) return;
      done = true;
      ticker.remove(tick);
    },
    finish: finishNow,
  };
}

/** Linear interpolation helper. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
