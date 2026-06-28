import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from '../core/tween';
import type { AudioBus } from '../core/AudioBus';

/**
 * A small round, global sound on/off toggle with a code-drawn speaker glyph (no
 * PNG asset — it's a UI control, not game art). Center origin; position by center
 * point. Reflects and flips `AudioBus.isMuted` (which persists to localStorage),
 * so the same control reads consistently on every screen. Hover/press give the
 * same scale pop as GearButton.
 *
 * Glyph: a speaker with two sound-wave arcs when audible; the waves are replaced
 * by a red slash when muted — the universal "no sound" icon.
 */
export class MuteButton extends Container {
  private bg = new Graphics();
  private glyph = new Graphics();
  private readonly r: number;
  private readonly audio: AudioBus;
  private pressed = false;
  private scaleTween?: { stop(): void };

  constructor(audio: AudioBus, diameter: number) {
    super();
    this.audio = audio;
    this.r = diameter / 2;
    this.addChild(this.bg, this.glyph);
    this.drawBg();
    this.drawGlyph();

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-this.r, -this.r, diameter, diameter);

    this.on('pointerover', () => this.popTo(1.08));
    this.on('pointerout', () => {
      this.pressed = false;
      this.popTo(1);
    });
    this.on('pointerdown', () => {
      this.pressed = true;
      this.popTo(0.94);
    });
    this.on('pointerup', () => {
      if (this.pressed) {
        this.pressed = false;
        this.popTo(1.08);
        this.toggle();
      }
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.popTo(1);
    });
  }

  /** Re-read the shared mute state (e.g. after the settings panel changes it). */
  refresh(): void {
    this.drawGlyph();
  }

  private toggle(): void {
    this.audio.toggleMute();
    // Click is on the UI bus: muted -> master gain is 0 so it's silent (correct);
    // unmuted -> the player hears the toggle land. Played AFTER the toggle so it
    // confirms an unmute (the global tap sound fired on pointerdown while still
    // muted, i.e. silent); on mute this post-toggle click is itself silenced.
    this.audio.playSfx('sfx_click_1');
    this.drawGlyph();
  }

  private drawBg(): void {
    const r = this.r;
    this.bg.clear();
    this.bg
      .circle(0, 0, r)
      .fill({ color: COLORS.metalMid, alpha: 0.96 })
      .stroke({ width: 4, color: COLORS.brass });
    this.bg.circle(0, 0, r * 0.55).fill({ color: COLORS.white, alpha: 0.05 });
  }

  private drawGlyph(): void {
    const r = this.r;
    const muted = this.audio.isMuted;
    this.glyph.clear();

    // Speaker (body + cone), nudged left so the waves/slash have room on the right.
    const ox = -r * 0.12;
    const speaker = [
      ox - 0.42 * r, -0.17 * r,
      ox - 0.14 * r, -0.17 * r,
      ox + 0.16 * r, -0.44 * r,
      ox + 0.16 * r, 0.44 * r,
      ox - 0.14 * r, 0.17 * r,
      ox - 0.42 * r, 0.17 * r,
    ];
    this.glyph.poly(speaker).fill({ color: muted ? COLORS.textMuted : COLORS.brassLight });

    if (muted) {
      // Red slash across the whole glyph — the universal "sound off" mark.
      const a = 0.5 * r;
      this.glyph
        .moveTo(-a, -a)
        .lineTo(a, a)
        .stroke({ width: r * 0.34, color: COLORS.black, alpha: 0.55, cap: 'round' });
      this.glyph
        .moveTo(-a, -a)
        .lineTo(a, a)
        .stroke({ width: r * 0.2, color: COLORS.energyDanger, cap: 'round' });
    } else {
      // Two sound-wave arcs emanating from the cone front.
      const cx = ox + 0.16 * r;
      const a0 = -0.85;
      const a1 = 0.85;
      const wave = (rad: number) => {
        this.glyph
          .moveTo(cx + Math.cos(a0) * rad, Math.sin(a0) * rad)
          .arc(cx, 0, rad, a0, a1)
          .stroke({ width: r * 0.12, color: COLORS.brassLight, cap: 'round' });
      };
      wave(0.34 * r);
      wave(0.58 * r);
    }
  }

  private popTo(scale: number): void {
    const from = this.scale.x;
    this.scaleTween?.stop();
    this.scaleTween = tween({
      duration: 0.14,
      easing: Easings.outBack,
      onUpdate: (e) => {
        if (this.destroyed) return;
        this.scale.set(from + (scale - from) * e);
      },
    });
  }
}
