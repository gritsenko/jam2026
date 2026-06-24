import type { BuffStat, ElementId, PlacedCard, ReactionId } from '../config/types';
import { CARDS, cardGrade, synergySlots } from '../config/cards';
import { reactionFor } from '../config/resonance';

/**
 * Positional synergy resolution (v2 §2). A placed card broadcasts its buff to
 * every orthogonal neighbor (Grade I–II) and additionally to the four diagonals
 * at Grade III. Resonance follows the "different sources" rule (§2.В): a turret's
 * *element pool* is its own element plus the distinct elements of the neighbors
 * influencing it; any element-pair in that pool that matches the Resonance Table
 * (§7) fires a reaction — but only from Grade II (two synergy slots).
 *
 * This is pure data (no Pixi): the scene feeds it the 9-slot placement and reads
 * the result to (a) scale tower stats in the sim, (b) light the influence dots
 * and arrows on the grid, and (c) fill the inspection panel.
 */

/** One buff a turret receives from a particular neighbor. */
export interface IncomingBuff {
  /** Source slot index. */
  readonly from: number;
  readonly element: ElementId;
  readonly stat: BuffStat;
  /** Signed percent (+22 = +22%, -15 = a penalty). */
  readonly value: number;
}

/** One influence dot under a card (v2 §9). */
export interface SynergyDot {
  /** Color of the dot = the desired-neighbor element (or the support's own element). */
  readonly element: ElementId;
  /** Lit when the wanted synergy is actually present. */
  readonly lit: boolean;
  /** True for support "coverage" dots (served neighbors) vs desired-element dots. */
  readonly coverage: boolean;
}

/** Resolved synergy for one occupied slot. */
export interface SlotSynergy {
  /** Stat multipliers (1 = unchanged); tempo > 1 = faster fire. */
  readonly damageMult: number;
  readonly rangeMult: number;
  readonly tempoMult: number;
  readonly defenseMult: number;
  /** Every incoming buff, for the inspection panel. */
  readonly incoming: IncomingBuff[];
  /** Distinct elements of the neighbors influencing this slot. */
  readonly incomingElements: ElementId[];
  /** Active resonance reactions on this turret. */
  readonly reactions: ReactionId[];
  /** Influence dots to draw under the card. */
  readonly dots: SynergyDot[];
  readonly resonant: boolean;
  /** Attacking neighbors a support card serves (coverage). */
  readonly coverage: number;
}

function emptySynergy(): SlotSynergy {
  return {
    damageMult: 1,
    rangeMult: 1,
    tempoMult: 1,
    defenseMult: 1,
    incoming: [],
    incomingElements: [],
    reactions: [],
    dots: [],
    resonant: false,
    coverage: 0,
  };
}

const colOf = (i: number) => i % 3;
const rowOf = (i: number) => Math.floor(i / 3);

/** Does the card at slot `from` broadcast as far as slot `to`? */
function reaches(from: number, to: number, placed: PlacedCard): boolean {
  const dc = colOf(to) - colOf(from);
  const dr = rowOf(to) - rowOf(from);
  const adc = Math.abs(dc);
  const adr = Math.abs(dr);
  if (adc + adr === 1) return true; // orthogonal — always
  if (adc === 1 && adr === 1) {
    const def = CARDS[placed.cardId];
    return def ? cardGrade(def, placed.grade).diagonal === true : false; // diagonal — Grade III only
  }
  return false;
}

const mult = (sumPct: number): number => Math.max(0.1, 1 + sumPct / 100);

/**
 * Resolve synergy for all nine slots. Index i is null when empty; otherwise it
 * carries the aggregated multipliers, incoming buffs, reactions and dots.
 */
export function computeSynergy(slots: readonly (PlacedCard | null)[]): (SlotSynergy | null)[] {
  return slots.map((placed, i) => (placed ? resolveSlot(slots, i, placed) : null));
}

function resolveSlot(
  slots: readonly (PlacedCard | null)[],
  index: number,
  placed: PlacedCard,
): SlotSynergy {
  const def = CARDS[placed.cardId];
  if (!def) return emptySynergy();

  const incoming: IncomingBuff[] = [];
  const elementSet = new Set<ElementId>();
  let dmgPct = 0;
  let rangePct = 0;
  let tempoPct = 0;
  let defPct = 0;

  // Gather every neighbor whose broadcast reaches this slot.
  for (let j = 0; j < slots.length; j++) {
    if (j === index) continue;
    const n = slots[j];
    if (!n) continue;
    if (!reaches(j, index, n)) continue;
    const ndef = CARDS[n.cardId];
    if (!ndef) continue;
    const g = cardGrade(ndef, n.grade);

    const push = (stat: BuffStat, value: number) => {
      if (value === 0) return;
      incoming.push({ from: j, element: ndef.element, stat, value });
      if (stat === 'damage') dmgPct += value;
      else if (stat === 'range') rangePct += value;
      else if (stat === 'tempo') tempoPct += value;
      else defPct += value;
    };

    push(ndef.buffStat, g.buff);
    if (g.bonusDamage && ndef.buffStat !== 'damage') push('damage', g.bonusDamage);
    elementSet.add(ndef.element);
  }

  // Resonance: pool = own element + influencing-neighbor elements. Each matching
  // pair in the table fires, gated to Grade II+ (two synergy slots). Support
  // cards don't resonate (no projectiles to carry the effect).
  const reactions: ReactionId[] = [];
  if (def.category === 'attacking' && placed.grade >= 2) {
    const pool: ElementId[] = [def.element, ...elementSet];
    const distinct = [...new Set(pool)];
    const seen = new Set<ReactionId>();
    const cap = synergySlots(placed.grade);
    for (let a = 0; a < distinct.length && reactions.length < cap; a++) {
      for (let b = a + 1; b < distinct.length && reactions.length < cap; b++) {
        const r = reactionFor(distinct[a]!, distinct[b]!);
        if (r && !seen.has(r.id)) {
          seen.add(r.id);
          reactions.push(r.id);
        }
      }
    }
  }

  // Influence dots (§9).
  const dots: SynergyDot[] = [];
  let coverage = 0;
  if (def.category === 'support') {
    // Coverage dots: how many attacking neighbors this support reaches.
    for (let j = 0; j < slots.length; j++) {
      if (j === index) continue;
      const n = slots[j];
      if (!n) continue;
      if (!reaches(index, j, placed)) continue; // does *this* card reach j?
      const ndef = CARDS[n.cardId];
      if (ndef?.category === 'attacking') coverage++;
    }
    const slotCount = synergySlots(placed.grade);
    for (let k = 0; k < slotCount; k++) {
      dots.push({ element: def.element, lit: k < coverage, coverage: true });
    }
  } else {
    // Desired-element dots: one per open synergy slot, lit when that element is present.
    const slotCount = synergySlots(placed.grade);
    for (let k = 0; k < slotCount; k++) {
      const want = def.slotElements[k] ?? def.element;
      dots.push({ element: want, lit: elementSet.has(want), coverage: false });
    }
  }

  return {
    damageMult: mult(dmgPct),
    rangeMult: mult(rangePct),
    tempoMult: mult(tempoPct),
    defenseMult: mult(defPct),
    incoming,
    incomingElements: [...elementSet],
    reactions,
    dots,
    resonant: reactions.length > 0,
    coverage,
  };
}
