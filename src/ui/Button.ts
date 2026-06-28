import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from '../core/tween';
import { haptic } from '../core/haptics';
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
  private labelText: Text;
  private w: number;
  private h: number;
  private primary: boolean;
  private pressed = false;
  private enabled = true;
  private scaleTween?: { stop(): void };

  constructor(opts: ButtonOptions) {
    super();
    this.w = opts.width ?? 360;
    this.h = opts.height ?? 96;
    this.primary = opts.primary ?? false;

    this.addChild(this.bg);
    // Every button reads with light cream text (over a black stroke from makeText)
    // for consistent contrast on both brass-primary and steel-secondary fills.
    this.labelText = makeText(opts.label, opts.preset ?? 'title', {
      fill: opts.labelColor ?? COLORS.textBright,
    });
    this.labelText.anchor.set(0.5);
    this.addChild(this.labelText);

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
        if (this.enabled) {
          haptic(); // tap tick — runs inside the real pointer gesture (iOS-safe)
          opts.onClick();
        }
      }
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.popTo(1);
    });
  }

  /** Replace the button caption (e.g. a Reroll button showing its live cost). */
  setLabel(text: string): void {
    this.labelText.text = text;
  }

  /**
   * Live-toggle the brass-primary highlight (segmented selectors that switch
   * without a page reload, e.g. the difficulty picker). No-op if unchanged.
   */
  setPrimary(on: boolean): void {
    if (this.primary === on) return;
    this.primary = on;
    this.draw();
  }

  /** Live-recolor the caption (pairs with {@link setPrimary} for active/inactive pills). */
  setLabelColor(color: number | string): void {
    this.labelText.style.fill = color;
  }

  /**
   * Enable/disable: a disabled button dims, ignores clicks and shows a blocked
   * cursor (used to gate Reroll when the player can't afford it).
   */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    this.alpha = on ? 1 : 0.45;
    this.cursor = on ? 'pointer' : 'not-allowed';
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
    if (this.destroyed) return;
    const from = this.scale.x;
    this.scaleTween?.stop();
    this.scaleTween = tween({
      duration: 0.14,
      easing: Easings.outBack,
      // The pop can outlive the button when a pointer event lands mid scene-switch:
      // a destroyed Container has scale === null, so bail before touching it.
      onUpdate: (e) => {
        if (this.destroyed) return;
        this.scale.set(from + (scale - from) * e);
      },
    });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.scaleTween?.stop();
    super.destroy(options);
  }
}
