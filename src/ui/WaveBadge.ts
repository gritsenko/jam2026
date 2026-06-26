import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { t } from '../core/i18n';
import { drawPanel, makeText } from './helpers';

/** Top-left wave readout banner ("WAVE 8 / 20"). Origin top-left. */
export class WaveBadge extends Container {
  private bg = new Graphics();
  private waveLabel: Text;
  private value: Text;
  readonly badgeW = 250;
  readonly badgeH = 96;

  constructor(wave: number, maxWave: number) {
    super();
    this.addChild(this.bg);

    this.waveLabel = makeText(t('hud.wave'), 'label', { fontSize: 24, fill: hex(COLORS.gold) });
    this.waveLabel.position.set(22, 14);
    this.addChild(this.waveLabel);

    this.value = makeText(`${wave} / ${maxWave}`, 'title', { fontSize: 48 });
    this.value.position.set(20, 38);
    this.addChild(this.value);

    this.redraw();
  }

  setWave(wave: number, maxWave: number): void {
    this.value.text = `${wave} / ${maxWave}`;
  }

  private redraw(): void {
    this.bg.clear();
    drawPanel(this.bg, 0, 0, this.badgeW, this.badgeH, {
      radius: 16,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 4,
      bevel: true,
      rivets: true,
    });
  }
}
