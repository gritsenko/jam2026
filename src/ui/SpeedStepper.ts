import { Container, type Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { t } from '../core/i18n';
import { Button } from './Button';
import { makeText } from './helpers';
import { getGameSpeed, stepGameSpeed, SPEED_MIN, SPEED_MAX } from '../core/gameSpeed';

/**
 * Data model behind a {@link SpeedStepper}: an i18n caption key plus the read /
 * step / bounds of some persisted multiplier. Lets the same control drive both
 * the global game-speed and the enemy-speed dial without duplicating the widget.
 */
export interface StepperModel {
  /** i18n key for the caption above the row. */
  captionKey: string;
  /** Current value. */
  get(): number;
  /** Nudge by one step in `dir` and return the new value. */
  step(dir: -1 | 1): number;
  min: number;
  max: number;
}

/** Default model — the global game-speed tempo (back-compat for existing callers). */
const GAME_SPEED_MODEL: StepperModel = {
  captionKey: 'settings.gameSpeed',
  get: getGameSpeed,
  step: stepGameSpeed,
  min: SPEED_MIN,
  max: SPEED_MAX,
};

/**
 * Speed control: a caption above a row of [−] [value] [+]. The minus/plus buttons
 * nudge the bound multiplier by one 0.5× step (clamped to its bounds, disabling at
 * the ends); the change applies live. Defaults to the global game-speed; pass a
 * {@link StepperModel} to drive a different dial (e.g. enemy speed). Origin
 * top-left; the caller sets `position` and reads {@link contentHeight} to stack
 * siblings below it (mirrors {@link LangSwitch}).
 */
export class SpeedStepper extends Container {
  /** Laid-out height (Pixi's `height` is a bounds getter, so this is separate). */
  readonly contentHeight: number;
  private valueText: Text;
  private minusBtn: Button;
  private plusBtn: Button;
  private readonly onChange?: (value: number) => void;
  private readonly model: StepperModel;

  constructor(width: number, onChange?: (value: number) => void, model: StepperModel = GAME_SPEED_MODEL) {
    super();
    this.onChange = onChange;
    this.model = model;

    const cap = makeText(t(this.model.captionKey), 'label', { fontSize: 24, fill: hex(COLORS.textDim) });
    cap.anchor.set(0.5, 0);
    cap.position.set(width / 2, 0);
    this.addChild(cap);

    const bh = 72;
    const rowY = 42 + bh / 2;
    this.minusBtn = new Button({
      label: '-',
      width: bh,
      height: bh,
      preset: 'title',
      onClick: () => this.step(-1),
    });
    this.minusBtn.position.set(bh / 2, rowY);
    this.plusBtn = new Button({
      label: '+',
      width: bh,
      height: bh,
      preset: 'title',
      onClick: () => this.step(1),
    });
    this.plusBtn.position.set(width - bh / 2, rowY);

    this.valueText = makeText(this.format(), 'title', { fontSize: 40 });
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(width / 2, rowY);

    this.addChild(this.minusBtn, this.plusBtn, this.valueText);

    this.contentHeight = 42 + bh;
    this.refresh();
  }

  private step(dir: -1 | 1): void {
    const value = this.model.step(dir);
    this.valueText.text = this.format();
    this.refresh();
    this.onChange?.(value);
  }

  private format(): string {
    return `${this.model.get().toFixed(1)}×`;
  }

  /** Dim the buttons that would overshoot the bounds. */
  private refresh(): void {
    const v = this.model.get();
    this.minusBtn.setEnabled(v > this.model.min + 1e-6);
    this.plusBtn.setEnabled(v < this.model.max - 1e-6);
  }
}
