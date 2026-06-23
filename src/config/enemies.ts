import type { EnemyDef } from './types';

/** A handful of elemental creatures for atmosphere along the enemy track (mock). */
export const ENEMIES: EnemyDef[] = [
  { id: 'magma_brute', name: 'Magma Brute', element: 'Fire', iconKey: 'enemy_magma_brute' },
  { id: 'frost_wisp', name: 'Frost Wisp', element: 'Water', iconKey: 'enemy_frost_wisp' },
  { id: 'volt_crawler', name: 'Volt Crawler', element: 'Electricity', iconKey: 'enemy_volt_crawler' },
  { id: 'iron_husk', name: 'Iron Husk', element: 'Physical', iconKey: 'enemy_iron_husk' },
];
