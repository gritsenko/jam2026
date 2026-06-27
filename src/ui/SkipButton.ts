import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from '../core/tween';
import { drawPanel, makeText } from './helpers';
import { t } from '../core/i18n';

/**
 * A labeled "skip" pill for cutscenes / dialogue / tutorials, used where a bare ✕
 * would be too easy to miss. Center origin; position by center point. Auto-sizes
 * to its localized caption — read `btnW`/`btnH` for layout. Hover/press give the
 * same scale pop as {@link import('./Button').Button}.
 */
export class SkipButton extends Container {
  private bg = new Graphics();
  private caption: Text;
  readonly btnW: number;
  readonly btnH: number;
  private pressed = false;
  private scaleTween?: { stop(): void };

  constructor(onClick: () => void, height = 60) {
    super();
    this.btnH = height;

    this.caption = makeText(t('common.skip'), 'label', { fill: COLORS.textBright });
    this.caption.anchor.set(0.5);
    // Pill = caption width + a rounded cap (~half-height) of padding on each side.
    this.btnW = Math.ceil(this.caption.width) + height;

    this.addChild(this.bg, this.caption);
    this.draw();

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH);

    this.on('pointerover', () => this.popTo(1.06));
    this.on('pointerout', () => {
      this.pressed = false;
      this.popTo(1);
    });
    this.on('pointerdown', () => {
      this.pressed = true;
      this.popTo(0.95);
    });
    this.on('pointerup', () => {
      if (this.pressed) {
        this.pressed = false;
        this.popTo(1.06);
        onClick();
      }
    });
    this.on('pointerupoutside', () => {
      this.pressed = false;
      this.popTo(1);
    });
  }

  private draw(): void {
    const w = this.btnW;
    const h = this.btnH;
    this.bg.clear();
    drawPanel(this.bg, -w / 2, -h / 2, w, h, {
      radius: h / 2,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 4,
      bevel: true,
      rivets: false,
    });
    this.caption.position.set(0, 0);
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
