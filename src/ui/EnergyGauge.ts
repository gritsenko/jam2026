import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { drawPanel, makeText } from './helpers';

interface GaugeState {
  load: number;
  capacity: number;
  max: number;
  overdrive: boolean;
}

/**
 * Horizontal segmented energy-load gauge in a "Red Alert" idiom:
 * green within budget, yellow nearing capacity, red in the overload zone past
 * capacity, plus a gold Overdrive cap. Origin top-left; call setSize then
 * setState (or rely on the constructor defaults).
 */
export class EnergyGauge extends Container {
  private frame = new Graphics();
  private segs = new Graphics();
  /** Gold "charge" overlay shown while a card is hovered over the Reactor. */
  private chargeGlow = new Graphics();
  private charging = false;
  private odLabel: Text;
  private readout: Text;
  private w: number;
  private h: number;
  private state: GaugeState = { load: 0, capacity: 10, max: 15, overdrive: false };
  private pulse = 0;

  constructor(width = 760, height = 70) {
    super();
    this.w = width;
    this.h = height;
    this.addChild(this.frame, this.segs, this.chargeGlow);

    this.readout = makeText('', 'label', { fontSize: 22, fill: hex(COLORS.textBright) });
    this.readout.anchor.set(0, 0.5);
    this.addChild(this.readout);

    this.odLabel = makeText('OVERDRIVE', 'label', { fontSize: 22, fill: hex(COLORS.energyOverdrive) });
    this.odLabel.anchor.set(1, 0.5);
    this.addChild(this.odLabel);

    this.redraw();
  }

  setBarSize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.redraw();
  }

  setState(state: Partial<GaugeState>): void {
    this.state = { ...this.state, ...state };
    this.redraw();
  }

  /**
   * Toggle the Reactor "charge preview": while a card is held over the Reactor,
   * the gauge lights up its Overdrive cap and rim to telegraph the +Overdrive
   * the burn would grant. Pulsed in {@link tick}.
   */
  setCharging(on: boolean): void {
    if (this.charging === on) return;
    this.charging = on;
    this.drawCharge();
  }

  /** Optional ambient animation — scene may pump this each frame. */
  tick(dt: number): void {
    this.pulse = (this.pulse + dt * 3) % (Math.PI * 2);
    this.segs.alpha = 1;
    if (this.state.overdrive) this.odLabel.alpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.pulse));
    else this.odLabel.alpha = 0.4;
    if (this.charging) this.chargeGlow.alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.pulse * 1.7));
  }

  private segColor(index: number): number {
    const { capacity } = this.state;
    if (index >= capacity) return COLORS.energyDanger; // overload zone
    if (index >= capacity * 0.7) return COLORS.energyWarn;
    return COLORS.energyOk;
  }

  private redraw(): void {
    const { load, capacity, max, overdrive } = this.state;
    const odW = 184;
    this.frame.clear();
    this.segs.clear();

    drawPanel(this.frame, 0, 0, this.w, this.h, {
      radius: 14,
      fill: COLORS.metalDark,
      edge: overdrive ? COLORS.energyOverdrive : COLORS.brass,
      edgeWidth: 4,
      bevel: true,
    });

    const padX = 16;
    const padY = 14;
    const barX = padX;
    const barW = this.w - padX * 2 - odW;
    const barY = padY;
    const barH = this.h - padY * 2;

    // Track
    this.segs.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 8).fill({ color: COLORS.black, alpha: 0.35 });

    const count = Math.max(1, max);
    const gap = 4;
    const segW = (barW - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const x = barX + i * (segW + gap);
      const filled = i < load;
      const inOverload = i >= capacity;
      if (filled) {
        const color = this.segColor(i);
        this.segs.roundRect(x, barY, segW, barH, 4).fill({ color });
        this.segs.roundRect(x, barY, segW, barH * 0.45, 4).fill({ color: COLORS.white, alpha: 0.22 });
      } else {
        this.segs
          .roundRect(x, barY, segW, barH, 4)
          .fill({ color: inOverload ? COLORS.energyDanger : COLORS.metalLight, alpha: inOverload ? 0.22 : 0.5 });
      }
      // Capacity divider tick.
      if (i === capacity && capacity < count) {
        this.segs.rect(x - gap / 2 - 1, barY - 6, 2, barH + 12).fill({ color: COLORS.brassLight, alpha: 0.8 });
      }
    }

    // Numeric readout lives in the HUD label; keep the bar itself clean.
    this.readout.text = `${load} / ${capacity}`;
    this.readout.visible = false;

    // Overdrive cap on the right.
    const odX = this.w - padX - odW;
    this.segs.roundRect(odX, barY, odW, barH, 10).fill({
      color: overdrive ? COLORS.energyOverdrive : COLORS.metalMid,
      alpha: overdrive ? 0.9 : 0.5,
    });
    this.segs.roundRect(odX, barY, odW, barH, 10).stroke({
      width: 3,
      color: COLORS.energyOverdrive,
      alpha: overdrive ? 1 : 0.5,
    });
    this.odLabel.style.fill = hex(overdrive ? COLORS.textDark : COLORS.energyOverdrive);
    this.odLabel.position.set(this.w - padX - 14, this.h / 2);

    if (this.charging) this.drawCharge();
  }

  private drawCharge(): void {
    this.chargeGlow.clear();
    if (!this.charging) {
      this.chargeGlow.visible = false;
      return;
    }
    const odW = 184;
    const padX = 16;
    const padY = 14;
    const barH = this.h - padY * 2;
    const odX = this.w - padX - odW;
    // Bright fill on the Overdrive cap — previews the burn payoff.
    this.chargeGlow.roundRect(odX, padY, odW, barH, 10).fill({ color: COLORS.energyOverdrive, alpha: 0.85 });
    this.chargeGlow.roundRect(odX, padY, odW, barH, 10).stroke({ width: 3, color: COLORS.white, alpha: 0.85 });
    // Charged rim around the whole gauge.
    this.chargeGlow.roundRect(2, 2, this.w - 4, this.h - 4, 14).stroke({
      width: 3,
      color: COLORS.energyOverdrive,
      alpha: 0.9,
    });
    this.chargeGlow.visible = true;
  }
}
