import type { BattleStateMock, PlacedCard } from './types';
import { cardLoad, getCard } from './cards';
import { towerGoldInvested } from './battleRules';
import { findLevel } from './levels';
import { activeGameConfig } from '../data/load';

/**
 * Builds a fresh mock battle snapshot: the player's starting resources and the
 * pre-placed platform. Three attacking towers sit on the *edge* slots (so their
 * short range reaches the adjacent road) plus a central support; the rest of the
 * grid is open for the player to build into. Wave/HP/economy beyond this seed are
 * driven by the live simulation (see src/game/BattleSim.ts), not these numbers.
 *
 * `unlocked` filters the seed to the campaign's unlocked towers (progression
 * §7): any seeded slot/hand card whose tower isn't unlocked yet is dropped, so a
 * level-1 board comes up with only the starting roster. Omit it to seed the full
 * board (used outside the campaign gate).
 */
export function createBattleState(unlocked?: ReadonlySet<string>, levelId?: string): BattleStateMock {
  const allowed = (cardId: string) => !unlocked || unlocked.has(cardId);
  const base: BattleStateMock = structuredClone(activeGameConfig.battleSeed);

  const emptyStart = levelId ? findLevel(levelId)?.emptyStart === true : false;

  if (emptyStart) {
    base.slots = Array.from({ length: 9 }, () => null);
    base.energyLoad = 0;
    base.gold = Math.max(base.gold, 400);
  } else {
    base.slots = base.slots.map((s) => (s && allowed(s.cardId) ? stampInvested(s) : null));
  }
  base.hand = base.hand.filter((h) => allowed(h.cardId));
  if (!emptyStart) {
    base.energyLoad = base.slots.reduce((sum, s) => sum + (s ? cardLoad(getCard(s.cardId), s.grade) : 0), 0);
  }
  return base;
}

function stampInvested(s: PlacedCard): PlacedCard {
  return { ...s, goldInvested: towerGoldInvested(s.cardId, s.grade, s.goldInvested) };
}
