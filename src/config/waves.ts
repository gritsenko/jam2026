import type { WaveDef } from './types';
import { activeGameConfig } from '../data/load';

/**
 * Shared fallback wave script. Data lives in JSON (src/data/sets/<set>/waves.json)
 * via the active ConfigSet (docs/backlog/config-as-data.md). Used only for levels
 * not present in LEVEL_COMBAT (see combatForLevel); per-level scripts override it.
 * `maxWave` for the HUD is simply `WAVES.length`.
 */
export const WAVES: WaveDef[] = activeGameConfig.waves;
