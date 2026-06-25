import type { PointData } from 'pixi.js';
import type { PathId } from './types';

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
 * Overload penalty (v3 §3.А): the fire-rate hit is now charged *per tower, in
 * proportion to that tower's own load* — this fraction per unit of network
 * overload, multiplied by the tower's load. So the projectile-heavy turrets that
 * actually strain the grid dim first, while light support (load 1) barely feels
 * it and a generator (load ≤ 0) is immune. At 2 units over capacity: a load-1
 * card ≈ −5%, a load-2 turret ≈ −10%, a load-3 Railgun ≈ −15%.
 */
export const OVERLOAD_FIRE_PENALTY_PER_LOAD = 0.025;

/**
 * Floor for a tower's overload fire-rate multiplier. The per-load penalty can't
 * drive a tower below this, so even a badly overloaded heavy turret crawls but
 * never fully freezes.
 */
export const OVERLOAD_FIRE_FLOOR = 0.1;

/** Reactor burn temporarily raises capacity by this much (v2 §3.Г). */
export const OVERDRIVE_CAPACITY_BONUS = 2;

/**
 * Wave-driven capacity growth (v2 §3.В): the platform's energy limit rises by
 * this much at the start of every wave — a smooth, uncapped curve (≈6 → ~25 by
 * wave 20). Deliberately NOT tied to grade or element count, so stacking towers
 * never "prints" energy (the load-doubling rule in §3.А enforces neutrality).
 */
export const CAPACITY_PER_WAVE = 1;

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

/**
 * Plasma's special shockwave mode (v3 §5): once it opens (Grade III, or via the
 * Fire+Physical "Shrapnel" reaction) the bolt is no longer homing — it is a
 * *slow* round lobbed at the point where the target stood, detonating there in an
 * area. This is its travel-speed multiplier vs. a normal homing bolt (slower, so
 * the player must "lead" fast singles but it shreds dense, predictable groups).
 */
export const PLASMA_SLOW_PROJECTILE_MULT = 0.55;

/** Resonance "Shrapnel" widens any splash by this factor (v2 §7: blast radius +40%). */
export const SHRAPNEL_AOE_MULT = 1.4;

/** Fraction of the direct hit dealt to other enemies caught in a splash. */
export const AOE_SPLASH_FRAC = 0.6;

/**
 * Frost's signature is its *freeze radius* (v3 §5): slow + Wet land not just on the
 * struck enemy but on everyone within this radius of the impact (fraction of the
 * arena width), and the radius widens with grade (small → medium → large).
 */
export const FROST_FREEZE_RADIUS_FRAC: readonly number[] = [0.06, 0.085, 0.12];

/**
 * Railgun fires a piercing *line* (v3 §6), not a circular blast: it hits every
 * enemy within this perpendicular half-width (fraction of arena width) of the ray
 * from the turret through its lead target, out to its range (the line length is
 * the signature stat). So aiming down a straight stretch of the spiral matters.
 */
export const RAILGUN_BEAM_HALF_WIDTH_FRAC = 0.05;

// --- Interrupt / Disruptor (v3 §2.Г) ---------------------------------------

/**
 * Reach (fraction of arena width) within which a Disruptor jams a tower. It picks
 * the nearest non-immune turret inside this radius on each interrupt tick.
 */
export const DISRUPTOR_JAM_RANGE_FRAC = 0.34;

/** A crit interrupt locks the tower (can't fire) for this long; a normal one just glitches the current shot. */
export const INTERRUPT_STUN_SEC = 1.2;

/** Seconds a Shield barrier holds the lead enemy still; recharge after. */
export const BARRIER_COOLDOWN_SEC = 12;

// --- Support-mob auras (docs/planned/support-enemies.md) -------------------

/** Cap on the total Resonance-Mote move-speed bonus a pack can stack (no runaway). */
export const AURA_HASTE_CAP_PCT = 50;

/** Aegis-Beacon ally shield decays this many HP/sec once no beacon refreshes it. */
export const AURA_SHIELD_DECAY_PER_SEC = 40;

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
 * Enemy march templates, as fractions of the arena image (0..1). Each starts
 * *off-screen* (a coord <0 or >1) so enemies are seen approaching, then runs the
 * worn road and breaches the core at its final point (t = 1).
 *
 * The road band sits at 0.16/0.84 — well outside the central platform (which
 * spans ≈0.33–0.67) and ~0.34 from the center slot (so the contact-free center
 * stays a support seat; see BattleScene's interrupt-immunity test). Templates:
 *
 * - `bottom` — the original all-around ring: clockwise past every edge, gate at
 *   bottom-center. Forgiving: any layout that rings the platform engages it.
 * - `top` / `left` / `right` — L-sweeps concentrating the march on **two adjacent
 *   edges**, leaving the opposite corner cold. A defense built for one of these
 *   can't reach the next one's hot edges (finite tower range, combatRules §range),
 *   so changing a level's direction forces the player to re-anchor their towers.
 *   These are deliberately shorter than the full ring, so enemies cross them in
 *   less wall-clock time (constant traversal time = 1/speed); the slower on-screen
 *   pace gives the player a beat to re-cover the weak edge.
 */
export const ENEMY_PATHS: Record<PathId, readonly PointData[]> = {
  // All-around ring (the original route), gate at bottom-center.
  bottom: [
    { x: 0.5, y: 1.22 }, // off-screen spawn (below the visible arena)
    { x: 0.5, y: 0.84 }, // gate (bottom-center) — enters view here
    { x: 0.84, y: 0.84 }, // bottom-right
    { x: 0.84, y: 0.16 }, // top-right
    { x: 0.16, y: 0.16 }, // top-left
    { x: 0.16, y: 0.84 }, // bottom-left
    { x: 0.5, y: 0.84 }, // back to the gate = core breach
  ],
  // Enter from the top, sweep the top edge then down the right — top + right hot,
  // bottom-left corner cold.
  top: [
    { x: 0.5, y: -0.22 }, // off-screen above center
    { x: 0.16, y: 0.16 }, // top-left (enters view)
    { x: 0.84, y: 0.16 }, // top-right
    { x: 0.84, y: 0.84 }, // bottom-right = breach
  ],
  // Enter from the left, sweep up the left edge then across the top — left + top
  // hot, bottom-right corner cold.
  left: [
    { x: -0.22, y: 0.5 }, // off-screen left of center
    { x: 0.16, y: 0.84 }, // bottom-left (enters view)
    { x: 0.16, y: 0.16 }, // top-left
    { x: 0.84, y: 0.16 }, // top-right = breach
  ],
  // Enter from the right, sweep down the right edge then across the bottom —
  // right + bottom hot, top-left corner cold.
  right: [
    { x: 1.22, y: 0.5 }, // off-screen right of center
    { x: 0.84, y: 0.16 }, // top-right (enters view)
    { x: 0.84, y: 0.84 }, // bottom-right
    { x: 0.16, y: 0.84 }, // bottom-left = breach
  ],
};

/** The default all-around ring (back-compat alias for {@link ENEMY_PATHS}.bottom). */
export const ENEMY_PATH: readonly PointData[] = ENEMY_PATHS.bottom;
