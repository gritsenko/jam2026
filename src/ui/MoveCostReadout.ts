import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { drawPanel, fitSprite, makeText } from './helpers';

/** One element of a move-cost readout: an optional icon + a (usually signed) value. */
export interface CostPart {
  /** Icon texture (energy / gold token); omit for a plain text part (e.g. "→Lv2"). */
  icon?: Texture;
  text: string;
  color: number;
}

/**
 * A compact, centered plaque showing the cost of the pending action while a card
 * is dragged — placement, merge or Reactor burn (v2 §9). Each part is an icon +
 * a signed value (`+2` load, `-40` gold), so the player sees which way the move
 * pushes the grid before committing. Sits in the sand under the base; origin is
 * the center, so the scene just positions it once per layout.
 */
export class MoveCostReadout extends Container {
  private bg = new Graphics();
  private row = new Container();

  private static readonly ICON = 34;
  private static readonly ICON_GAP = 8;
  private static readonly PART_GAP = 26;

  constructor() {
    super();
    this.addChild(this.bg, this.row);
    this.visible = false;
  }

  /** Show the given parts; rebuilds and re-centers the row + its backing plaque. */
  show(parts: CostPart[]): void {
    this.row.removeChildren().forEach((c) => c.destroy());
    if (parts.length === 0) {
      this.hide();
      return;
    }
    const { ICON, ICON_GAP, PART_GAP } = MoveCostReadout;

    let x = 0;
    for (const part of parts) {
      const item = new Container();
      let ix = 0;
      if (part.icon) {
        const sp = new Sprite(part.icon);
        fitSprite(sp, ICON, ICON);
        sp.position.set(ICON / 2, 0);
        item.addChild(sp);
        ix = ICON + ICON_GAP;
      }
      const t = makeText(part.text, 'value', { fontSize: 34, fill: hex(part.color) });
      t.anchor.set(0, 0.5);
      t.position.set(ix, 0);
      item.addChild(t);
      item.position.x = x;
      x += ix + t.width + PART_GAP;
      this.row.addChild(item);
    }
    const totalW = x - PART_GAP;
    this.row.position.set(-totalW / 2, 0);

    const padX = 24;
    const h = ICON + 22;
    const w = totalW + padX * 2;
    this.bg.clear();
    drawPanel(this.bg, -w / 2, -h / 2, w, h, {
      radius: 14,
      fill: COLORS.metalDark,
      fillAlpha: 0.92,
      edge: COLORS.brass,
      edgeWidth: 3,
      bevel: true,
    });
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }
}
