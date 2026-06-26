import type { LevelNode } from './types';
import { activeGameConfig } from '../data/load';

/**
 * World-map nodes. Data lives in JSON (src/data/game_configs/<config>/levels.json) via the
 * active ConfigSet (docs/backlog/config-as-data.md). Positions are normalized 0..1
 * in portrait design space; order is the campaign order (the linear gate).
 * Lock/clear state + stars are computed live from saved progress (src/game/progress.ts).
 */
export const LEVELS: LevelNode[] = activeGameConfig.levels;

/** Campaign region for a node (defaults to page 1). */
export function levelRegion(node: LevelNode): number {
  return node.region ?? 1;
}

/** Levels shown on a world-map page. */
export function levelsInRegion(region: number): LevelNode[] {
  const tagged = LEVELS.filter((l) => l.region === region);
  if (tagged.length > 0) return tagged;
  // Fallback when `region` is absent from JSON (older configs / partial deploy).
  if (region === 1) return LEVELS.slice(0, Math.min(7, LEVELS.length));
  if (region === 2) return LEVELS.slice(7);
  return [];
}

/** How many world-map pages the campaign needs. */
export function worldMapPageCount(): number {
  return levelsInRegion(2).length > 0 ? 2 : 1;
}

export function findLevel(levelId: string): LevelNode | undefined {
  return LEVELS.find((l) => l.id === levelId);
}
