import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from '../core/tween';

/**
 * A small round "close / skip" button with a code-drawn ✕ glyph (no PNG asset —
 * this is a UI control, not game art). Center origin; position by center point.
 * Hover/press give the same scale pop as {@link GearButton}.
 */
export class CloseButton extends Container {
  private bg = new Graphics();
  private cross = new Graphics();
  private readonly r: number;
  private pressed = false;
  private scaleTween?: { stop(): void };

  constructor(diameter: number, onClick: () => void) {
    super();
    this.r = diameter / 2;
    this.addChild(this.bg, this.cross);
    this.draw();

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
        onClick();
      }
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.popTo(1);
    });
  }

  private draw(): void {
    const r = this.r;
    this.bg.clear();
    this.bg
      .circle(0, 0, r)
      .fill({ color: COLORS.metalMid, alpha: 0.96 })
      .stroke({ width: 4, color: COLORS.brass });
    this.bg.circle(0, 0, r * 0.55).fill({ color: COLORS.white, alpha: 0.05 });

    // ✕ glyph: two diagonal strokes meeting at the center.
    const a = r * 0.42;
    this.cross.clear();
    this.cross
      .moveTo(-a, -a)
      .lineTo(a, a)
      .moveTo(a, -a)
      .lineTo(-a, a)
      .stroke({ width: Math.max(4, r * 0.16), color: COLORS.brassLight, cap: 'round' });
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
