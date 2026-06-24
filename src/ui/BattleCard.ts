import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { CardDef } from '../config/types';
import { drawPanel, fitSprite, makeText } from './helpers';

export interface BattleCardOptions {
  width?: number;
  height?: number;
  /** Energy-token texture for the cost chip (assets key 'icon_energy'). */
  energyIcon?: Texture;
  /** Gold-coin texture for the cost chip (assets key 'icon_gold'). */
  goldIcon?: Texture;
}

/**
 * A hand card: element-colored frame, art, name, a flavor line and a compact
 * cost row along the bottom — energy load on the left, gold price on the right.
 * Origin is the center (so it can be lifted / dragged about its middle).
 * Presentational only — interaction (drag/drop) is wired by the scene; the scene
 * calls {@link setAffordable} to lock cards the player can't pay for.
 */
export class BattleCard extends Container {
  readonly def: CardDef;
  readonly grade: number;
  readonly cardW: number;
  readonly cardH: number;

  /** Whether the player can currently afford this card (gates dragging). */
  affordable = true;

  // Gold chip pieces, recolored when affordability changes.
  private goldChipBg = new Graphics();
  private goldChipRect: [number, number, number, number] = [0, 0, 0, 0];
  private goldValue!: Text;

  // Dim + red "locked" veil shown when the card is unaffordable.
  private lockOverlay = new Container();

  constructor(def: CardDef, grade: number, art: Texture, opts: BattleCardOptions = {}) {
    super();
    this.def = def;
    this.grade = grade;
    this.cardW = opts.width ?? 212;
    this.cardH = opts.height ?? 300;
    const W = this.cardW;
    const H = this.cardH;
    const skin = ELEMENTS[def.element];

    const bg = new Graphics();
    // Card body (element-tinted dark) with a bright element edge.
    drawPanel(bg, -W / 2, -H / 2, W, H, {
      radius: 20,
      fill: COLORS.metalDark,
      fillAlpha: 0.98,
      edge: skin.base,
      edgeWidth: 5,
      bevel: true,
    });
    // Inner element wash at the top behind the art.
    bg.roundRect(-W / 2 + 8, -H / 2 + 8, W - 16, H * 0.52, 16).fill({ color: skin.dark, alpha: 0.55 });
    bg.roundRect(-W / 2 + 8, -H / 2 + 8, W - 16, H * 0.52, 16).stroke({ width: 2, color: skin.base, alpha: 0.5 });
    this.addChild(bg);

    // Art.
    const artBox = W - 36;
    const artSp = new Sprite(art);
    fitSprite(artSp, artBox, H * 0.46);
    artSp.position.set(0, -H * 0.16);
    this.addChild(artSp);

    // Name banner.
    const nameY = H * 0.12;
    const nameBg = new Graphics();
    nameBg.roundRect(-W / 2 + 10, nameY - 22, W - 20, 40, 10).fill({ color: COLORS.black, alpha: 0.4 });
    this.addChild(nameBg);
    const gradeSuffix = grade > 1 ? `  Lv${grade}` : '';
    const name = makeText(def.shortName + gradeSuffix, 'label', { fontSize: 24, fill: hex(skin.glow) });
    name.anchor.set(0.5);
    name.position.set(0, nameY - 2);
    if (name.width > W - 26) name.scale.set((W - 26) / name.width);
    this.addChild(name);

    // Flavor line.
    const blurb = makeText(def.blurb, 'micro', { fontSize: 16, fill: hex(COLORS.textDim), align: 'center' });
    blurb.anchor.set(0.5, 0);
    blurb.position.set(0, H * 0.2);
    if (blurb.width > W - 26) blurb.scale.set((W - 26) / blurb.width);
    this.addChild(blurb);

    // Influence-dot row (v2 §9): count = grade, color = wanted-neighbor element.
    this.buildDotRow();

    // Cost row: two compact chips — energy load + gold price.
    this.buildCostRow(opts.energyIcon, opts.goldIcon);
    this.buildLockOverlay();
  }

  /**
   * A row of dots under the flavor line: one per synergy slot the card has at its
   * grade, colored by the element it wants in that slot (its own element for
   * support cards). Mirrors the lit dots that appear once the card is placed.
   */
  private buildDotRow(): void {
    const slots = Math.min(Math.max(this.grade, 1), 3);
    const els =
      this.def.category === 'support'
        ? Array.from({ length: slots }, () => this.def.element)
        : Array.from({ length: slots }, (_, i) => this.def.slotElements[i] ?? this.def.element);
    const g = new Graphics();
    const r = 6;
    const gap = 22;
    const startX = -((els.length - 1) * gap) / 2;
    const y = this.cardH * 0.3;
    els.forEach((el, i) => {
      const color = ELEMENTS[el].glow;
      const x = startX + i * gap;
      g.circle(x, y, r + 2).fill({ color: COLORS.black, alpha: 0.5 });
      g.circle(x, y, r).fill({ color, alpha: 0.95 });
      g.circle(x, y, r + 3).stroke({ width: 2, color, alpha: 0.4 });
    });
    this.addChild(g);
  }

