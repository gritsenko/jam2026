import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { makeText } from './helpers';

/**
 * Empty/charging hand position. Card-shaped recessed frame with a vertical
 * charge fill that rises as the slot recharges toward spawning a new card.
 * Purely presentational; the scene drives {@link setProgress}. Origin center.
 */
export class HandSlotView extends Container {
  private base = new Graphics();
  private fill = new Graphics();
  private chargeLabel: Text;
  private w: number;
  private h: number;

  constructor(width: number, height: number) {
    super();
    this.w = width;
    this.h = height;
    this.addChild(this.base, this.fill);

    this.chargeLabel = makeText('CHARGING', 'micro', { fontSize: 20, fill: hex(COLORS.textMuted) });
    this.chargeLabel.anchor.set(0.5);
    this.addChild(this.chargeLabel);

    this.drawBase();
    this.setProgress(0);
  }

  /** Charge level 0..1 — fills the card frame from the bottom up. */
  setProgress(t: number): void {
    const p = Math.max(0, Math.min(1, t));
    const w = this.w;
    const h = this.h;
    const inset = 8;
    const fw = w - inset * 2;
    const fullH = h - inset * 2;
    const fh = fullH * p;

    this.fill.clear();
    if (fh > 0) {
      // Charge fills from the bottom edge upward.
      this.fill
        .roundRect(-fw / 2, h / 2 - inset - fh, fw, fh, 12)
        .fill({ color: COLORS.energyOverdrive, alpha: 0.22 + 0.18 * p });
    }
    // Edge brightens as it approaches full.
    this.fill
      .roundRect(-w / 2, -h / 2, w, h, 18)
      .stroke({ width: 3, color: COLORS.energyOverdrive, alpha: 0.25 + 0.6 * p });

    this.chargeLabel.alpha = 0.4 + 0.4 * (1 - p);
  }

  private drawBase(): void {
    const w = this.w;
    const h = this.h;
    this.base.clear();
    // Recessed empty card socket, matching the slot/card chrome idiom.
    this.base.roundRect(-w / 2, -h / 2, w, h, 18).fill({ color: COLORS.black, alpha: 0.34 });
    this.base.roundRect(-w / 2, -h / 2, w, h, 18).stroke({ width: 3, color: COLORS.brass, alpha: 0.5 });
    this.base
      .roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 14)
      .stroke({ width: 2, color: COLORS.brassLight, alpha: 0.18 });
  }
}
