import { Container, type Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { t } from '../core/i18n';
import { Button } from './Button';
import { makeText } from './helpers';
import { getGameSpeed, stepGameSpeed, SPEED_MIN, SPEED_MAX } from '../core/gameSpeed';

/**
 * Game-speed control: a "GAME SPEED" caption above a row of [−] [value] [+].
 * The minus/plus buttons nudge the global {@link gameSpeed} by one 0.5× step
 * (clamped to its bounds, disabling at the ends); the change applies live. Origin
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

  constructor(width: number, onChange?: (value: number) => void) {
    super();
    this.onChange = onChange;

    const cap = makeText(t('settings.gameSpeed'), 'label', { fontSize: 24, fill: hex(COLORS.textDim) });
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
    const value = stepGameSpeed(dir);
    this.valueText.text = this.format();
    this.refresh();
    this.onChange?.(value);
  }

  private format(): string {
    return `${getGameSpeed().toFixed(1)}×`;
  }

  /** Dim the buttons that would overshoot the bounds. */
  private refresh(): void {
    const v = getGameSpeed();
    this.minusBtn.setEnabled(v > SPEED_MIN + 1e-6);
    this.plusBtn.setEnabled(v < SPEED_MAX - 1e-6);
  }
}
