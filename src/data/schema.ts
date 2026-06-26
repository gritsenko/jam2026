// Shape of a GameConfig — the editable game-design data, loaded from JSON
// (src/data/game_configs/<name>/). Functions and derived caches stay in src/config/*.ts
// and operate on top of the active config. See docs/backlog/config-as-data.md.

import type { BattleStateMock, CardDef, EnemyDef, LevelNode, PathId, WaveDef } from '../config/types';
import type { Reaction } from '../config/resonance';
import type { LevelCombat } from '../config/levelCombat';

export interface LevelUnlock {
  towers: string[];
  mechanics: string[];
}

/** Numeric tuning for the simulation (mirrors combatRules.ts exports; keys = export names). */
export interface CombatRules {
  CORE_MAX: number;
  FIRST_WAVE_DELAY: number;
  WAVE_INTERMISSION: number;
  PROJECTILE_SPEED_FRAC: number;
  PROJECTILE_HIT_FRAC: number;
  OVERLOAD_FIRE_PENALTY_PER_LOAD: number;
  OVERLOAD_FIRE_FLOOR: number;
  OVERDRIVE_CAPACITY_BONUS: number;
  CAPACITY_PER_WAVE: number;
  WAVE_CLEAR_BONUS: number;
  PERFECT_CLEAR_CRYSTALS: number;
  WET_DAMAGE_MULT: number;
  SLOW_REFRESH_SEC: number;
  CHAIN_RADIUS_FRAC: number;
  CHAIN_FALLOFF: number;
  PLASMA_SHOCKWAVE_FRAC: number;
  PLASMA_SLOW_PROJECTILE_MULT: number;
  SHRAPNEL_AOE_MULT: number;
  AOE_SPLASH_FRAC: number;
  FROST_FREEZE_RADIUS_FRAC: number[];
  RAILGUN_BEAM_HALF_WIDTH_FRAC: number;
  DISRUPTOR_JAM_RANGE_FRAC: number;
  INTERRUPT_STUN_SEC: number;
  BARRIER_COOLDOWN_SEC: number;
  AURA_HASTE_CAP_PCT: number;
  AURA_SHIELD_DECAY_PER_SEC: number;
  STEAM_SLOW: number;
  STEAM_DOT_DPS: number;
  STEAM_DOT_SEC: number;
  SUPERCONDUCT_TEMPO_MULT: number;
  SUPERCONDUCT_STUN_CHANCE: number;
  SUPERCONDUCT_STUN_SEC: number;
  /** Damage mult vs slowed or Wet targets (Icebreaker hybrid, v2 §6.5). */
  HYBRID_SLOW_WET_BONUS: number;
  /** Splash radius fraction for Steam Cannon steam-burst hits. */
  HYBRID_STEAM_BURST_FRAC: number;
  ENEMY_PATHS: Record<PathId, { x: number; y: number }[]>;
}

/** Numeric tuning for the hand/placement loop (mirrors battleRules.ts exports). */
export interface BattleRules {
  HAND_SIZE: number;
  HAND_RESPAWN_SEC: number;
  OVERDRIVE_SEC: number;
  OVERDRIVE_BASE_COST: number;
  OVERDRIVE_STEP: number;
  REROLL_BASE_COST: number;
  REROLL_STEP: number;
  MOD_ISOLATION_CAPACITY: number;
  MOD_FOCUS_DMG_MULT: number;
  MOD_EMERGENCY_OVERDRIVE_SEC: number;
  MOD_DRAW_CHANCE: number;
}

export interface GameConfig {
  /** Tower/card catalog (cards.ts CARDS). */
  cards: Record<string, CardDef>;
  /** Enemy roster (enemies.ts ENEMIES). */
  enemies: EnemyDef[];
  /** World-map nodes (levels.ts LEVELS). */
  levels: LevelNode[];
  /** Per-level wave script + difficulty tier (levelCombat.ts LEVEL_COMBAT). */
  levelCombat: Record<string, LevelCombat>;
  /** Shared fallback wave script (waves.ts WAVES). */
  waves: WaveDef[];
  /** Resonance reactions (resonance.ts REACTIONS). */
  reactions: Reaction[];
  /** Fusion recipes, keyed by sorted "a|b" pair (fusion.ts RECIPES). */
  recipes: Record<string, string>;
  /** Per-level permanent unlocks (progression.ts LEVEL_UNLOCKS). */
  levelUnlocks: Record<string, LevelUnlock>;
  /** Starting tower roster (progression.ts STARTING_TOWERS). */
  startingTowers: string[];
  /** Simulation tuning numbers (combatRules.ts). */
  combatRules: CombatRules;
  /** Hand/placement tuning numbers (battleRules.ts). */
  battleRules: BattleRules;
  /** Starting battle snapshot (battleState.ts seed). */
  battleSeed: BattleStateMock;
}

/** The raw JSON modules that make up one set on disk. */
export interface GameConfigJson {
  cards: unknown;
  enemies: unknown;
  levels: unknown;
  levelCombat: unknown;
  waves: unknown;
  reactions: unknown;
  recipes: unknown;
  progression: { levelUnlocks: unknown; startingTowers: unknown };
  combatRules: unknown;
  battleRules: unknown;
  battleSeed: unknown;
}

/**
 * Assemble a typed GameConfig from raw JSON. JSON widens unions/tuples (e.g.
 * `element: string`, `grades: object[]`), so we cast at this boundary; runtime
 * integrity is checked by validate.ts under DEV. The data is machine-generated
 * from the typed constants (tools/dump_config.ts), so it is correct by construction.
 */
export function toGameConfig(j: GameConfigJson): GameConfig {
  const prog = j.progression;
  return {
    cards: j.cards as GameConfig['cards'],
    enemies: j.enemies as GameConfig['enemies'],
    levels: j.levels as GameConfig['levels'],
    levelCombat: j.levelCombat as GameConfig['levelCombat'],
    waves: j.waves as GameConfig['waves'],
    reactions: j.reactions as GameConfig['reactions'],
    recipes: j.recipes as GameConfig['recipes'],
    levelUnlocks: prog.levelUnlocks as GameConfig['levelUnlocks'],
    startingTowers: prog.startingTowers as GameConfig['startingTowers'],
    combatRules: j.combatRules as GameConfig['combatRules'],
    battleRules: j.battleRules as GameConfig['battleRules'],
    battleSeed: j.battleSeed as GameConfig['battleSeed'],
  };
}
