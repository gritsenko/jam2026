import type { EnemyDef } from './types';
import { activeGameConfig } from '../data/load';

/**
 * The enemy roster. Data lives in JSON (src/data/game_configs/<config>/enemies.json) via the
 * active ConfigSet (docs/backlog/config-as-data.md); this module keeps the id lookup.
 *
 * `speed` is in laps-per-second (1/speed = seconds to complete the ring), which
 * keeps movement resolution-independent — the view multiplies the path point by
 * the on-screen arena size, the simulation never sees pixels.
 */
export const ENEMIES: EnemyDef[] = activeGameConfig.enemies;

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

export function getEnemy(id: string): EnemyDef {
  const def = ENEMY_BY_ID[id];
  if (!def) throw new Error(`Unknown enemy id: ${id}`);
  return def;
}
