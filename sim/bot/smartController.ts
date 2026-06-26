// Heuristic "smart" controller — a bot that actually plays the game: it places &
// merges towers to maximise board DPS + resonance, grades up, manages the energy
// grid (burn / isolation / emergency overdrive when overloaded), rerolls when
// stuck, plays modernization cards, and crafts fusions. It calls BattleCore's
// hand-driven actions, so it respects the hand + respawn timers like a player.
//
// Decisions run on a coarse cadence (DECISION_SEC), not every frame → fast runs.
// Greedy: each decision takes the single best board action by an estimated score.

import type { BattleCore } from '../../src/game/BattleCore';
import type { ElementId } from '../../src/theme';
import { getCard, cardGrade, cardLoad } from '../../src/config/cards';
import { isTower } from '../../src/game/BattleSim';
import { computeSynergy } from '../../src/game/synergy';
import type { PlacedCard } from '../../src/config/types';
import * as progress from '../../src/game/progress';

export const DECISION_SEC = 0.5; // re-decide ~2×/sec (coarse → cheap)
const RESONANCE_BONUS = 8; // reward per active resonance reaction on a slot
const SUPPORT_VALUE = 4; // flat value for a support tower (shield/stabilizer) on board
const MAX_REROLLS_PER_WAVE = 2;

function loadOf(slots: (PlacedCard | null)[]): number {
  let l = 0;
  for (const s of slots) if (s) l += cardLoad(getCard(s.cardId), s.grade);
  return Math.max(0, l);
}

/** Estimated board strength: summed DPS × synergy, + resonance/support, − overload. */
function scoreBoard(slots: (PlacedCard | null)[], capacity: number): number {
  const syn = computeSynergy(slots);
  let dps = 0;
  let extra = 0;
  slots.forEach((p, i) => {
    if (!p) return;
    const def = getCard(p.cardId);
    const sy = syn[i];
    if (isTower(def, p.grade) && def.signature !== 'barrier') {
      const g = cardGrade(def, p.grade);
      const cd = def.cooldown ?? 1;
      const dmg = (g.damage ?? 0) * (sy?.damageMult ?? 1);
      if (cd > 0) dps += (dmg * (sy?.tempoMult ?? 1)) / cd;
      extra += (sy?.reactions?.length ?? 0) * RESONANCE_BONUS;
    } else {
      extra += SUPPORT_VALUE; // shield/stabilizer/barrier: enable synergy + defense
    }
  });
  let score = dps + extra;
  const over = Math.max(0, loadOf(slots) - capacity);
  if (over > 0) score *= Math.max(0.3, 1 - 0.06 * over);
  return score;
}

function dominantElement(slots: (PlacedCard | null)[]): ElementId | null {
  const counts: Record<string, number> = {};
  for (const p of slots) {
    if (!p) continue;
    const def = getCard(p.cardId);
    if (def.category === 'attacking') counts[def.element] = (counts[def.element] ?? 0) + 1;
  }
  let best: ElementId | null = null;
  let n = 0;
  for (const [el, c] of Object.entries(counts)) if (c > n) { n = c; best = el as ElementId; }
  return best;
}

/** Slot whose removal hurts board score the least (for sell / field-burn). */
function weakestSlot(slots: (PlacedCard | null)[], capacity: number): number {
  const base = scoreBoard(slots, capacity);
  let worst = -1;
  let loss = Infinity;
  slots.forEach((p, i) => {
    if (!p) return;
    const clone = slots.slice();
    clone[i] = null;
    const drop = base - scoreBoard(clone, capacity);
    if (drop < loss) { loss = drop; worst = i; }
  });
  return worst;
}

export class SmartController {
  private acc = 0;
  private lastWave = 1;
  private rerollsThisWave = 0;

  /** Called every sim tick; acts at most once per DECISION_SEC. */
  tick(core: BattleCore, dt: number): void {
    this.acc += dt;
    if (this.acc < DECISION_SEC) return;
    this.acc = 0;
    if (core.waveNumber !== this.lastWave) {
      this.lastWave = core.waveNumber;
      this.rerollsThisWave = 0;
    }
    this.decide(core);
  }

