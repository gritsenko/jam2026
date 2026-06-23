import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { drawPanel, fitSprite, makeText } from './helpers';

/**
 * Top-bar resource readout: a round icon + value in a brass pill.
 * Origin is top-left; `chipW`/`chipH` give the laid-out size.
 */
export class ResourceChip extends Container {
  private bg = new Graphics();
  private valueText: Text;
  private icon: Sprite;
  private accent: number;
  readonly chipH = 64;
  chipW = 180;

  constructor(iconTexture: Texture, value: number | string, accent: number) {
    super();
    this.accent = accent;
    this.addChild(this.bg);

    this.icon = new Sprite(iconTexture);
    fitSprite(this.icon, this.chipH - 12, this.chipH - 12);
    this.icon.position.set((this.chipH) / 2, this.chipH / 2 - 0);
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
