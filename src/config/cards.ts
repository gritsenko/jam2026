import type { CardDef, HybridPerk } from './types';
import { activeGameConfig } from '../data/load';

/**
 * Card catalog (v2 model — see docs/backlog/synergy-grid-td-v2.md §5/§6/§9).
 *
 * Synergy is positional: every card broadcasts its buff to all orthogonal
 * neighbors (Grade I–II) and additionally to diagonals at Grade III. The grade
 * tables carry damage/range, the buff %, the signature value and the synergy reach.
 *
 * Data lives in JSON (`src/data/game_configs/<name>/cards.json`) via the active
 * ConfigSet — see docs/backlog/config-as-data.md. This module keeps derived caches
 * and pure helpers (load formula, grade lookup) on top of that data.
 */
export const CARDS: Record<string, CardDef> = activeGameConfig.cards;

/**
 * iconKeys whose `<iconKey>_dirs_lvl<n>` 3×3 aim sheets use the COMPOSED layout:
 * the center cell is a *stationary base* and the 8 perimeter cells are the rotating
 * *head only*. SlotView draws the base once underneath and hard-swaps the head to
 * the aimed octant (the base stays put). Sheets NOT listed here use the old layout —
 * each cell is a full turret with the base baked in — and rotate the whole sprite.
 * Add an iconKey here once its `_dirs` sheets are drawn in the composed layout.
 */
export const COMPOSED_AIM_SHEETS = new Set<string>(['plasma_shutter', 'railgun']);

/**
 * How a tower sprite is SEATED in its slot: the base (turntable) fills the slot
 * width and sits centered, so the barrel naturally protrudes above the socket.
 * Both numbers are fractions of the *rendered texture* (a 3×3 aim-sheet cell for
 * `<id>_dirs` towers — the center base cell for composed sheets, a whole-turret
 * cell for old ones — or the full sprite for static towers):
 *   - `wFrac`  base turntable width ÷ texture width   → drives scale (base → slot width)
 *   - `cyFrac` base vertical center ÷ texture height  → drives the lift (base center → slot center)
 * Measured from the art (alpha bounding boxes; see SlotView.seatSprite). Towers
 * without an entry fall back to {@link TOWER_SEAT_DEFAULT}. Keeping `wFrac` fixed
 * per tower (not per aim frame) keeps a rotating turret a constant size as it turns.
 */
export interface TowerSeat {
  readonly wFrac: number;
  readonly cyFrac: number;
}
export const TOWER_SEAT_DEFAULT: TowerSeat = { wFrac: 0.96, cyFrac: 0.66 };
export const TOWER_SEATS: Record<string, TowerSeat> = {
  plasma_shutter: { wFrac: 0.7, cyFrac: 0.64 }, // composed sheet: center cell = base only
  railgun: { wFrac: 0.66, cyFrac: 0.61 }, // composed sheet: center cell = base only (head per perimeter cell)
  frost_pulse: { wFrac: 0.88, cyFrac: 0.7 },
  storm_coil: { wFrac: 0.88, cyFrac: 0.7 },
  shield_generator: { wFrac: 0.88, cyFrac: 0.61 },
  grid_stabilizer: { wFrac: 0.88, cyFrac: 0.7 },
};

/** Seat geometry for a tower's iconKey (falls back to the default). */
export function towerSeat(iconKey: string): TowerSeat {
  return TOWER_SEATS[iconKey] ?? TOWER_SEAT_DEFAULT;
}

/**
 * Barrel length from the base center to the muzzle, as a fraction of the cell
 * size. Used to spawn a tower's projectile (and its muzzle flash) at the gun
 * tip along the aim direction instead of the slot center. This is the RADIAL
 * fallback (a single scalar along the aim line); a tower with per-octant
 * {@link TOWER_MUZZLE_ANCHORS} overrides it with the exact barrel tip of its
 * current facing frame whenever the scene feeds the muzzle in (headless runs
 * with no renderer fall back to this radial value). Only meaningful for
 * rotating-turret towers; 0 / no entry => the shot originates from the slot center.
 */
export const TOWER_MUZZLE: Record<string, number> = {
  plasma_shutter: 0.5, // radial fallback; per-frame anchors in TOWER_MUZZLE_ANCHORS
  railgun: 0.34,
};
export function towerMuzzleFrac(iconKey: string): number {
  return TOWER_MUZZLE[iconKey] ?? 0;
}

