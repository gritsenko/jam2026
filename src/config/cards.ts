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
 * iconKeys whose `<iconKey>_dirs` 3×3 aim sheet uses the COMPOSED layout: the
 * center cell is a *stationary base* and the 8 perimeter cells are the rotating
 * *head only*. SlotView draws the base once underneath and crossfades the head
 * between octants for a smooth turn (the base stays outside the crossfade, so it
 * never ghosts). Sheets NOT listed here use the old layout — each cell is a full
 * turret with the base baked in — and hard-swap frames. Add an iconKey here once
 * its `_dirs` sheet is redrawn in the composed layout.
 */
export const COMPOSED_AIM_SHEETS = new Set<string>(['plasma_shutter']);

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
  railgun: { wFrac: 0.71, cyFrac: 0.77 }, // old sheet: full turret per cell (long rail)
  frost_pulse: { wFrac: 0.88, cyFrac: 0.7 },
  storm_coil: { wFrac: 0.88, cyFrac: 0.7 },
  shield_generator: { wFrac: 0.88, cyFrac: 0.61 },
  grid_stabilizer: { wFrac: 0.88, cyFrac: 0.7 },
};

/** Seat geometry for a tower's iconKey (falls back to the default). */
export function towerSeat(iconKey: string): TowerSeat {
  return TOWER_SEATS[iconKey] ?? TOWER_SEAT_DEFAULT;
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
