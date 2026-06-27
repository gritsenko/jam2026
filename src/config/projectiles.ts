import type { ElementId } from '../theme';

/**
 * How a tower's shot travels and looks — a *presentation* concern layered over the
 * headless sim (BattleSim stays authoritative for hits). See
 * docs/done/projectiles-vfx-and-enemy-polish.md.
 *
 * - `ballistic` — lobbed arc to a fixed aim point (Fire/Water emitters fire up at an
 *   angle); the sim sets `firePos` + `arcPeak`, the view lifts the sprite on a parabola.
 * - `homing` — slow, self-accelerating ball lightning that always catches its target
 *   (Tesla); the sim ramps its speed, the view trails it.
 * - `tracer` — instant pierce beam (Railgun et al.): no SimProjectile; the scene
 *   animates a fast tracer slug + fading trail along the beam line on `onBeam`.
 */
export type ShotMotion = 'ballistic' | 'homing' | 'tracer';

export interface ShotStyle {
  /** Projectile / tracer sprite asset key (falls back via ASSET_FALLBACKS if absent). */
  readonly shot: string;
  readonly motion: ShotMotion;
  /**
   * Native facing of the sprite art, radians, measured from +x (right). The view
   * rotates the slug by `velocityAngle - baseAngle`. 0 for radial orbs / right-facing
   * darts; the thermo slug points up-right in its art.
   */
  readonly baseAngle?: number;
}

// --- Motion tunables (kept in TS, not the data-driven combatRules JSON: these are
//     cosmetic and shared across all game-configs). Multipliers of projectileSpeed. ---
/** Ballistic arc peak height, as a fraction of arena width. */
export const BALLISTIC_ARC = 0.16;
/** Ballistic travel speed vs. the base projectile speed. */
export const BALLISTIC_SPEED_MULT = 0.95;
/** Tesla ball lightning starts at this fraction of base speed… */
export const HOMING_START_MULT = 0.45;
/** …accelerates by this fraction of base speed per second… */
export const HOMING_ACCEL_MULT = 1.9;
/** …up to this multiple of base speed (the cap). */
export const HOMING_MAX_MULT = 2.4;

const BY_ICON: Record<string, ShotStyle> = {
  // Base towers
  plasma_shutter: { shot: 'shot_plasma', motion: 'ballistic' },
  frost_pulse: { shot: 'shot_ice', motion: 'ballistic' },
  storm_coil: { shot: 'shot_tesla', motion: 'homing' },
  railgun: { shot: 'shot_rail', motion: 'tracer' },
  // Fusion hybrids
  steam_cannon: { shot: 'shot_steam', motion: 'ballistic' },
  ion_volley: { shot: 'shot_ion', motion: 'ballistic' },
  cryo_discharge: { shot: 'shot_cryo', motion: 'homing' },
  thermo_spear: { shot: 'shot_thermo', motion: 'tracer', baseAngle: -Math.PI / 4 },
  icebreaker: { shot: 'shot_icebreaker', motion: 'tracer' },
  gauss_coil: { shot: 'shot_gauss', motion: 'tracer' },
};

const BY_ELEMENT: Record<ElementId, ShotStyle> = {
  Fire: { shot: 'shot_plasma', motion: 'ballistic' },
  Water: { shot: 'shot_ice', motion: 'ballistic' },
  Electricity: { shot: 'shot_tesla', motion: 'homing' },
  Physical: { shot: 'shot_rail', motion: 'tracer' },
  Energy: { shot: 'shot_tesla', motion: 'homing' }, // generators don't fire — safe default
};

/** Shot style for a tower, by iconKey with an element fallback (new towers always render). */
export function shotStyle(iconKey: string, element: ElementId): ShotStyle {
  return BY_ICON[iconKey] ?? BY_ELEMENT[element];
}

/**
 * Muzzle-flash sprite key per attacking element (additive bloom that pops at the
 * gun tip on fire). Keyed by element so fusion hybrids inherit their parent's
 * flash for free (each base attacker maps 1:1 to its element). Towers/elements
 * not listed fall back to the generic `fx_muzzle` in BattleScene.
 */
const MUZZLE_BY_ELEMENT: Partial<Record<ElementId, string>> = {
  Fire: 'muzzle_plasma', // plasma_shutter
  Water: 'muzzle_ice', // frost_pulse
  Electricity: 'muzzle_tesla', // storm_coil
  Physical: 'muzzle_gauss', // railgun
};

/** Muzzle-flash sprite key for a tower's element, or undefined → generic fx_muzzle. */
export function muzzleFlashKey(element: ElementId): string | undefined {
  return MUZZLE_BY_ELEMENT[element];
}
