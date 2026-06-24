import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { BuffStat, CardDef } from '../config/types';
import { cardGrade } from '../config/cards';
import { reactionFor } from '../config/resonance';
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
  /** Slipways-style row of synergy slots (one per grade level, v2 §9). */
  private slotsRow = new Container();
  /** Caption above the synergy-slot row. */
  private slotsLabel: Text;
  private panelW = 760;
  readonly panelH = 286;

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
    this.slotsLabel = makeText('SYNERGY SLOTS', 'label', { fontSize: 18, fill: hex(COLORS.textMuted) });
    this.addChild(this.title, this.element, this.stats, this.signature, this.outgoing, this.incoming, this.slotsLabel, this.slotsRow);
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

    // Per-slot synergy breakdown (Slipways-style "resource" row, v2 §9).
    this.buildSlots(def, grade, synergy);

    this.redraw();
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  /**
   * Build the synergy-slot row: one cell per grade level (v2 §9 slot order). Each
   * cell shows the element the slot wants and the effect it grants when present —
   * a resonance reaction, "POWER" or a stat buff. Cells light up when that effect
   * is actually live, dim while merely open, and read "LOCKED" until the tower's
   * grade unlocks them. Support cards show their coverage instead.
   */
  private buildSlots(def: CardDef, grade: number, synergy: SlotSynergy | null): void {
    this.slotsRow.removeChildren().forEach((c) => c.destroy());

    // Support: coverage role, not resonance.
    if (def.slotElements.length === 0) {
      const cov = synergy?.coverage ?? 0;
      const verb = def.signature === 'energy_output' ? 'Powers' : 'Shields';
      const t = makeText(`${verb} ${cov} adjacent tower${cov === 1 ? '' : 's'}`, 'small', {
        fontSize: 20,
        fill: hex(COLORS.textDim),
      });
      this.slotsRow.addChild(t);
      return;
    }

    const maxW = this.panelW - 22 * 2;
    const gap = 12;
    const cellW = (maxW - gap * 2) / 3;
    const cellH = 56;
    const incoming = synergy?.incomingElements ?? [];

    for (let k = 0; k < 3; k++) {
      const el = def.slotElements[k] ?? def.element;
      const skin = ELEMENTS[el];
      const reaction = reactionFor(def.element, el);
      const open = k < grade;
      const active =
        open && synergy ? (reaction ? synergy.reactions.includes(reaction.id) : incoming.includes(el)) : false;
      const effect = def.slotEffects?.[k] ?? (reaction ? reaction.name : el === 'Energy' ? 'POWER' : '+BUFF');

      const cell = new Container();
      cell.position.set(k * (cellW + gap), 0);

      const bg = new Graphics();
      const edge = !open ? COLORS.metalLight : active ? skin.glow : COLORS.brass;
      bg.roundRect(0, 0, cellW, cellH, 10).fill({ color: COLORS.metalDark, alpha: open ? 0.92 : 0.45 });
      bg.roundRect(0, 0, cellW, cellH, 10).stroke({ width: active ? 3 : 2, color: edge, alpha: active ? 1 : 0.6 });
      cell.addChild(bg);

      // Element "LED": dark element socket, lit when the effect is live (§9).
      const dotR = 10;
      const dotX = 20;
      const dotY = cellH / 2;
      const dot = new Graphics();
      dot.circle(dotX, dotY, dotR + 3).fill({ color: skin.dark, alpha: open ? 0.95 : 0.5 });
      if (active) {
        dot.circle(dotX, dotY, dotR + 4).stroke({ width: 2, color: skin.glow, alpha: 0.7 });
        dot.circle(dotX, dotY, dotR).fill({ color: skin.glow });
      } else {
        dot.circle(dotX, dotY, dotR).fill({ color: COLORS.black, alpha: 0.4 });
        dot.circle(dotX, dotY, dotR).stroke({ width: 1.5, color: skin.glow, alpha: open ? 0.6 : 0.3 });
      }
      cell.addChild(dot);

      const textX = dotX + dotR + 10;
      const lv = makeText(`Lv${k + 1}`, 'micro', { fontSize: 15, fill: hex(open ? COLORS.textDim : COLORS.textMuted) });
      lv.position.set(textX, 9);
      cell.addChild(lv);

      const label = makeText(open ? effect : 'LOCKED', 'label', {
        fontSize: 19,
        fill: hex(open ? (active ? skin.glow : COLORS.textBright) : COLORS.textMuted),
      });
      label.position.set(textX, 28);
      const labelMaxW = cellW - textX - 8;
      if (label.width > labelMaxW) label.scale.set(labelMaxW / label.width);
      cell.addChild(label);

      this.slotsRow.addChild(cell);
    }
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
    this.slotsLabel.position.set(pad, 188);
    this.slotsRow.position.set(pad, 212);

    // Keep the lines inside the panel.
    const maxW = W - pad * 2;
    for (const t of [this.stats, this.signature, this.outgoing, this.incoming]) {
      t.scale.set(1);
      if (t.width > maxW) t.scale.set(maxW / t.width);
    }
    this.title.scale.set(1);
    const titleMax = W - pad * 2 - this.element.width - 16;
    if (titleMax > 0 && this.title.width > titleMax) this.title.scale.set(titleMax / this.title.width);
  }
}
