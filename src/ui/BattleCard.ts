import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { CardDef } from '../config/types';
import { drawPanel, fitSprite, makeText } from './helpers';

export interface BattleCardOptions {
  width?: number;
  height?: number;
}

/**
 * A hand card: element-colored frame, art, name, cost and a flavor line.
 * Origin is the center (so it can be lifted/dragged about its middle).
 * Presentational only — interaction (drag/drop) is wired by the scene.
 */
export class BattleCard extends Container {
  readonly def: CardDef;
  readonly grade: number;
  readonly cardW: number;
  readonly cardH: number;

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

    // (No Synergy-Points cost — SP is not a user-facing entity. The card's
    // energy-load chip below communicates its cost to the network instead.)

    // Load chip (top-left): energy load, +n consumes, -n generates.
    const loadPos = def.baseLoad >= 0;
    const loadColor = loadPos ? COLORS.energyWarn : COLORS.energyOk;
    const lc = new Graphics();
    lc.circle(-W / 2 + 26, -H / 2 + 26, 22).fill({ color: COLORS.metalMid });
    lc.circle(-W / 2 + 26, -H / 2 + 26, 22).stroke({ width: 2.5, color: loadColor });
    this.addChild(lc);
    const loadText = makeText(`${def.baseLoad > 0 ? '+' : ''}${def.baseLoad}`, 'small', {
      fontSize: 22,
      fill: hex(loadColor),
    });
    loadText.anchor.set(0.5);
    loadText.position.set(-W / 2 + 26, -H / 2 + 26);
    this.addChild(loadText);
  }
}
