import type { PointData } from 'pixi.js';

/**
 * Tunables for the battle *simulation* (waves, tower fire, projectiles, core,
 * statuses & resonance). The hand/placement loop tunables live in battleRules.ts;
 * per-card stat tables live with the cards in cards.ts.
 */

/** Core integrity at the start of a battle. Each leaked enemy subtracts its `coreDamage`. */
export const CORE_MAX = 20;

/** Seconds of calm before the very first wave spawns. */
export const FIRST_WAVE_DELAY = 4;

/** Seconds of breathing room between a cleared wave and the next one. */
export const WAVE_INTERMISSION = 7;

/**
 * Tower attack range is per-card and measured in *grid cells* (CardGrade.rangeCells),
 * so only towers placed near a road segment can hit enemies on it. Damage, range
 * and the signature parameter all come from the card's per-grade table (cards.ts);
 * neighbor buffs then scale them at runtime (see game/synergy.ts).
 */

/** Projectile travel speed, as a fraction of the arena width per second. */
export const PROJECTILE_SPEED_FRAC = 1.15;

/** A projectile is considered to have struck once within this fraction of the arena width. */
export const PROJECTILE_HIT_FRAC = 0.018;

/**
 * Overload penalty: each unit of energy load past capacity multiplies every
 * tower's cooldown by (1 + this), i.e. slows the whole grid's fire rate.
 */
export const OVERLOAD_FIRE_PENALTY = 0.3;

/** Reactor burn temporarily raises capacity by this much (v2 §3.Г). */
export const OVERDRIVE_CAPACITY_BONUS = 2;

/** Gold granted for fully clearing a wave. */
export const WAVE_CLEAR_BONUS = 25;

/** Crystals granted for clearing a wave without losing any Core integrity (Perfect Clear, §8). */
export const PERFECT_CLEAR_CRYSTALS = 15;

// --- Status effects (applied to enemies) -----------------------------------

/** Damage multiplier a Wet enemy takes from Electricity (Storm Coil) — v2 §2.В / §6. */
export const WET_DAMAGE_MULT = 2;

/** Seconds an enemy stays slowed after a slowing hit (re-applied on each hit). */
export const SLOW_REFRESH_SEC = 1.2;

// --- Signature behaviors ----------------------------------------------------

/** Chain-lightning reach (fraction of arena width) for hops between targets. */
export const CHAIN_RADIUS_FRAC = 0.17;

/** Each chain hop deals this fraction of the previous hit's damage. */
export const CHAIN_FALLOFF = 0.72;

/** Splash radius (fraction of arena width) of a Plasma III shockwave shot. */
export const PLASMA_SHOCKWAVE_FRAC = 0.05;

/** Resonance "Shrapnel" widens any splash by this factor (v2 §7: blast radius +40%). */
export const SHRAPNEL_AOE_MULT = 1.4;

/** Fraction of the direct hit dealt to other enemies caught in a splash. */
export const AOE_SPLASH_FRAC = 0.6;

/** Seconds a Shield barrier holds the lead enemy still; recharge after. */
export const BARRIER_COOLDOWN_SEC = 12;

// --- Resonance reaction effects (v2 §7) ------------------------------------

/** Steam Burst: movement slow and damage-over-time applied to hit enemies. */
export const STEAM_SLOW = 0.15;
export const STEAM_DOT_DPS = 12;
export const STEAM_DOT_SEC = 1.5;

/** Superconductivity: attack-speed multiplier and stun on hit. */
export const SUPERCONDUCT_TEMPO_MULT = 1.5;
export const SUPERCONDUCT_STUN_CHANCE = 0.2;
export const SUPERCONDUCT_STUN_SEC = 0.5;

/**
 * Waypoints of the enemy march, as fractions of the arena image (0..1). Enemies
 * spawn *off-screen below* (y > 1) so they are seen approaching, walk up to the
 * bottom "gate", circle the platform clockwise along the worn dirt road, and
 * breach the core when they return to the gate (t = 1).
 */
export const ENEMY_PATH: readonly PointData[] = [
  { x: 0.5, y: 1.22 }, // off-screen spawn (below the visible arena)
  { x: 0.5, y: 0.84 }, // gate (bottom-center) — enters view here
  { x: 0.84, y: 0.84 }, // bottom-right
  { x: 0.84, y: 0.16 }, // top-right
  { x: 0.16, y: 0.16 }, // top-left
  { x: 0.16, y: 0.84 }, // bottom-left
  { x: 0.5, y: 0.84 }, // back to the gate = core breach
];
