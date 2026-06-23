import type { EnemyDef } from './types';

/**
 * The four elemental creatures that march the ring road. Combat stats are tuned
 * for a short prototype lap (~10–25s) so towers get many shots per enemy.
 *
 * `speed` is in laps-per-second (1/speed = seconds to complete the ring), which
 * keeps movement resolution-independent — the view multiplies the path point by
 * the on-screen arena size, the simulation never sees pixels.
 */
export const ENEMIES: EnemyDef[] = [
  // Fast, fragile skirmisher.
  { id: 'frost_wisp', name: 'Frost Wisp', element: 'Water', iconKey: 'enemy_frost_wisp', maxHp: 35, speed: 0.085, bounty: 5, coreDamage: 1 },
  // Mid runner.
  { id: 'volt_crawler', name: 'Volt Crawler', element: 'Electricity', iconKey: 'enemy_volt_crawler', maxHp: 55, speed: 0.07, bounty: 6, coreDamage: 1 },
  // Slow bruiser.
  { id: 'magma_brute', name: 'Magma Brute', element: 'Fire', iconKey: 'enemy_magma_brute', maxHp: 90, speed: 0.05, bounty: 9, coreDamage: 2 },
  // Very slow tank — punishes thin defenses.
  { id: 'iron_husk', name: 'Iron Husk', element: 'Physical', iconKey: 'enemy_iron_husk', maxHp: 240, speed: 0.035, bounty: 16, coreDamage: 3 },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

export function getEnemy(id: string): EnemyDef {
  const def = ENEMY_BY_ID[id];
  if (!def) throw new Error(`Unknown enemy id: ${id}`);
  return def;
}
