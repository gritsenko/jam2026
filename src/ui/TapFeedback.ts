import { Container, Graphics } from 'pixi.js';
import { COLORS } from '../theme';
import { Easings, lerp, tween } from '../core/tween';
import type { AudioBus } from '../core/AudioBus';

/**
 * Global, app-wide tap feedback: a click sound on every pointer press and a
 * soft expanding ring ripple at the touch point for short taps.
 *
 * Wired once at boot (see Game.ts) on top-level `window` listeners so it fires
 * for any interaction regardless of what Pixi object is underneath — the same
 * approach AudioBus uses to unlock the AudioContext. The ripple layer is added
 * to the overlay root in raw screen pixels (stage coordinates == CSS pixels,
 * since autoDensity scales the canvas, not the stage), so positioning is just
 * the pointer's client coordinates minus the canvas offset.
 *
 * Short-tap gate: the ripple only fires when the press is released quickly with
 * minimal movement, so deliberate drags (picking up / dragging cards, sliders,
 * swipes) don't leave a ripple trail. The sound, by contrast, plays on every
 * press — "any tap" — for immediate tactile feedback.
 */

/** Max press duration (ms) and travel (CSS px) for a press to count as a tap. */
const TAP_MAX_MS = 300;
const TAP_MAX_DIST = 14;

const RIPPLE_DURATION = 0.45;
const RIPPLE_START_R = 6;
const RIPPLE_END_R = 58;

interface TapFeedbackOptions {
  /** Audio key for the per-tap click (must exist in the audio manifest). */
  readonly soundKey?: string;
  /** Ripple ring color (defaults to the energy-glow accent). */
  readonly color?: number;
}

interface PointerDown {
  x: number;
  y: number;
  t: number;
}

export class TapFeedback {
  private readonly layer = new Container();
  private readonly downs = new Map<number, PointerDown>();
  private readonly soundKey: string;
  private readonly color: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    parent: Container,
    private readonly audio: AudioBus,
    opts?: TapFeedbackOptions,
  ) {
    this.soundKey = opts?.soundKey ?? 'sfx_click_1';
    this.color = opts?.color ?? COLORS.synergy;
    // The ripple layer is purely decorative — never let it intercept input.
    this.layer.eventMode = 'none';
    parent.addChild(this.layer);

    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onCancel, { passive: true });
  }

  private onDown = (e: PointerEvent): void => {
    // Primary button only (button 0 for mouse; touch / pen report 0 too) — a
    // right/middle click shouldn't read as a tap.
    if (e.button !== 0) return;
    this.audio.playSfx(this.soundKey);
    this.downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  };

  private onUp = (e: PointerEvent): void => {
    const down = this.downs.get(e.pointerId);
    if (!down) return;
    this.downs.delete(e.pointerId);
    const dt = performance.now() - down.t;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (dt <= TAP_MAX_MS && dist <= TAP_MAX_DIST) this.spawnRipple(down.x, down.y);
  };

  private onCancel = (e: PointerEvent): void => {
    this.downs.delete(e.pointerId);
  };

  private spawnRipple(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ring = new Graphics();
    ring.position.set(x, y);
    this.layer.addChild(ring);
    tween({
      duration: RIPPLE_DURATION,
      easing: Easings.outCubic,
      onUpdate: (e) => {
        if (ring.destroyed) return;
        const r = lerp(RIPPLE_START_R, RIPPLE_END_R, e);
        const fade = 1 - e;
        ring.clear();
        ring.circle(0, 0, r).fill({ color: this.color, alpha: 0.12 * fade });
        ring.circle(0, 0, r).stroke({ width: 2.5, color: this.color, alpha: 0.55 * fade });
      },
      onComplete: () => {
        if (!ring.destroyed) ring.destroy();
      },
    });
  }

  /** Detach listeners and drop the ripple layer (the app lives for the session,
   *  so this is only here for completeness / hot-reload hygiene). */
  destroy(): void {
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    this.layer.destroy({ children: true });
  }
}
