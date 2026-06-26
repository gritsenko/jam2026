import type { BattleStateMock } from './types';
import { cardLoad, getCard } from './cards';
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
export function createBattleState(unlocked?: ReadonlySet<string>): BattleStateMock {
  const allowed = (cardId: string) => !unlocked || unlocked.has(cardId);
  // Clone the seed from the active ConfigSet (src/data/sets/<set>/battleSeed.json)
  // so callers can freely mutate it without touching the shared template.
  const base: BattleStateMock = structuredClone(activeGameConfig.battleSeed);

  base.slots = base.slots.map((s) => (s && allowed(s.cardId) ? s : null));
  base.hand = base.hand.filter((h) => allowed(h.cardId));
  // Recompute the seeded load from the towers that actually remain on the grid.
  base.energyLoad = base.slots.reduce((sum, s) => sum + (s ? cardLoad(getCard(s.cardId), s.grade) : 0), 0);
  return base;
}
