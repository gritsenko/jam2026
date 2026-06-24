import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { drawPanel, makeText } from './helpers';

interface GaugeState {
  load: number;
  capacity: number;
  max: number;
  overdrive: boolean;
}

/** How fast the load-change flash decays (1 → 0 over ~1/this seconds). */
const FLASH_DECAY = 3;

/**
 * Horizontal segmented energy-load gauge in a "Red Alert" idiom:
 * green within budget, yellow nearing capacity, red in the overload zone past
 * capacity, plus a gold Overdrive cap. Origin top-left; call setSize then
 * setState (or rely on the constructor defaults).
 *
 * Reactive feedback (v2 §9): every load change blinks the bar; an overloaded grid
 * pulses red; and the capacity ("optimal") divider is a thick neon line that
 * slides animatedly to its new position whenever capacity changes.
 */
export class EnergyGauge extends Container {
  private frame = new Graphics();
  private segs = new Graphics();
  /** Red overload wash + rim, alpha pulsed in {@link tick} while overloaded. */
  private overloadG = new Graphics();
  /** White bloom over the bar, kicked on every load change and decayed in tick. */
  private flashG = new Graphics();
  /** The capacity ("optimal") divider — animated independently of the segments. */
  private divider = new Graphics();
  /** Gold "charge" overlay shown while a card is hovered over the Reactor. */
  private chargeGlow = new Graphics();
  private charging = false;
  private odLabel: Text;
  private readout: Text;
  private w: number;
  private h: number;
  private state: GaugeState = { load: 0, capacity: 10, max: 15, overdrive: false };
  private pulse = 0;
  /** 1 right after a load change, decaying to 0 — drives the flash alpha. */
  private flash = 0;
  /** Current animated x of the capacity divider; <0 = uninitialized (snap on first draw). */
  private dividerX = -1;
  /** Bar geometry cached from the last redraw so the divider can position itself. */
  private barGeom = { barX: 0, barY: 0, barW: 1, barH: 1, segW: 1, gap: 4, count: 1 };

  constructor(width = 760, height = 70) {
    super();
    this.w = width;
    this.h = height;
    this.addChild(this.frame, this.segs, this.overloadG, this.flashG, this.divider, this.chargeGlow);

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
    // Layout change, not a gameplay change: snap the divider rather than sliding.
    this.dividerX = this.targetDividerX();
    this.drawDivider(this.dividerX);
  }

  setState(state: Partial<GaugeState>): void {
    // Any change to the load blinks the bar so placements/merges/burns are obvious.
    if (state.load !== undefined && state.load !== this.state.load) this.flash = 1;
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

  /** Ambient animation — the scene pumps this each frame. */
  tick(dt: number): void {
    this.pulse = (this.pulse + dt * 3) % (Math.PI * 2);

    if (this.state.overdrive) this.odLabel.alpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.pulse));
    else this.odLabel.alpha = 0.4;
    if (this.charging) this.chargeGlow.alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.pulse * 1.7));

    // Load-change flash: a quick white bloom over the bar.
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * FLASH_DECAY);
      this.flashG.alpha = this.flash * 0.55;
    } else if (this.flashG.alpha !== 0) {
      this.flashG.alpha = 0;
    }

    // Overload alarm: pulse a red wash + rim while load exceeds capacity (§9).
    const overloaded = this.state.load > this.state.capacity;
    this.overloadG.alpha = overloaded ? 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(this.pulse * 2)) : 0;

    // Slide the capacity ("optimal") divider toward its target x, then redraw it
    // (with a gentle neon pulse). First frame snaps so it doesn't fly in from 0.
    const tx = this.targetDividerX();
    if (this.dividerX < 0) this.dividerX = tx;
    else this.dividerX += (tx - this.dividerX) * Math.min(1, dt * 8);
    this.drawDivider(this.dividerX);
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
    this.overloadG.clear();
    this.flashG.clear();

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

    const count = Math.max(1, Math.ceil(max));
    const gap = 4;
    const segW = (barW - gap * (count - 1)) / count;
    this.barGeom = { barX, barY, barW, barH, segW, gap, count };
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
    }

    // Overload wash + rim (alpha driven in tick, baked shapes here).
    this.overloadG.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 8).fill({ color: COLORS.energyDanger, alpha: 0.5 });
    this.overloadG.roundRect(2, 2, this.w - 4, this.h - 4, 14).stroke({ width: 4, color: COLORS.energyDanger });
    this.overloadG.alpha = 0;

    // Load-change flash overlay (alpha driven in tick).
    this.flashG.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 8).fill({ color: COLORS.white });
    this.flashG.alpha = 0;

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

  /** Target x (bar space) of the capacity divider for the current capacity. */
  private targetDividerX(): number {
    const { barX, barW, segW, gap } = this.barGeom;
    const x = barX + this.state.capacity * (segW + gap) - gap / 2;
    return Math.max(barX, Math.min(barX + barW, x));
  }

  /**
   * The "optimal" capacity divider: a bold layered neon line (outer glow → mid
   * stroke → white core) with end-caps, colored green normally, yellow within
   * 1–2 units of capacity, red while overloaded (§9). Pulses gently so it always
   * reads as live, and is redrawn every frame from {@link tick} so it can slide.
   */
  private drawDivider(x: number): void {
    this.divider.clear();
    const { barY, barH } = this.barGeom;
    const top = barY - 8;
    const bot = barY + barH + 8;
    const h = bot - top;

    const { load, capacity } = this.state;
    let color: number = COLORS.energyOk;
    if (load > capacity) color = COLORS.energyDanger;
    else if (load >= capacity - 1.5) color = COLORS.energyWarn;

    const pulseT = 0.5 + 0.5 * Math.sin(this.pulse * 1.5);
    this.divider.roundRect(x - 7, top - 2, 14, h + 4, 7).fill({ color, alpha: 0.16 + 0.14 * pulseT });
    this.divider.roundRect(x - 3, top, 6, h, 3).fill({ color, alpha: 0.55 });
    this.divider.rect(x - 1, top, 2, h).fill({ color: COLORS.white, alpha: 0.85 });
    this.divider.circle(x, top, 5).fill({ color, alpha: 0.9 });
    this.divider.circle(x, bot, 5).fill({ color, alpha: 0.9 });
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
