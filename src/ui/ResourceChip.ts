import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { Easings, tween, type TweenHandle } from '../core/tween';
import { drawPanel, fitSprite, makeText } from './helpers';

/**
 * Top-bar resource readout: a round icon + value in a brass pill.
 * Origin is top-left; `chipW`/`chipH` give the laid-out size.
 */
export class ResourceChip extends Container {
  /** Halo ring behind the pill, expanded + faded by {@link pulse}. */
  private pulseRing = new Graphics();
  private bg = new Graphics();
  private valueText: Text;
  private icon: Sprite;
  private accent: number;
  /** Icon scale at rest, captured after fit so {@link pulse} can punch around it. */
  private baseIconScale = 1;
  private pulseTween?: TweenHandle;
  readonly chipH = 64;
  chipW = 180;

  constructor(iconTexture: Texture, value: number | string, accent: number) {
    super();
    this.accent = accent;
    this.addChild(this.pulseRing); // behind the pill so the halo reads on its edges
    this.addChild(this.bg);

    this.icon = new Sprite(iconTexture);
    fitSprite(this.icon, this.chipH - 12, this.chipH - 12);
    this.icon.position.set((this.chipH) / 2, this.chipH / 2 - 0);
    this.baseIconScale = this.icon.scale.x;
    this.addChild(this.icon);

    this.valueText = makeText(String(value), 'value', { fill: hex(COLORS.textBright) });
    this.valueText.anchor.set(0, 0.5);
    this.addChild(this.valueText);

    this.redraw();
  }

  setValue(value: number | string): void {
    this.valueText.text = String(value);
    this.redraw();
  }

  /**
   * Punch the chip to acknowledge an arriving reward (a coin/crystal landing):
   * the icon swells and a colored halo blooms out from the pill, then settles.
   * Re-triggerable — a fresh landing restarts the pulse.
   */
  pulse(): void {
    this.pulseTween?.stop();
    const base = this.baseIconScale;
    this.pulseTween = tween({
      duration: 0.36,
      easing: Easings.outCubic,
      onUpdate: (t) => {
        if (this.destroyed) return;
        const punch = Math.sin(Math.PI * t); // 0 → 1 → 0
        this.icon.scale.set(base * (1 + 0.38 * punch));
        const grow = 4 + 18 * t;
        this.pulseRing.clear();
        this.pulseRing
          .roundRect(-grow, -grow, this.chipW + grow * 2, this.chipH + grow * 2, this.chipH / 2 + grow)
          .stroke({ width: 4, color: this.accent, alpha: 0.6 * (1 - t) });
      },
      onComplete: () => {
        if (this.destroyed) return;
        this.icon.scale.set(base);
        this.pulseRing.clear();
      },
    });
  }

  private redraw(): void {
    const iconBox = this.chipH;
    const textX = iconBox + 6;
    this.chipW = textX + this.valueText.width + 26;

    this.bg.clear();
    drawPanel(this.bg, 0, 0, this.chipW, this.chipH, {
      radius: this.chipH / 2,
      fill: COLORS.metalDark,
      edge: this.accent,
      edgeWidth: 3,
      bevel: true,
    });

    this.icon.position.set(iconBox / 2, this.chipH / 2);
    this.valueText.position.set(textX, this.chipH / 2 + 1);
  }
}
