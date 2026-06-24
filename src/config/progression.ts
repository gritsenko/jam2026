import { LEVELS } from './levels';

/**
 * Meta-campaign progression data (docs/done/progression-and-tech-tree.md §2/§3).
 *
 * The campaign is a linear gate: clearing level N unlocks the next level and
 * grants a *permanent* unlock (a tower and/or a mechanic) for all future battles.
 * This file is pure data + pure derivation; the live progress (what's cleared,
 * stars, admin flag, persistence) lives in {@link import('../game/progress')}.
 */

/** Level ids in campaign order (mirrors the world-map node order). */
export const LEVEL_ORDER: string[] = LEVELS.map((l) => l.id);

/** Towers the player starts with before clearing anything (§2: Plasma + Frost). */
export const STARTING_TOWERS: readonly string[] = ['plasma_shutter', 'frost_pulse'];

/**
 * What clearing each level unlocks *forever* (§2 table). `towers` are card ids
 * added to the draw pool; `mechanics` are systemic flags the battle reads to
 * gate features (reroll, fusion, …). The lesson a level *teaches* is realized as
 * the unlock the player carries into the next battle.
 */
export const LEVEL_UNLOCKS: Record<string, { towers: string[]; mechanics: string[] }> = {
  lvl_1: { towers: ['storm_coil'], mechanics: [] },
  lvl_2: { towers: [], mechanics: ['merge', 'reroll', 'crystals'] },
  lvl_3: { towers: [], mechanics: ['resonance'] },
  lvl_4: { towers: ['railgun', 'grid_stabilizer'], mechanics: ['overload'] },
  lvl_5: { towers: ['shield_generator'], mechanics: ['interrupt', 'mod_cards'] },
  lvl_6: { towers: [], mechanics: ['fusion'] },
  lvl_7: { towers: [], mechanics: ['fusion_recipes'] },
};

/** Tower ids unlocked given the set of cleared levels (starting roster + clears). */
export function unlockedTowersFromCleared(cleared: Iterable<string>): Set<string> {
  const set = new Set<string>(STARTING_TOWERS);
  for (const id of cleared) for (const t of LEVEL_UNLOCKS[id]?.towers ?? []) set.add(t);
  return set;
}

/** Systemic mechanic flags unlocked given the set of cleared levels. */
export function unlockedMechanicsFromCleared(cleared: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const id of cleared) for (const m of LEVEL_UNLOCKS[id]?.mechanics ?? []) set.add(m);
  return set;
}

/** Levels that come strictly before `levelId` in the campaign ladder. */
function priorLevels(levelId: string): string[] {
  const idx = LEVEL_ORDER.indexOf(levelId);
  return LEVEL_ORDER.slice(0, idx < 0 ? 0 : idx);
}

/**
 * Tower roster *fixed* for a given level: the starting towers plus everything
 * the levels before it grant (§2 ladder). Deterministic — it depends only on the
 * level's position, not on global progress or Admin mode, so level 1 always
 * comes up with Plasma + Frost and jumping ahead (Admin) yields that level's
 * intended roster.
 */
export function unlockedTowersForLevel(levelId: string): Set<string> {
  return unlockedTowersFromCleared(priorLevels(levelId));
}

/** Mechanic flags fixed for a given level (same per-level rule as the roster). */
export function unlockedMechanicsForLevel(levelId: string): Set<string> {
  return unlockedMechanicsFromCleared(priorLevels(levelId));
}

/**
 * Tower ids that *become available on the next level* as a direct result of
 * clearing `levelId` — the roster gained from this level to the next. Computed
 * as the difference between the two levels' fixed rosters, so it stays correct
 * however unlocks are modeled. Empty for the last level (no "next") and for
 * levels that grant only mechanics. Drives the "Tech unlocked" banner reveal.
 */
export function towersUnlockedByClearing(levelId: string): string[] {
  const idx = LEVEL_ORDER.indexOf(levelId);
  const next = idx < 0 ? undefined : LEVEL_ORDER[idx + 1];
  if (!next) return [];
  const before = unlockedTowersForLevel(levelId);
  return [...unlockedTowersForLevel(next)].filter((t) => !before.has(t));
}

/**
 * Stars earned for a clear, by remaining Core integrity (§4): 1★ just cleared,
 * 2★ Core ≥ 50%, 3★ Core untouched (full).
 */
export function starsForClear(coreHp: number, coreMax: number): number {
  if (coreHp >= coreMax) return 3;
  if (coreHp / coreMax >= 0.5) return 2;
  return 1;
}
