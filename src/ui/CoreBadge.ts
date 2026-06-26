import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { t } from '../core/i18n';
import { drawPanel, makeText } from './helpers';

/**
 * Core integrity readout under the wave badge: a labelled bar that drains from
 * green to red as enemies breach the platform. Origin top-left.
 */
export class CoreBadge extends Container {
  private bg = new Graphics();
  private bar = new Graphics();
  private caption: Text;
  private value: Text;
  readonly badgeW = 250;
  readonly badgeH = 64;
  private max = 1;

  constructor(hp: number, max: number) {
    super();
    this.max = Math.max(1, max);
    this.addChild(this.bg);

    this.caption = makeText(t('hud.core'), 'label', { fontSize: 22, fill: hex(COLORS.energyOk) });
    this.caption.position.set(20, 8);
    this.addChild(this.caption);

    this.addChild(this.bar);

    this.value = makeText('', 'value', { fontSize: 26 });
    this.value.anchor.set(1, 0.5);
    this.addChild(this.value);

    this.drawPanelBg();
    this.setValue(hp, max);
  }

  setValue(hp: number, max = this.max): void {
    this.max = Math.max(1, max);
    const clamped = Math.max(0, Math.min(hp, this.max));
    const frac = clamped / this.max;
    const color = frac > 0.5 ? COLORS.energyOk : frac > 0.25 ? COLORS.energyWarn : COLORS.energyDanger;

    const x = 20;
    const y = 38;
    const w = this.badgeW - 40;
    const h = 14;
    this.bar.clear();
    this.bar.roundRect(x, y, w, h, 6).fill({ color: COLORS.black, alpha: 0.5 });
    if (frac > 0) this.bar.roundRect(x, y, w * frac, h, 6).fill({ color });
    this.bar.roundRect(x, y, w, h, 6).stroke({ width: 2, color: COLORS.brass, alpha: 0.6 });

    this.caption.style.fill = hex(color);
    this.value.text = `${clamped}`;
    this.value.style.fill = hex(color);
    this.value.position.set(this.badgeW - 20, 19);
  }

  private drawPanelBg(): void {
    this.bg.clear();
    drawPanel(this.bg, 0, 0, this.badgeW, this.badgeH, {
      radius: 14,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 3,
      bevel: true,
    });
  }
}
