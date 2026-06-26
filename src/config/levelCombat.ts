import type { PathId, WaveDef } from './types';
import { WAVES } from './waves';
import { activeGameConfig } from '../data/load';

/**
 * Per-level combat config — the wave script and difficulty tier for each campaign
 * node. The data now lives in JSON (src/data/game_configs/<config>/levelCombat.json) via the
 * active ConfigSet (docs/backlog/config-as-data.md); the spawn applies the tier
 * multipliers per-instance (see BattleSim). Design: docs/done/levels-post-tutorial.md.
 */
export interface LevelCombat {
  /** This level's wave script (played in order; `maxWave` = waves.length). */
  readonly waves: WaveDef[];
  /** Multiplier on every spawned enemy's maxHp (difficulty tier). */
  readonly hpScale: number;
  /** Multiplier on every spawned enemy's bounty (kept ≈ hpScale so income tracks). */
  readonly bountyScale: number;
  /**
   * Which edge enemies march in from (combatRules.ts `ENEMY_PATHS`). Omitted =
   * `bottom` (the all-around ring). Tutorial levels stay on `bottom`; later levels
   * rotate the direction so a static layout no longer covers everything.
   */
  readonly pathId?: PathId;
}

/**
 * Levels keyed by {@link import('./levels').LEVELS} id. Any level missing here
 * falls back to the shared {@link WAVES} at tier ×1 (see {@link combatForLevel}).
 */
export const LEVEL_COMBAT: Record<string, LevelCombat> = activeGameConfig.levelCombat;

/**
 * Combat config for a level, falling back to the shared {@link WAVES} at tier ×1
 * for any id not in {@link LEVEL_COMBAT} (mirrors progression.ts's per-level
 * resolvers; the `??` keeps it total under noUncheckedIndexedAccess).
 */
export function combatForLevel(levelId: string): LevelCombat {
  return LEVEL_COMBAT[levelId] ?? { waves: WAVES, hpScale: 1, bountyScale: 1 };
}
