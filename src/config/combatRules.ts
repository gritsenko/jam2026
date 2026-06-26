import type { PointData } from 'pixi.js';
import type { PathId } from './types';
import { activeGameConfig } from '../data/load';

/**
 * Tunables for the battle *simulation* (waves, tower fire, projectiles, core,
 * statuses & resonance). Data lives in JSON (src/data/game_configs/<config>/combatRules.json)
 * via the active ConfigSet — see docs/backlog/config-as-data.md. This module keeps
 * the same named exports (consumers unchanged); only the source is the JSON now.
 * The hand/placement loop tunables live in battleRules.ts; per-card stat tables in cards.ts.
 */
const C = activeGameConfig.combatRules;

/** Core integrity at the start of a battle. Each leaked enemy subtracts its `coreDamage`. */
export const CORE_MAX = C.CORE_MAX;
/** Seconds of calm before the very first wave spawns. */
export const FIRST_WAVE_DELAY = C.FIRST_WAVE_DELAY;
/** Seconds of breathing room between a cleared wave and the next one. */
export const WAVE_INTERMISSION = C.WAVE_INTERMISSION;

/** Projectile travel speed, as a fraction of the arena width per second. */
export const PROJECTILE_SPEED_FRAC = C.PROJECTILE_SPEED_FRAC;
/** A projectile is considered to have struck once within this fraction of the arena width. */
export const PROJECTILE_HIT_FRAC = C.PROJECTILE_HIT_FRAC;

/** Overload penalty (v3 §3.А): fire-rate hit per unit of overload × the tower's own load. */
export const OVERLOAD_FIRE_PENALTY_PER_LOAD = C.OVERLOAD_FIRE_PENALTY_PER_LOAD;
/** Floor for a tower's overload fire-rate multiplier. */
export const OVERLOAD_FIRE_FLOOR = C.OVERLOAD_FIRE_FLOOR;
/** Reactor burn temporarily raises capacity by this much (v2 §3.Г). */
export const OVERDRIVE_CAPACITY_BONUS = C.OVERDRIVE_CAPACITY_BONUS;
/** Wave-driven capacity growth (v2 §3.В): +this at the start of every wave. */
export const CAPACITY_PER_WAVE = C.CAPACITY_PER_WAVE;
/** Gold granted for fully clearing a wave. */
export const WAVE_CLEAR_BONUS = C.WAVE_CLEAR_BONUS;
/** Crystals granted for a Perfect Clear (no Core lost), §8. */
export const PERFECT_CLEAR_CRYSTALS = C.PERFECT_CLEAR_CRYSTALS;

// --- Status effects --------------------------------------------------------
/** Damage multiplier a Wet enemy takes from Electricity — v2 §2.В / §6. */
export const WET_DAMAGE_MULT = C.WET_DAMAGE_MULT;
/** Seconds an enemy stays slowed after a slowing hit (re-applied on each hit). */
export const SLOW_REFRESH_SEC = C.SLOW_REFRESH_SEC;

// --- Signature behaviors ----------------------------------------------------
/** Chain-lightning reach (fraction of arena width) for hops between targets. */
export const CHAIN_RADIUS_FRAC = C.CHAIN_RADIUS_FRAC;
/** Each chain hop deals this fraction of the previous hit's damage. */
export const CHAIN_FALLOFF = C.CHAIN_FALLOFF;
/** Splash radius (fraction of arena width) of a Plasma III shockwave shot. */
export const PLASMA_SHOCKWAVE_FRAC = C.PLASMA_SHOCKWAVE_FRAC;
/** Plasma shockwave-mode travel-speed multiplier vs. a normal homing bolt (v3 §5). */
export const PLASMA_SLOW_PROJECTILE_MULT = C.PLASMA_SLOW_PROJECTILE_MULT;
/** Resonance "Shrapnel" widens any splash by this factor (v2 §7: +40%). */
export const SHRAPNEL_AOE_MULT = C.SHRAPNEL_AOE_MULT;
/** Fraction of the direct hit dealt to other enemies caught in a splash. */
export const AOE_SPLASH_FRAC = C.AOE_SPLASH_FRAC;
/** Frost freeze radius (fraction of arena width) per grade (v3 §5). */
export const FROST_FREEZE_RADIUS_FRAC: readonly number[] = C.FROST_FREEZE_RADIUS_FRAC;
/** Railgun pierce-line perpendicular half-width (fraction of arena width), v3 §6. */
export const RAILGUN_BEAM_HALF_WIDTH_FRAC = C.RAILGUN_BEAM_HALF_WIDTH_FRAC;

// --- Interrupt / Disruptor (v3 §2.Г) ---------------------------------------
/** Reach (fraction of arena width) within which a Disruptor jams a tower. */
export const DISRUPTOR_JAM_RANGE_FRAC = C.DISRUPTOR_JAM_RANGE_FRAC;
/** A crit interrupt locks the tower for this long; a normal one glitches the shot. */
export const INTERRUPT_STUN_SEC = C.INTERRUPT_STUN_SEC;
/** Seconds a Shield barrier holds the lead enemy still; recharge after. */
export const BARRIER_COOLDOWN_SEC = C.BARRIER_COOLDOWN_SEC;

// --- Support-mob auras (docs/planned/support-enemies.md) -------------------
/** Cap on the total Resonance-Mote move-speed bonus a pack can stack. */
export const AURA_HASTE_CAP_PCT = C.AURA_HASTE_CAP_PCT;
/** Aegis-Beacon ally shield decays this many HP/sec once no beacon refreshes it. */
export const AURA_SHIELD_DECAY_PER_SEC = C.AURA_SHIELD_DECAY_PER_SEC;

// --- Resonance reaction effects (v2 §7) ------------------------------------
/** Steam Burst: movement slow and damage-over-time applied to hit enemies. */
export const STEAM_SLOW = C.STEAM_SLOW;
export const STEAM_DOT_DPS = C.STEAM_DOT_DPS;
export const STEAM_DOT_SEC = C.STEAM_DOT_SEC;
/** Superconductivity: attack-speed multiplier and stun on hit. */
export const SUPERCONDUCT_TEMPO_MULT = C.SUPERCONDUCT_TEMPO_MULT;
export const SUPERCONDUCT_STUN_CHANCE = C.SUPERCONDUCT_STUN_CHANCE;
export const SUPERCONDUCT_STUN_SEC = C.SUPERCONDUCT_STUN_SEC;

/**
 * Enemy march templates, as fractions of the arena image (0..1). Each starts
 * off-screen (a coord <0 or >1) so enemies are seen approaching, then runs the
 * worn road and breaches the core at its final point. Data lives in JSON
 * (combatRules.json `ENEMY_PATHS`); `{x,y}` is structurally a PointData.
 */
export const ENEMY_PATHS: Record<PathId, readonly PointData[]> = C.ENEMY_PATHS;

/** The default all-around ring (back-compat alias for {@link ENEMY_PATHS}.bottom). */
export const ENEMY_PATH: readonly PointData[] = ENEMY_PATHS.bottom;
