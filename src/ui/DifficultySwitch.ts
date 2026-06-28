import { Container } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { t } from '../core/i18n';
import { Button } from './Button';
import { makeText } from './helpers';
import { DIFFICULTY_PRESETS, getDifficultyId, setEnemySpeed } from '../core/settings';

/**
 * Compact difficulty selector: an optional "DIFFICULTY" caption above a row of
 * pills, one per {@link DIFFICULTY_PRESETS} tier (Alpha 0.5× / Zoomer 1× /
 * Daddy 1.5×), with the active tier highlighted brass. Each tier maps to an
 * enemy-speed multiplier; tapping a pill persists the choice (settings.setEnemySpeed)
 * and applies live in battle — no reload (unlike {@link LangSwitch}), so the
 * highlight is re-tinted in place. Origin top-left; the caller sets `position`
 * and reads {@link contentHeight} to stack siblings below it.
 */
export class DifficultySwitch extends Container {
  /** Laid-out height (Pixi's `height` is a bounds getter, so this is separate). */
  readonly contentHeight: number;
  private readonly onChange?: (value: number, id: string) => void;
  private readonly pills: { id: string; btn: Button }[] = [];

  constructor(width: number, onChange?: (value: number, id: string) => void, showCaption = true) {
    super();
    this.onChange = onChange;

    let y = 0;
    if (showCaption) {
      const cap = makeText(t('settings.difficulty'), 'label', { fontSize: 24, fill: hex(COLORS.textDim) });
      cap.anchor.set(0.5, 0);
      cap.position.set(width / 2, 0);
      this.addChild(cap);
      y = 42;
    }

    const gap = 18;
    const n = DIFFICULTY_PRESETS.length;
    const bw = (width - gap * (n - 1)) / n;
    const bh = 72;
    DIFFICULTY_PRESETS.forEach((preset, i) => {
      const btn = new Button({
        label: t(preset.labelKey),
        width: bw,
        height: bh,
        preset: 'label',
        onClick: () => this.select(preset.id, preset.value),
      });
      btn.position.set(bw / 2 + i * (bw + gap), y + bh / 2);
      this.addChild(btn);
      this.pills.push({ id: preset.id, btn });
    });

    this.contentHeight = y + bh;
    this.refresh();
  }

  private select(id: string, value: number): void {
    setEnemySpeed(value);
    this.refresh();
    this.onChange?.(value, id);
  }

  /** Re-tint the pills so the live difficulty reads as the brass-primary one. */
  private refresh(): void {
    const active = getDifficultyId();
    for (const { id, btn } of this.pills) {
      const on = id === active;
      btn.setPrimary(on);
      btn.setLabelColor(hex(on ? COLORS.textBright : COLORS.textDim));
    }
  }
}
