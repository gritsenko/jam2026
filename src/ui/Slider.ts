import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { COLORS } from '../theme';
import { makeText } from './helpers';

export interface SliderOptions {
  width: number;
  label: string;
  /** Initial value, 0..1. */
  value: number;
  onChange: (value: number) => void;
  /** Track accent color (defaults to the energy-OK green). */
  accent?: number;
}

/**
 * A horizontal labelled slider (0..1). The label + live percentage sit on a top
 * row; the draggable track sits below. Self-contained: dragging anywhere on the
 * track sets the value and calls `onChange`. Origin top-left.
 *
 * Pure Pixi, matches the project's "own mini-implementations" rule (cf. tween,
 * Checkbox) — no UI libraries.
 */
export class Slider extends Container {
  private track = new Graphics();
  private knob = new Graphics();
  private pct = makeText('', 'label', { fontSize: 24, fill: COLORS.textBright });
  private readonly w: number;
  private readonly accent: number;
  private _value: number;
  private onChange: (value: number) => void;
  private dragging = false;

  private static readonly TRACK_Y = 42;
  private static readonly TRACK_H = 12;
  private static readonly KNOB_R = 16;

  constructor(opts: SliderOptions) {
    super();
    this.w = opts.width;
    this.accent = opts.accent ?? COLORS.energyOk;
    this._value = Math.min(1, Math.max(0, opts.value));
    this.onChange = opts.onChange;

    const label = makeText(opts.label, 'label', { fontSize: 26 });
    label.anchor.set(0, 0.5);
    label.position.set(0, 12);
    this.pct.anchor.set(1, 0.5);
    this.pct.position.set(this.w, 12);

    this.addChild(this.track, label, this.pct, this.knob);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(
      -Slider.KNOB_R,
      Slider.TRACK_Y - Slider.KNOB_R,
      this.w + Slider.KNOB_R * 2,
      Slider.KNOB_R * 2,
    );
    this.on('pointerdown', this.onDown, this);
    this.on('globalpointermove', this.onMove, this);
    this.on('pointerup', this.onUp, this);
    this.on('pointerupoutside', this.onUp, this);

    this.redraw();
  }

  get value(): number {
    return this._value;
  }

  private onDown(e: FederatedPointerEvent): void {
    this.dragging = true;
    this.setFromPointer(e);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (this.dragging) this.setFromPointer(e);
  }

  private onUp(): void {
    this.dragging = false;
  }

  private setFromPointer(e: FederatedPointerEvent): void {
    const local = this.toLocal(e.global);
    const v = Math.min(1, Math.max(0, local.x / this.w));
    if (Math.abs(v - this._value) < 0.001) return;
    this._value = v;
    this.redraw();
    this.onChange(v);
  }

  private redraw(): void {
    const y = Slider.TRACK_Y;
    const h = Slider.TRACK_H;
    const fillW = Math.max(0.0001, this.w * this._value);

    this.track.clear();
    this.track
      .roundRect(0, y, this.w, h, h / 2)
      .fill({ color: COLORS.bgDeep, alpha: 0.85 })
      .stroke({ width: 2, color: COLORS.metalLight, alpha: 0.6 });
    this.track.roundRect(0, y, fillW, h, h / 2).fill({ color: this.accent });

    this.knob.clear();
    this.knob
      .circle(0, 0, Slider.KNOB_R)
      .fill({ color: COLORS.metalLight })
      .stroke({ width: 3, color: this.accent });
    this.knob.position.set(this.w * this._value, y + h / 2);

    this.pct.text = `${Math.round(this._value * 100)}%`;
  }
}
