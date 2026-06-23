import type { PointData } from 'pixi.js';

/**
 * Tunables for the battle *simulation* (waves, tower fire, projectiles, core).
 * Kept beside the rest of the game data; the hand/placement loop tunables live
 * in battleRules.ts.
 */

/** Core integrity at the start of a battle. Each leaked enemy subtracts its `coreDamage`. */
export const CORE_MAX = 20;

/** Seconds of calm before the very first wave spawns. */
export const FIRST_WAVE_DELAY = 4;

/** Seconds of breathing room between a cleared wave and the next one. */
export const WAVE_INTERMISSION = 7;

/**
 * Tower attack range is per-card and measured in *grid cells* (see CardDef.rangeCells),
 * so only towers placed near a road segment can hit enemies on it — positioning
 * matters. The scene converts cells → pixels via the grid's on-screen cell size.
 * Grade growth raises one stat per card (range / tempo / power), below.
 */

/** Projectile travel speed, as a fraction of the arena width per second. */
export const PROJECTILE_SPEED_FRAC = 1.15;

/** A projectile is considered to have struck once within this fraction of the arena width. */
export const PROJECTILE_HIT_FRAC = 0.018;

/**
 * Per-grade multipliers (grade 1..3). Each attacking card upgrades exactly one
 * of these as it merges (CardDef.upgrade): a 'power' tower hits harder, a 'tempo'
 * tower fires faster (cooldown divided), a 'range' tower reaches further.
 */
export const POWER_MULT = [1, 1.7, 2.6] as const;
export const TEMPO_MULT = [1, 1.4, 1.9] as const;
export const RANGE_MULT = [1, 1.5, 2.1] as const;

/**
 * Overload penalty: each unit of energy load past capacity multiplies every
 * tower's cooldown by (1 + this), i.e. slows the whole grid's fire rate.
 */
export const OVERLOAD_FIRE_PENALTY = 0.3;

/** While Overdrive is active (a card was burned), capacity is treated as this much higher. */
export const OVERDRIVE_CAPACITY_BONUS = 2;

/** Gold granted for fully clearing a wave. */
export const WAVE_CLEAR_BONUS = 25;

/**
 * Waypoints of the enemy march, as fractions of the arena image (0..1). Enemies
 * spawn *off-screen below* (y > 1) so they are seen approaching, walk up to the
 * bottom "gate", circle the platform clockwise along the worn dirt road, and
 * breach the core when they return to the gate (t = 1).
 *
 * The ring is drawn just outside the central platform (~0.25..0.75) and inside
 * the rocky frame (~0.12..0.88). The first segment lives below the viewport so
 * the spawn itself is hidden until the creature climbs into view.
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
