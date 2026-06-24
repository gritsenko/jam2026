import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from '../core/tween';

/**
 * A small round "settings" button with a code-drawn gear glyph (no PNG asset —
 * this is a UI control, not game art). Center origin; position by center point.
 * Hover/press give the same scale pop as Button.
 */
export class GearButton extends Container {
  private bg = new Graphics();
  private gear = new Graphics();
  private readonly r: number;
  private pressed = false;
  private scaleTween?: { stop(): void };

  constructor(diameter: number, onClick: () => void) {
    super();
    this.r = diameter / 2;
    this.addChild(this.bg, this.gear);
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

    // Gear glyph: a castellated ring + hub, with a faked center hole.
    const teeth = 8;
    const step = (Math.PI * 2) / teeth;
    const rOut = r * 0.62;
    const rIn = r * 0.46;
    const pts: number[] = [];
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const a1 = a0 + step * 0.5;
      const a2 = a0 + step;
      pts.push(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
      pts.push(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
      pts.push(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
      pts.push(Math.cos(a2) * rIn, Math.sin(a2) * rIn);
    }
    this.gear.clear();
    this.gear.poly(pts).fill({ color: COLORS.brassLight });
    this.gear.circle(0, 0, rIn * 0.95).fill({ color: COLORS.brassLight });
    this.gear.circle(0, 0, r * 0.2).fill({ color: COLORS.metalMid });
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
