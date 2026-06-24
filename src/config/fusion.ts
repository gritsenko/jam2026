/**
 * Fusion in hand (v2 §6.5): two *different* base cards combine into a hybrid card
 * unobtainable on the field — a horizontal "craft", distinct from the vertical
 * field merge of two identical cards. Prototype subset: 3 of the 6 recipes.
 *
 * Data only (no Pixi): the scene reads {@link fusionResult} to detect a valid
 * drop of one hand card onto another, and the cost helpers to gate / price it.
 */

/** Unordered key for a pair of card ids (Plasma+Frost === Frost+Plasma). */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const RECIPES: Record<string, string> = {
  [pairKey('plasma_shutter', 'frost_pulse')]: 'steam_cannon',
  [pairKey('frost_pulse', 'storm_coil')]: 'cryo_discharge',
  [pairKey('plasma_shutter', 'storm_coil')]: 'ion_volley',
};

/** The hybrid id two card ids fuse into, or null if there is no recipe. */
export function fusionResult(aId: string, bId: string): string | null {
  if (aId === bId) return null; // fusion needs two *different* cards
  return RECIPES[pairKey(aId, bId)] ?? null;
}

/** Flat crystal cost of any fusion (v2 §6.5: 1 Crystal, no escalation). */
export const FUSION_CRYSTAL_COST = 1;

const FUSION_GOLD_BASE = 60;
const FUSION_GOLD_PER_GRADE = 40;

/**
 * Scalable gold cost (v2 §6.5): cheap for two Grade-I cards, steeper for graded
 * ones. Hand cards are Grade I today, so this is effectively the flat base.
 */
export function fusionGoldCost(gradeA: number, gradeB: number): number {
  return FUSION_GOLD_BASE + (gradeA - 1 + gradeB - 1) * FUSION_GOLD_PER_GRADE;
}
