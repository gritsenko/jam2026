// Bot policies: produce the platform board (9 slots) to play a level with.
//  - seeded:      the as-dealt starting board (deterministic).
//  - greedyFill:  fill every empty slot with unlocked attackers (deterministic).
//  - randomBoard: seeded-random layout of unlocked towers (STOCHASTIC) → a 1000-seed
//                 sweep yields a real win-rate distribution.
// Smarter policies (drawing/merge/economy) are a later increment (autotest §0/§1).

import { createBattleState } from '../../src/config/battleState';
import { unlockedTowersForLevel } from '../../src/config/progression';
import { CARD_LIST } from '../../src/config/cards';
import type { PlacedCard } from '../../src/config/types';
import { makeRng } from './rng';

export type PolicyName = 'seeded' | 'greedyFill' | 'randomBoard' | 'smart';
export const POLICIES: PolicyName[] = ['seeded', 'greedyFill', 'randomBoard', 'smart'];

/** Human labels for the design editor policy picker. */
export const POLICY_LABELS: Record<PolicyName, string> = {
  smart: 'smart — играет (merge/burn/reroll/fusion)',
  seeded: 'seeded — стартовая доска',
  greedyFill: 'greedyFill — заполнить все слоты',
  randomBoard: 'randomBoard — случайная доска',
};

/** Resolve POLICY env / editor body: one policy, or all when omitted / `all`. */
export function policiesToRun(filter?: string): PolicyName[] {
  const f = filter?.trim();
  if (!f || f === 'all') return [...POLICIES];
  if ((POLICIES as string[]).includes(f)) return [f as PolicyName];
  throw new Error(`unknown policy: ${f} (expected ${POLICIES.join('|')} or all)`);
}

/** Whether a policy varies by seed (so the seed sweep is meaningful). */
export function isStochastic(policy: PolicyName): boolean {
  return policy === 'randomBoard' || policy === 'smart';
}

/** Whether a policy plays actively over time (SmartController) vs a static board. */
export function isActive(policy: PolicyName): boolean {
  return policy === 'smart';
}

/** The board a policy plays for `levelId` (seed only matters for stochastic policies). */
export function boardFor(policy: PolicyName, levelId: string, seed: number): (PlacedCard | null)[] {
  const unlocked = unlockedTowersForLevel(levelId);
  const slots = createBattleState(unlocked).slots.slice();
  const attackers = CARD_LIST.filter(
    (c) => c.category === 'attacking' && !c.hybrid && unlocked.has(c.id),
  ).map((c) => c.id);
  const placeable = CARD_LIST.filter(
    (c) => c.category !== 'modernization' && !c.hybrid && unlocked.has(c.id),
  ).map((c) => c.id);

  if (policy === 'greedyFill' && attackers.length > 0) {
    let k = 0;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) {
        slots[i] = { cardId: attackers[k % attackers.length]!, grade: 1 };
        k++;
      }
    }
  }

  if (policy === 'randomBoard' && placeable.length > 0) {
    const rng = makeRng(seed * 2654435761 + hashStr(levelId));
    const blank: (PlacedCard | null)[] = [null, null, null, null, null, null, null, null, null];
    const count = 4 + rng.int(6); // 4..9 towers
    const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    for (let n = 0; n < count; n++) {
      const slot = idx[n]!;
      blank[slot] = { cardId: rng.pick(placeable), grade: 1 };
    }
    return blank;
  }

  return slots;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
