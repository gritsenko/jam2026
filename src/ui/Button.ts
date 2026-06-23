import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from '../core/tween';
import { drawPanel, makeText, type TextPreset } from './helpers';

export interface ButtonOptions {
  label: string;
  onClick: () => void;
  width?: number;
  height?: number;
  preset?: TextPreset;
  /** Brass-gold call-to-action vs. quieter steel. */
  primary?: boolean;
  /** Override the label color (defaults to light cream on every button). */
  labelColor?: number | string;
}

/**
 * A themed clickable button. Origin is at its center, so position it by center
 * point. Provides hover/press feedback via a quick scale pop.
 */
export class Button extends Container {
  private bg = new Graphics();
  private w: number;
  private h: number;
  private primary: boolean;
  private pressed = false;
  private scaleTween?: { stop(): void };

  constructor(opts: ButtonOptions) {
    super();
    this.w = opts.width ?? 360;
    this.h = opts.height ?? 96;
    this.primary = opts.primary ?? false;

    this.addChild(this.bg);
    // Every button reads with light cream text (over a black stroke from makeText)
    // for consistent contrast on both brass-primary and steel-secondary fills.
    const label = makeText(opts.label, opts.preset ?? 'title', {
      fill: opts.labelColor ?? COLORS.textBright,
    });
    label.anchor.set(0.5);
    this.addChild(label);

    this.draw();

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-this.w / 2, -this.h / 2, this.w, this.h);

    this.on('pointerover', () => this.popTo(1.04));
    this.on('pointerout', () => {
      this.pressed = false;
      this.popTo(1);
    });
    this.on('pointerdown', () => {
      this.pressed = true;
      this.popTo(0.96);
    });
    this.on('pointerup', () => {
      if (this.pressed) {
        this.pressed = false;
        this.popTo(1.04);
        opts.onClick();
      }
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.popTo(1);
    });
  }

  private draw(): void {
    this.bg.clear();
    drawPanel(this.bg, -this.w / 2, -this.h / 2, this.w, this.h, {
      radius: this.h / 2,
      fill: this.primary ? COLORS.brass : COLORS.metalMid,
      edge: this.primary ? COLORS.gold : COLORS.brass,
      edgeWidth: 5,
      bevel: true,
      rivets: false,
    });
    if (this.primary) {
      this.bg
        .roundRect(-this.w / 2 + 8, -this.h / 2 + 6, this.w - 16, this.h * 0.4, this.h / 2)
        .fill({ color: COLORS.white, alpha: 0.18 });
    }
  }

  private popTo(scale: number): void {
    const from = this.scale.x;
    this.scaleTween?.stop();
    this.scaleTween = tween({
      duration: 0.14,
      easing: Easings.outBack,
      onUpdate: (e) => this.scale.set(from + (scale - from) * e),
    });
  }
}