  /**
   * Compact cost row at the bottom of the card: a small energy chip (the load
   * this card adds to the network; `-n` green for generators) and a gold chip
   * (its play price). Both are origin-centered so they travel with the card.
   */
  private buildCostRow(energyIcon?: Texture, goldIcon?: Texture): void {
    const W = this.cardW;
    const H = this.cardH;

    const gap = 10;
    const chipH = 40;
    const chipW = (W - 24 - gap) / 2;
    const cy = H / 2 - chipH / 2 - 14; // sits just inside the bottom edge
    const leftCx = -gap / 2 - chipW / 2;
    const rightCx = gap / 2 + chipW / 2;

    // --- Energy chip (load) ---
    const load = this.def.baseLoad;
    const energyColor = load > 0 ? COLORS.energyWarn : load < 0 ? COLORS.energyOk : COLORS.textDim;
    const energyBg = new Graphics();
    this.paintChip(energyBg, leftCx, cy, chipW, chipH, energyColor);
    this.addChild(energyBg);
    const energyValue = makeText(`${load > 0 ? '+' : ''}${load}`, 'value', { fontSize: 26, fill: hex(energyColor) });
    this.layoutChipContent(leftCx, cy, chipW, chipH, energyIcon, energyValue);

    // --- Gold chip (price) ---
    this.goldChipRect = [rightCx - chipW / 2, cy - chipH / 2, chipW, chipH];
    this.addChild(this.goldChipBg);
    this.goldValue = makeText(String(this.def.costGold), 'value', { fontSize: 26, fill: hex(COLORS.gold) });
    this.paintChip(this.goldChipBg, rightCx, cy, chipW, chipH, COLORS.gold);
    this.layoutChipContent(rightCx, cy, chipW, chipH, goldIcon, this.goldValue);
  }

  /** Draw a single rounded cost-chip background with a colored edge. */
  private paintChip(g: Graphics, cx: number, cy: number, w: number, h: number, color: number): void {
    g.clear();
    g.roundRect(cx - w / 2, cy - h / 2, w, h, 12).fill({ color: COLORS.black, alpha: 0.5 });
    g.roundRect(cx - w / 2, cy - h / 2, w, h, 12).stroke({ width: 2.5, color, alpha: 0.9 });
  }

  /** Center an [icon][value] cluster inside a chip and attach both to the card. */
  private layoutChipContent(cx: number, cy: number, w: number, _h: number, icon: Texture | undefined, value: Text): void {
    value.anchor.set(0, 0.5);
    const iconSize = 26;
    const gap = 6;
    const hasIcon = icon !== undefined;
    const clusterW = (hasIcon ? iconSize + gap : 0) + value.width;
    let x = cx - Math.min(clusterW, w - 12) / 2;
    if (hasIcon) {
      const sp = new Sprite(icon);
      fitSprite(sp, iconSize, iconSize);
      sp.position.set(x + iconSize / 2, cy);
      this.addChild(sp);
      x += iconSize + gap;
    }
    value.position.set(x, cy);
    this.addChild(value);
  }

  /** Dark + red veil drawn over the whole card while it is unaffordable. */
  private buildLockOverlay(): void {
    const W = this.cardW;
    const H = this.cardH;
    const veil = new Graphics();
    veil.roundRect(-W / 2, -H / 2, W, H, 20).fill({ color: COLORS.black, alpha: 0.5 });
    veil.roundRect(-W / 2, -H / 2, W, H, 20).stroke({ width: 5, color: COLORS.energyDanger, alpha: 0.85 });
    this.lockOverlay.addChild(veil);
    const label = makeText('NEED GOLD', 'label', { fontSize: 26, fill: hex(COLORS.energyDanger) });
    label.anchor.set(0.5);
    if (label.width > W - 30) label.scale.set((W - 30) / label.width);
    this.lockOverlay.addChild(label);
    this.lockOverlay.visible = false;
    this.addChild(this.lockOverlay);
  }

  /**
   * Mark whether the player can pay for this card. Unaffordable cards show a red
   * "locked" veil and recolor the gold chip; the scene refuses to start a drag
   * on them (they can still be tapped for the info plaque).
   */
  setAffordable(affordable: boolean): void {
    if (this.affordable === affordable) return;
    this.affordable = affordable;
    this.lockOverlay.visible = !affordable;
    this.cursor = affordable ? 'grab' : 'not-allowed';
    const color = affordable ? COLORS.gold : COLORS.energyDanger;
    this.goldValue.style.fill = hex(color);
    const [x, y, w, h] = this.goldChipRect;
    this.paintChip(this.goldChipBg, x + w / 2, y + h / 2, w, h, color);
  }
}
