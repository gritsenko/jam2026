import type { BattleStateMock } from './types';

/**
 * Builds a fresh mock battle snapshot. Mirrors the style reference
 * (WAVE 8/20, gold, SP) and seeds the 3x3 platform with a believable mix of
 * placed cards plus a 3-card hand. No simulation — this just feeds the HUD.
 */
export function createBattleState(): BattleStateMock {
  return {
    wave: 8,
    maxWave: 20,
    gold: 510,
    crystals: 24,
    sp: 100,
    energyLoad: 8,
    energyCapacity: 10,
    energyMax: 15,
    overdrive: false,
    slots: [
      null,
      { cardId: 'plasma_shutter', grade: 1 },
      null,
      { cardId: 'frost_pulse', grade: 2 },
      { cardId: 'storm_coil', grade: 1 },
      { cardId: 'shield_generator', grade: 1 },
      { cardId: 'grid_stabilizer', grade: 1 },
      null,
      { cardId: 'railgun', grade: 1 },
    ],
    hand: [
      { instanceId: 'h1', cardId: 'plasma_shutter', grade: 1 },
      { instanceId: 'h2', cardId: 'frost_pulse', grade: 1 },
      { instanceId: 'h3', cardId: 'storm_coil', grade: 2 },
    ],
  };
}