/** A muzzle point: an offset from the aim-sheet CELL CENTER, in cell fractions. */
export interface MuzzleAnchor {
  /** +x = right of cell center (screen convention). */
  readonly x: number;
  /** +y = below cell center (screen convention); markers sit above center → negative. */
  readonly y: number;
}

/**
 * Per-octant barrel-tip muzzle points for rotating turrets, indexed by facing
 * octant in the same order SlotView slices the `_dirs` sheet (d0=N, d1=NE, d2=E,
 * d3=SE, d4=S, d5=SW, d6=W, d7=NW). Each entry is the green-marker centroid from
 * the hand-made anchor sheet (`docs/visual_refs/anchors/<iconKey>_dirs_anchors.png`),
 * measured as a fraction offset from that octant's cell center. SlotView turns the
 * current facing's anchor into a slot-local point through the SAME seat transform
 * the head sprite uses ({@link SlotView.muzzleLocal}); PlatformGrid maps it to scene
 * space and feeds it to the sim so shots and the muzzle flash leave the exact gun
 * tip of the displayed frame (vs. the radial {@link TOWER_MUZZLE} guess). Re-measured
 * with tools (see docs) if a `_dirs` sheet's barrel geometry changes.
 */
export const TOWER_MUZZLE_ANCHORS: Record<string, readonly MuzzleAnchor[]> = {
  plasma_shutter: [
    { x: 0.0035, y: -0.4706 }, // d0 N
    { x: 0.2817, y: -0.4238 }, // d1 NE
    { x: 0.3637, y: -0.213 }, // d2 E
    { x: 0.1906, y: -0.3154 }, // d3 SE
    { x: -0.005, y: -0.2479 }, // d4 S
    { x: -0.2371, y: -0.298 }, // d5 SW
    { x: -0.357, y: -0.207 }, // d6 W
    { x: -0.2691, y: -0.4209 }, // d7 NW
  ],
  railgun: [
    { x: 0.003, y: -0.4218 }, // d0 N
    { x: 0.2442, y: -0.3009 }, // d1 NE
    { x: 0.2586, y: -0.1836 }, // d2 E
    { x: 0.2258, y: -0.1304 }, // d3 SE
    { x: 0.0002, y: -0.0413 }, // d4 S
    { x: -0.2675, y: -0.1228 }, // d5 SW
    { x: -0.3327, y: -0.184 }, // d6 W
    { x: -0.3364, y: -0.3416 }, // d7 NW
  ],
};

/** Per-octant muzzle anchors for a tower's iconKey (undefined → use the radial fallback). */
export function towerMuzzleAnchors(iconKey: string): readonly MuzzleAnchor[] | undefined {
  return TOWER_MUZZLE_ANCHORS[iconKey];
}

export const CARD_LIST: CardDef[] = Object.values(CARDS);

export function getCard(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`Unknown card id: ${id}`);
  return def;
}

/** The card's per-grade row, clamped to the valid 1..3 range. */
export function cardGrade(def: CardDef, grade: number): CardDef['grades'][number] {
  const i = Math.min(Math.max(grade, 1), 3) - 1;
  return def.grades[i]!;
}

/** True when a card carries a fusion hybrid perk (v2 §6.5). */
export function hasHybridPerk(def: CardDef, perk: HybridPerk): boolean {
  return def.hybridPerks?.includes(perk) ?? false;
}

export function synergySlots(grade: number): number {
  return Math.min(Math.max(grade, 1), 3);
}

/**
 * Network load a card draws at a grade (v2 §3.А). Consumers *double* per grade
 * (×1/×2/×4 → 2/4/8, 3/6/12) so a field merge is energy-neutral: two Grade-I
 * towers (2+2=4) equal one Grade-II (4), and merging up neither refunds nor
 * charges energy. Generators (negative baseLoad) scale linearly instead, matching
 * their §5/§6 output table (2/4/6).
 */
export function cardLoad(def: CardDef, grade: number): number {
  const g = Math.min(Math.max(grade, 1), 3);
  return def.baseLoad > 0 ? def.baseLoad * Math.pow(2, g - 1) : def.baseLoad * g;
}