  private decide(core: BattleCore): void {
    const slots = core.state.slots;
    const cap = core.effectiveCapacity;
    const hand = core.hand;
    const over = Math.max(0, core.state.energyLoad - cap);

    // Cheap early-out: if there's genuinely nothing to do (board full, no mergeable
    // hand card, no field merge, no mod card, not overloaded) skip the expensive
    // candidate scoring. This makes late-game / settled boards nearly free.
    const hasEmpty = slots.some((p) => !p);
    const hasMod = hand.some((c) => c && getCard(c.cardId).category === 'modernization');
    const canMergeHand = hand.some(
      (c) => c && getCard(c.cardId).category !== 'modernization' &&
        slots.some((p) => p && p.cardId === c.cardId && p.grade === c.grade && p.grade < 3),
    );
    const canFieldMerge = slots.some((p, a) =>
      p && p.grade < 3 && slots.some((q, b) => b > a && q && q.cardId === p.cardId && q.grade === p.grade),
    );
    const canFuse = core.hasMechanic('fusion') && hand.filter((c) => c).length >= 2;
    if (!hasEmpty && !canMergeHand && !canFieldMerge && !hasMod && !canFuse && over <= 0) return;

    const cur = scoreBoard(slots, cap);

    // Best build action (place / mergeHand / mergeField) by resulting board score.
    let bestScore = cur;
    let bestRun: (() => boolean) | null = null;
    const consider = (clone: (PlacedCard | null)[], run: () => boolean): void => {
      const sc = scoreBoard(clone, cap);
      if (sc > bestScore + 1e-6) { bestScore = sc; bestRun = run; }
    };

    hand.forEach((c, i) => {
      if (!c) return;
      const def = getCard(c.cardId);
      if (def.category === 'modernization') return;
      if (core.gold < def.costGold) return;
      slots.forEach((p, s) => {
        if (p && p.cardId === c.cardId && p.grade === c.grade && p.grade < 3) {
          const clone = slots.slice();
          clone[s] = { cardId: p.cardId, grade: p.grade + 1 };
          consider(clone, () => core.mergeFromHand(i, s));
        } else if (!p) {
          const clone = slots.slice();
          clone[s] = { cardId: c.cardId, grade: c.grade };
          consider(clone, () => core.placeFromHand(i, s));
        }
      });
    });
    slots.forEach((p, a) => {
      if (!p || p.grade >= 3) return;
      slots.forEach((q, b) => {
        if (b <= a || !q || q.cardId !== p.cardId || q.grade !== p.grade) return;
        if (core.gold < getCard(q.cardId).costGold) return;
        const clone = slots.slice();
        clone[b] = { cardId: q.cardId, grade: q.grade + 1 };
        clone[a] = null;
        consider(clone, () => core.mergeField(a, b));
      });
    });

    if (bestRun) { (bestRun as () => boolean)(); return; }

    // No build improvement → support actions, in priority order.
    // Modernization cards in hand.
    const modI = hand.findIndex((c) => c && getCard(c.cardId).category === 'modernization');
    if (modI >= 0) {
      const mod = getCard(hand[modI]!.cardId).mod;
      if (mod === 'isolation' && over > 0 && core.modernizationFromHand(modI)) return;
      if (mod === 'overdrive' && over > 0 && core.modernizationFromHand(modI)) return;
      if (mod === 'focus') {
        const el = dominantElement(slots);
        if (el && core.modernizationFromHand(modI, el)) return;
      }
    }

    // Fusion: craft a hybrid when two hand cards have a recipe and resources allow.
    if (core.hasMechanic('fusion')) {
      for (let i = 0; i < hand.length; i++) {
        for (let j = 0; j < hand.length; j++) {
          if (i !== j && hand[i] && hand[j] && core.fuse(i, j)) return;
        }
      }
    }

    // Burn for capacity when overloaded (spend a non-mod hand card).
    if (over > 0 && core.gold >= core.burnCost()) {
      const j = hand.findIndex((c) => c && getCard(c.cardId).category !== 'modernization');
      if (j >= 0 && core.burnFromHand(j)) return;
    }

    // Field burn: 2× gold, frees a slot + Overdrive (admin test mechanic).
    if (progress.isBurnFieldEnabled() && over > 0 && core.gold >= core.fieldBurnGold()) {
      const w = weakestSlot(slots, cap);
      if (w >= 0 && core.burnFieldTower(w)) return;
    }

    // Sell weakest tower to make room when the hand has a tower we could place.
    if (progress.isSellEnabled() && !hasEmpty) {
      const canPlaceFromHand = hand.some(
        (c) => c && getCard(c.cardId).category !== 'modernization' && core.gold >= getCard(c.cardId).costGold,
      );
      if (canPlaceFromHand) {
        const w = weakestSlot(slots, cap);
        if (w >= 0 && core.sellTower(w)) return;
      }
    }

    // Reroll when stuck (room to build, nothing useful in hand) and affordable.
    const hasRoom = slots.some((p) => !p);
    if (hasRoom && core.hasMechanic('reroll') && this.rerollsThisWave < MAX_REROLLS_PER_WAVE &&
        core.crystals >= core.rerollCost()) {
      if (core.reroll()) { this.rerollsThisWave++; return; }
    }
  }
}
