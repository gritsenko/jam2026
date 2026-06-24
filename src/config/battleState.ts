import type { BattleStateMock } from './types';

/**
 * Builds a fresh mock battle snapshot: the player's starting resources and the
 * pre-placed platform. Three attacking towers sit on the *edge* slots (so their
 * short range reaches the adjacent road) plus a central support; the rest of the
 * grid is open for the player to build into. Wave/HP/economy beyond this seed are
 * driven by the live simulation (see src/game/BattleSim.ts), not these numbers.
 */
export function createBattleState(): BattleStateMock {
  return {
    wave: 1,
    maxWave: 5,
    gold: 320,
    crystals: 24,
    energyLoad: 6, // = sum of the seeded towers' baseLoad (2 + 1 + 1 + 2)
    energyCapacity: 6, // v2 §3.А: starting platform capacity
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
}
