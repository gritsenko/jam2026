import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { CardDef } from '../config/types';
import { drawPanel, makeText } from './helpers';

/** Grade-resolved stats the panel reads (mirrors game/BattleSim's ResolvedTowerStats). */
export interface InspectStats {
  damage: number;
  cooldown: number;
  rangeCells: number;
}

/**
 * Top HUD plaque shown while a placed tower is inspected (tap-to-inspect). Reads
 * out the tower's name + element, its grade-resolved stats, and what it
 * broadcasts to neighboring slots. Hidden until {@link show}. Origin top-left;
 * the scene sets its width and position.
 */
export class TowerInfoPanel extends Container {
  private bg = new Graphics();
  private title: Text;
  private element: Text;
  private stats: Text;
  private effect: Text;
  private flavor: Text;
  private panelW = 760;
  readonly panelH = 174;

  constructor() {
    super();
    this.addChild(this.bg);
    this.title = makeText('', 'title', { fontSize: 32 });
    this.element = makeText('', 'label', { fontSize: 22 });
    this.element.anchor.set(1, 0);
    this.stats = makeText('', 'small', { fontSize: 22, fill: hex(COLORS.textBright) });
    this.effect = makeText('', 'small', { fontSize: 22, fill: hex(COLORS.textDim) });
    this.flavor = makeText('', 'micro', { fontSize: 20, fill: hex(COLORS.textMuted) });
    this.addChild(this.title, this.element, this.stats, this.effect, this.flavor);
    this.visible = false;
    this.redraw();
  }

  /** Resize to the available HUD width (called on layout / resize). */
  setWidth(width: number): void {
    this.panelW = Math.max(360, width);
    this.redraw();
  }

  show(def: CardDef, grade: number, stats: InspectStats): void {
    const skin = ELEMENTS[def.element];
    this.title.text = grade > 1 ? `${def.shortName}  Lv${grade}` : def.shortName;
    this.title.style.fill = hex(skin.glow);
    this.element.text = skin.label;
    this.element.style.fill = hex(skin.base);

    if (def.category === 'attacking' && def.rangeCells) {
      this.stats.text = `DMG ${stats.damage}     CD ${stats.cooldown.toFixed(1)}s     RNG ${stats.rangeCells.toFixed(1)}`;
    } else {
      this.stats.text = 'SUPPORT • passive';
    }

    const buff = def.buff;
    if (buff) {
      const targets =
        buff.scope === 'adjacent'
          ? 'all neighbors'
          : def.directions.length
            ? def.directions.join(' / ')
            : '—';
      const verb = buff.value >= 0 ? 'Buffs' : 'Drains';
      this.effect.text = `${verb} ${targets}:  ${buff.label}`;
      this.effect.style.fill = hex(buff.value >= 0 ? COLORS.dropValid : COLORS.energyDanger);
    } else {
      this.effect.text = def.blurb;
      this.effect.style.fill = hex(COLORS.textDim);
    }

    // Flavor line under the effect (skipped when the effect line already shows it).
    this.flavor.text = buff ? def.blurb : '';

    this.redraw();
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  private redraw(): void {
    const W = this.panelW;
    const H = this.panelH;
    const pad = 22;

    this.bg.clear();
    drawPanel(this.bg, 0, 0, W, H, {
      radius: 16,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 3,
      bevel: true,
    });

    this.element.position.set(W - pad, 18);
    this.title.position.set(pad, 14);
    this.stats.position.set(pad, 62);
    this.effect.position.set(pad, 98);
    this.flavor.position.set(pad, 134);

    // Keep the stat / effect / flavor lines inside the panel.
    const maxW = W - pad * 2;
    for (const t of [this.stats, this.effect, this.flavor]) {
      t.scale.set(1);
      if (t.width > maxW) t.scale.set(maxW / t.width);
    }
    // Title must not collide with the right-aligned element label.
    this.title.scale.set(1);
    const titleMax = W - pad * 2 - this.element.width - 16;
    if (titleMax > 0 && this.title.width > titleMax) this.title.scale.set(titleMax / this.title.width);
  }
}
