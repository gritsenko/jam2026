import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { BuffStat, CardDef } from '../config/types';
import { cardGrade } from '../config/cards';
import { getReaction } from '../config/resonance';
import { SUPERCONDUCT_TEMPO_MULT } from '../config/combatRules';
import type { SlotSynergy } from '../game/synergy';
import { drawPanel, makeText } from './helpers';

/** Grade-resolved base stats the panel reads (mirrors game/BattleSim's ResolvedTowerStats). */
export interface InspectStats {
  damage: number;
  cooldown: number;
  rangeCells: number;
  signatureLabel: string;
}

const STAT_SUFFIX: Record<BuffStat, string> = {
  damage: 'DMG',
  range: 'RNG',
  tempo: 'SPD',
  defense: 'DEF',
};

/**
 * Top HUD plaque shown while a placed tower is inspected (or a hand card tapped).
 * Reads out name + element, the grade-resolved (and synergy-scaled) combat stats,
 * the signature parameter, what the card broadcasts to neighbors, the buffs it is
 * receiving, and any active resonance reaction (v2 §9 "Node effects"). Origin
 * top-left; the scene sets its width and position.
 */
export class TowerInfoPanel extends Container {
  private bg = new Graphics();
  private title: Text;
  private element: Text;
  private stats: Text;
  private signature: Text;
  private outgoing: Text;
  private incoming: Text;
  private resonance: Text;
  private panelW = 760;
  readonly panelH = 232;

  constructor() {
    super();
    this.addChild(this.bg);
    this.title = makeText('', 'title', { fontSize: 32 });
    this.element = makeText('', 'label', { fontSize: 22 });
    this.element.anchor.set(1, 0);
    this.stats = makeText('', 'small', { fontSize: 22, fill: hex(COLORS.textBright) });
    this.signature = makeText('', 'label', { fontSize: 20, fill: hex(COLORS.crystal) });
    this.outgoing = makeText('', 'small', { fontSize: 20, fill: hex(COLORS.dropValid) });
    this.incoming = makeText('', 'small', { fontSize: 20, fill: hex(COLORS.textDim) });
    this.resonance = makeText('', 'label', { fontSize: 22, fill: hex(COLORS.energyOverdrive) });
    this.addChild(this.title, this.element, this.stats, this.signature, this.outgoing, this.incoming, this.resonance);
    this.visible = false;
    this.redraw();
  }

  /** Resize to the available HUD width (called on layout / resize). */
  setWidth(width: number): void {
    this.panelW = Math.max(360, width);
    this.redraw();
  }

  /**
   * Populate from a card at a grade. When `synergy` is supplied (a placed tower)
   * the stats are scaled by its neighbor buffs and the resonance line is filled;
   * for a tapped hand card pass null and base stats show.
   */
  show(def: CardDef, grade: number, stats: InspectStats, synergy: SlotSynergy | null = null): void {
    const skin = ELEMENTS[def.element];
    this.title.text = grade > 1 ? `${def.shortName}  Lv${grade}` : def.shortName;
    this.title.style.fill = hex(skin.glow);
    this.element.text = skin.label;
    this.element.style.fill = hex(skin.base);

    // Net combat stats (apply synergy mults when inspecting a placed tower).
    const dMult = synergy?.damageMult ?? 1;
    const rMult = synergy?.rangeMult ?? 1;
    const tMult = (synergy?.tempoMult ?? 1) * (synergy?.reactions.includes('superconductivity') ? SUPERCONDUCT_TEMPO_MULT : 1);
    if (def.category === 'attacking' && stats.rangeCells > 0) {
      const dmg = Math.round(stats.damage * dMult);
      const cd = stats.cooldown / Math.max(0.1, tMult);
      const rng = stats.rangeCells * rMult;
      const dps = cd > 0 ? Math.round(dmg / cd) : 0;
      this.stats.text = `DMG ${dmg}  •  CD ${cd.toFixed(1)}s  •  RNG ${rng.toFixed(1)}  •  DPS ${dps}`;
    } else {
      this.stats.text = 'SUPPORT • passive';
    }

    this.signature.text = stats.signatureLabel;

    // Outgoing broadcast.
    const g = cardGrade(def, grade);
    if (g.buff !== 0 || g.bonusDamage) {
      const verb = g.buff >= 0 ? 'Buffs' : 'Drains';
      const parts: string[] = [];
      if (g.buff !== 0) parts.push(`${g.buff >= 0 ? '+' : ''}${g.buff}% ${STAT_SUFFIX[def.buffStat]}`);
      if (g.bonusDamage) parts.push(`+${g.bonusDamage}% DMG`);
      const reach = g.diagonal ? 'all neighbors' : 'orthogonal neighbors';
      this.outgoing.text = `→ ${verb} ${reach}:  ${parts.join('  ')}`;
      this.outgoing.style.fill = hex(g.buff >= 0 ? COLORS.dropValid : COLORS.energyDanger);
    } else {
      this.outgoing.text = `→ ${def.blurb}`;
      this.outgoing.style.fill = hex(COLORS.textDim);
    }

    // Incoming buffs.
    if (synergy && synergy.incoming.length > 0) {
      const byStat = new Map<BuffStat, number>();
      for (const b of synergy.incoming) byStat.set(b.stat, (byStat.get(b.stat) ?? 0) + b.value);
      const parts = [...byStat.entries()].map(([s, v]) => `${v >= 0 ? '+' : ''}${v}% ${STAT_SUFFIX[s]}`);
      this.incoming.text = `← Receiving:  ${parts.join('  ')}`;
    } else {
      this.incoming.text = synergy ? '← Receiving: none' : '';
    }

    // Resonance line.
    if (synergy && synergy.reactions.length > 0) {
      this.resonance.text = `RESONANCE: ${synergy.reactions.map((r) => getReaction(r).name).join(' + ')}`;
      this.resonance.visible = true;
    } else {
      this.resonance.visible = false;
    }

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

    this.element.position.set(W - pad, 16);
    this.title.position.set(pad, 12);
    this.stats.position.set(pad, 56);
    this.signature.position.set(pad, 90);
    this.outgoing.position.set(pad, 122);
    this.incoming.position.set(pad, 154);
    this.resonance.position.set(pad, 190);

    // Keep the lines inside the panel.
    const maxW = W - pad * 2;
    for (const t of [this.stats, this.signature, this.outgoing, this.incoming, this.resonance]) {
      t.scale.set(1);
      if (t.width > maxW) t.scale.set(maxW / t.width);
    }
    this.title.scale.set(1);
    const titleMax = W - pad * 2 - this.element.width - 16;
    if (titleMax > 0 && this.title.width > titleMax) this.title.scale.set(titleMax / this.title.width);
  }
}
