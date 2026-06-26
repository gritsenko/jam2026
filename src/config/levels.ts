import type { LevelNode } from './types';
import { activeGameConfig } from '../data/load';

/**
 * World-map nodes. Data lives in JSON (src/data/game_configs/<config>/levels.json) via the
 * active ConfigSet (docs/backlog/config-as-data.md). Positions are normalized 0..1
 * in portrait design space; order is the campaign order (the linear gate).
 * Lock/clear state + stars are computed live from saved progress (src/game/progress.ts).
 */
export const LEVELS: LevelNode[] = activeGameConfig.levels;
