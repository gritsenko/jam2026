import type { WaveDef } from './types';

/**
 * The level's wave script (mock — one shared track for every level for now).
 * Each wave is a list of spawn groups played in order; difficulty ramps from a
 * trickle of wisps to a mixed assault capped by armored Iron Husks.
 *
 * `maxWave` for the HUD is simply `WAVES.length`.
 */
export const WAVES: WaveDef[] = [
  // 1 — gentle intro: a line of fast, fragile wisps.
  { groups: [{ enemyId: 'frost_wisp', count: 6, gap: 1.1 }] },
  // 2 — runners with a few stragglers.
  {
    groups: [
      { enemyId: 'volt_crawler', count: 5, gap: 0.9 },
      { enemyId: 'frost_wisp', count: 4, gap: 0.6 },
    ],
  },
  // 3 — first real weight: a column of magma brutes.
  {
    groups: [
      { enemyId: 'frost_wisp', count: 4, gap: 0.5 },
      { enemyId: 'magma_brute', count: 5, gap: 1.4 },
    ],
  },
  // 4 — mixed pressure from all three light types.
  {
    groups: [
      { enemyId: 'volt_crawler', count: 6, gap: 0.7 },
      { enemyId: 'magma_brute', count: 4, gap: 1.2 },
      { enemyId: 'frost_wisp', count: 6, gap: 0.5 },
    ],
  },
  // 5 — finale: armored husks escorted by a swarm.
  {
    groups: [
      { enemyId: 'volt_crawler', count: 8, gap: 0.5 },
      { enemyId: 'magma_brute', count: 6, gap: 0.9 },
      { enemyId: 'iron_husk', count: 2, gap: 4.0 },
    ],
  },
];
