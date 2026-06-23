import { ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
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
  /** Translucent preview of the building that would land here while dragging. */
  private ghost = new Container();
  private occupied = false;

  constructor(index: number, size: number) {
    super();
    this.index = index;
    this.size = size;
    this.addChild(this.base, this.content, this.hl, this.ghost);
    this.ghost.visible = false;
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

  /**
   * Show a translucent preview of the tower that a dragged card would build
   * here — an element ring plus its desaturated art, so the drop reads before
   * the card is even released. Cleared with {@link clearGhost}.
   */
  showGhost(art: Texture, element: ElementId): void {
    this.clearGhost();
    const s = this.size;
    const skin = ELEMENTS[element];

    const ring = new Graphics();
    ring.roundRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 14).fill({ color: skin.dark, alpha: 0.35 });
    ring.roundRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 14).stroke({ width: 3, color: skin.glow, alpha: 0.85 });
    this.ghost.addChild(ring);

    const sprite = new Sprite(art);
    fitSprite(sprite, s * 0.8, s * 0.8);
    const desat = new ColorMatrixFilter();
    desat.desaturate();
    sprite.filters = [desat];
    this.ghost.addChild(sprite);

    this.ghost.alpha = 0.62;
    this.ghost.visible = true;
  }

  clearGhost(): void {
    this.ghost.removeChildren().forEach((c) => c.destroy());
    this.ghost.visible = false;
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
