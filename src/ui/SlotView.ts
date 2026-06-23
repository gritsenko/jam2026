import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, ELEMENTS, type ElementId } from '../theme';
import { fitSprite } from './helpers';

export type SlotHighlight = 'none' | 'valid' | 'hover' | 'invalid';

/**
 * One platform slot. Empty = a recessed rune socket; filled = tower art in an
 * element-colored ring with grade pips. Origin is the center.
 */
export class SlotView extends Container {
  readonly index: number;
  private size: number;
  private base = new Graphics();
  private hl = new Graphics();
  private content = new Container();
  private occupied = false;

  constructor(index: number, size: number) {
    super();
    this.index = index;
    this.size = size;
    this.addChild(this.base, this.content, this.hl);
    this.drawEmpty();
  }

  get cellSize(): number {
    return this.size;
  }

  setEmpty(): void {
    this.occupied = false;
    this.content.removeChildren().forEach((c) => c.destroy());
    this.drawEmpty();
  }

  setPlaced(art: Texture, element: ElementId, grade: number): void {
    this.occupied = true;
    this.content.removeChildren().forEach((c) => c.destroy());
    const s = this.size;
    const skin = ELEMENTS[element];

    this.base.clear();
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).fill({ color: COLORS.metalDark, alpha: 0.92 });
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).stroke({ width: 4, color: skin.base });
    this.base.roundRect(-s / 2 + 5, -s / 2 + 5, s - 10, s - 10, 12).stroke({ width: 2, color: skin.glow, alpha: 0.4 });

    const sprite = new Sprite(art);
    fitSprite(sprite, s * 0.82, s * 0.82);
    this.content.addChild(sprite);

    // Grade pips along the bottom.
    const pips = new Graphics();
    const total = 3;
    const r = 5;
    const gap = 16;
    const startX = -((total - 1) * gap) / 2;
    for (let i = 0; i < total; i++) {
      const on = i < grade;
      pips
        .circle(startX + i * gap, s / 2 - 12, r)
        .fill({ color: on ? skin.glow : COLORS.metalLight, alpha: on ? 1 : 0.5 });
    }
    this.content.addChild(pips);
  }

  setHighlight(state: SlotHighlight): void {
    const s = this.size;
    this.hl.clear();
    if (state === 'none') return;
    const color =
      state === 'hover' ? COLORS.dropHover : state === 'invalid' ? COLORS.energyDanger : COLORS.dropValid;
    const alpha = state === 'hover' ? 0.5 : 0.28;
    this.hl.roundRect(-s / 2, -s / 2, s, s, 16).fill({ color, alpha });
    this.hl.roundRect(-s / 2, -s / 2, s, s, 16).stroke({ width: 4, color });
  }

  get isOccupied(): boolean {
    return this.occupied;
  }

  private drawEmpty(): void {
    const s = this.size;
    this.base.clear();
    this.hl.clear();
    // Recessed socket.
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).fill({ color: COLORS.black, alpha: 0.38 });
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).stroke({ width: 3, color: COLORS.brass, alpha: 0.55 });
    this.base.roundRect(-s / 2 + 6, -s / 2 + 6, s - 12, s - 12, 12).stroke({
      width: 2,
      color: COLORS.brassLight,
      alpha: 0.25,
    });
    // Faint rune.
    this.base.circle(0, 0, s * 0.16).stroke({ width: 3, color: COLORS.brassLight, alpha: 0.22 });
    this.base.circle(0, 0, s * 0.07).fill({ color: COLORS.brassLight, alpha: 0.15 });
  }
}
