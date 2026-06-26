import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { COLORS, ELEMENTS, hex, type ElementId } from '../theme';
import { formatGoldAmount } from '../config/battleRules';
import type { BuffStat, CardDef } from '../config/types';
import { cardGrade } from '../config/cards';
import { reactionFor } from '../config/resonance';
import { SUPERCONDUCT_TEMPO_MULT } from '../config/combatRules';
import type { SlotSynergy } from '../game/synergy';
import { drawPanel, fitSprite, makeText } from './helpers';

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
  /** Bold element-symbol sprite shown left of the element label (readability). */
  private elementSym = new Sprite(Texture.EMPTY);
  private symbols?: Partial<Record<ElementId, Texture>>;
  private stats: Text;
  private signature: Text;
  private outgoing: Text;
  private incoming: Text;
  /** Right-side overload readout: caption + the live fire-rate penalty (v3 §3.А). */
  private overloadLabel: Text;
  private overloadValue: Text;
  /** Last shown overload percent (0 = no penalty → readout hidden). */
  private overloadPct = 0;
  /** Slipways-style row of synergy slots (one per grade level, v2 §9). */
  private slotsRow = new Container();
  /** Caption above the synergy-slot row. */
  private slotsLabel: Text;
  private panelW = 760;
  private basePanelH = 286;
  private actionExtraH = 0;
  private static readonly ACTION_ROW_H = 44;
  private static readonly ACTION_ROW_GAP = 14;
  /** Hold-to-sell row (test mechanic). */
  private sellRow = new Container();
  private sellBg = new Graphics();
  private sellLabel: Text;
  private sellProgress = new Graphics();
  private sellHold = 0;
  private sellHoldSec = 0.4;
  private sellHolding = false;
  private sellCallback?: () => void;
  private sellVisible = false;

  get panelH(): number {
    return this.basePanelH + this.actionExtraH;
  }

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
    this.overloadLabel = makeText('OVERLOAD', 'label', { fontSize: 15, fill: hex(COLORS.textMuted) });
    this.overloadLabel.anchor.set(1, 0);
    this.overloadLabel.visible = false;
    this.overloadValue = makeText('', 'value', { fontSize: 24, fill: hex(COLORS.energyDanger) });
    this.overloadValue.anchor.set(1, 0);
    this.overloadValue.visible = false;
    this.slotsLabel = makeText('SYNERGY SLOTS', 'label', { fontSize: 18, fill: hex(COLORS.textMuted) });
    this.sellLabel = makeText('', 'label', { fontSize: 22, fill: hex(COLORS.dropValid) });
    this.sellLabel.anchor.set(0.5);
    this.sellRow.addChild(this.sellBg, this.sellProgress, this.sellLabel);
    this.sellRow.visible = false;
    this.sellRow.eventMode = 'static';
    this.sellRow.cursor = 'pointer';
    this.sellRow.on('pointerdown', () => {
      this.sellHolding = true;
      this.sellHold = 0;
    });
    this.sellRow.on('pointerup', () => this.cancelSellHold());
    this.sellRow.on('pointerupoutside', () => this.cancelSellHold());
    this.elementSym.visible = false;
    this.addChild(
      this.title,
      this.element,
      this.elementSym,
      this.stats,
      this.signature,
      this.outgoing,
      this.incoming,
      this.overloadLabel,
      this.overloadValue,
      this.slotsLabel,
      this.slotsRow,
      this.sellRow,
    );
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
    const symTex = this.symbols?.[def.element];
    if (symTex) {
      this.elementSym.texture = symTex;
      fitSprite(this.elementSym, 30, 30);
      this.elementSym.visible = true;
    } else {
      this.elementSym.visible = false;
    }

    // Modernization card: a global platform upgrade, not a tower — show the effect
    // line and skip the combat / synergy readouts (they don't apply).
    if (def.category === 'modernization') {
      this.stats.text = 'PLATFORM UPGRADE';
      this.stats.style.fill = hex(COLORS.crystal);
      this.signature.text = def.blurb;
      this.outgoing.text = '';
      this.incoming.text = '';
      this.slotsLabel.visible = false;
      this.slotsRow.removeChildren().forEach((c) => c.destroy());
      this.overloadPct = 0;
      this.overloadLabel.visible = false;
      this.overloadValue.visible = false;
      this.clearTowerActions();
      this.redraw();
      this.visible = true;
      return;
    }
    this.stats.style.fill = hex(COLORS.textBright);
    this.slotsLabel.visible = true;

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

    // Reset the overload readout; the scene feeds the live value via setOverload.
    this.overloadPct = 0;
    this.overloadLabel.visible = false;
    this.overloadValue.visible = false;

    this.redraw();
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.clearTowerActions();
  }

  /** Show hold-to-sell button with the refund preview. */
  setSell(refundGold: number, onSell: () => void): void {
    this.sellCallback = onSell;
    this.sellLabel.text = `HOLD TO SELL  +${formatGoldAmount(refundGold)}g`;
    this.sellVisible = true;
    this.recalcActionHeight();
    this.sellRow.visible = true;
    this.redraw();
  }

  clearTowerActions(): void {
    this.clearSell();
  }

  clearSell(): void {
    this.cancelSellHold();
    this.sellCallback = undefined;
    this.sellVisible = false;
    this.sellRow.visible = false;
    this.sellProgress.clear();
    this.recalcActionHeight();
  }

  private recalcActionHeight(): void {
    const row = TowerInfoPanel.ACTION_ROW_H + TowerInfoPanel.ACTION_ROW_GAP;
    this.actionExtraH = this.sellVisible ? row : 0;
  }

  /** Advance hold-to-sell progress (call from scene update). */
  tick(dt: number): void {
    if (!this.sellHolding || !this.sellVisible) return;
    this.sellHold += dt;
    this.drawSellProgress();
    if (this.sellHold >= this.sellHoldSec) {
      this.sellHolding = false;
      this.sellHold = 0;
      this.sellProgress.clear();
      const cb = this.sellCallback;
      this.clearSell();
      cb?.();
    }
  }

  private cancelSellHold(): void {
    this.sellHolding = false;
    this.sellHold = 0;
    this.sellProgress.clear();
  }

  private drawSellProgress(): void {
    const W = this.panelW - 44;
    const H = TowerInfoPanel.ACTION_ROW_H;
    const t = Math.min(1, this.sellHold / this.sellHoldSec);
    this.sellProgress.clear();
    this.sellProgress.roundRect(0, 0, W, H, 10).stroke({ width: 3, color: COLORS.brass, alpha: 0.5 });
    if (t > 0) {
      this.sellProgress
        .roundRect(0, 0, W * t, H, 10)
        .fill({ color: COLORS.dropValid, alpha: 0.35 });
    }
  }

  /** Provide the element-symbol textures shown beside the element label. */
  setSymbolTextures(symbols: Partial<Record<ElementId, Texture>>): void {
    this.symbols = symbols;
  }

  /**
   * Live overload penalty for the inspected tower (v3 §3.А), shown as a separate
   * right-side readout. `pct` is the percent of fire rate lost; 0 hides it. The
   * scene pushes this every frame while a tower is inspected, so it tracks load /
   * capacity changes. Reflows only when the value actually changes.
   */
  setOverload(pct: number): void {
    const next = Math.max(0, Math.round(pct));
    if (next === this.overloadPct) return;
    this.overloadPct = next;
    const visible = next > 0;
    this.overloadValue.text = visible ? `-${next}% SPD` : '';
    this.overloadLabel.visible = visible;
    this.overloadValue.visible = visible;
    this.redraw();
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
    if (this.elementSym.visible) {
      // Sit the symbol just left of the right-aligned element label.
      this.elementSym.position.set(W - pad - this.element.width - 18, 16 + this.element.height / 2);
    }
    this.title.position.set(pad, 12);
    this.stats.position.set(pad, 56);
    this.signature.position.set(pad, 90);
    this.outgoing.position.set(pad, 122);
    this.incoming.position.set(pad, 154);
    this.slotsLabel.position.set(pad, 188);
    this.slotsRow.position.set(pad, 212);

    // Overload penalty: a separate readout stacked in the top-right, under the
    // element label. Reserves a right column so the stats/signature lines (which
    // share those rows) never run under it.
    let rightColW = 0;
    if (this.overloadValue.visible) {
      this.overloadLabel.scale.set(1);
      this.overloadValue.scale.set(1);
      this.overloadLabel.position.set(W - pad, 50);
      this.overloadValue.position.set(W - pad, 68);
      rightColW = Math.max(this.overloadLabel.width, this.overloadValue.width) + 18;
    }

    // Keep the lines inside the panel; the top two rows also clear the right column.
    const maxW = W - pad * 2;
    const topMaxW = maxW - rightColW;
    for (const t of [this.stats, this.signature]) {
      t.scale.set(1);
      if (t.width > topMaxW) t.scale.set(topMaxW / t.width);
    }
    for (const t of [this.outgoing, this.incoming]) {
      t.scale.set(1);
      if (t.width > maxW) t.scale.set(maxW / t.width);
    }
    this.title.scale.set(1);
    const titleMax = W - pad * 2 - this.element.width - 16;
    if (titleMax > 0 && this.title.width > titleMax) this.title.scale.set(titleMax / this.title.width);

    if (this.sellVisible) {
      const pad = 22;
      const sellW = W - pad * 2;
      const sellH = TowerInfoPanel.ACTION_ROW_H;
      this.sellRow.position.set(pad, H - pad - sellH);
      this.sellBg.clear();
      drawPanel(this.sellBg, 0, 0, sellW, sellH, {
        radius: 10,
        fill: COLORS.metalDark,
        edge: COLORS.brass,
        edgeWidth: 2,
      });
      this.sellLabel.position.set(sellW / 2, sellH / 2);
      this.sellProgress.position.set(0, 0);
      this.sellRow.hitArea = new Rectangle(0, 0, sellW, sellH);
    }
  }
}
