import type { BattleStateMock } from './types';
import { cardLoad, getCard } from './cards';

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
  const base: BattleStateMock = {
    wave: 1,
    maxWave: 5,
    gold: 320,
    crystals: 24,
    energyLoad: 6, // = sum of the seeded towers' baseLoad (2 + 1 + 1 + 2)
    energyCapacity: 8, // v3 §3.А: starts above the seeded load so the player has a 1–2 cell buffer (green is the norm)
    energyMax: 15,
    overdrive: false,
    slots: [
      null,
      { cardId: 'plasma_shutter', grade: 1 }, // top edge
      null,
      null,
      { cardId: 'shield_generator', grade: 1 }, // center support
      { cardId: 'frost_pulse', grade: 1 }, // right edge
      null,
      { cardId: 'storm_coil', grade: 1 }, // bottom edge — covers the entry gate
      null,
    ],
    hand: [
      { instanceId: 'h1', cardId: 'storm_coil', grade: 1 },
      { instanceId: 'h2', cardId: 'plasma_shutter', grade: 1 },
      { instanceId: 'h3', cardId: 'railgun', grade: 1 },
    ],
  };

  base.slots = base.slots.map((s) => (s && allowed(s.cardId) ? s : null));
  base.hand = base.hand.filter((h) => allowed(h.cardId));
  // Recompute the seeded load from the towers that actually remain on the grid.
  base.energyLoad = base.slots.reduce((sum, s) => sum + (s ? cardLoad(getCard(s.cardId), s.grade) : 0), 0);
  return base;
}
