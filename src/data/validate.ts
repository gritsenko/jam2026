// Dev-only referential-integrity checks for a GameConfig — the things tsc can't
// catch (dangling enemy/card ids, wrong grade count). Pure; called from load.ts
// under import.meta.env.DEV and tree-shaken from production. See config-as-data.md.

import type { GameConfig } from './schema';

/** Throwing check used at load time (DEV). */
export function validateGameConfig(set: GameConfig, name: string): void {
  const issues = collectGameConfigIssues(set);
  if (issues.length > 0) {
    throw new Error(`[config:${name}] invalid GameConfig:\n  - ${issues.join('\n  - ')}`);
  }
}

/** Non-throwing variant — returns the list of integrity issues (reused by the editor). */
export function collectGameConfigIssues(set: GameConfig): string[] {
  const issues: string[] = [];
  const cardIds = new Set(Object.keys(set.cards));
  const enemyIds = new Set(set.enemies.map((e) => e.id));
  const levelIds = new Set(set.levels.map((l) => l.id));

  // Card grade tables must be exactly 3 rows (Grade I/II/III).
  for (const [id, def] of Object.entries(set.cards)) {
    if (!Array.isArray(def.grades) || def.grades.length !== 3) {
      issues.push(`card "${id}": expected 3 grades, got ${def.grades?.length}`);
    }
  }

  // Every spawned enemy id must exist.
  const checkWaves = (waves: { groups: { enemyId: string }[] }[], where: string): void => {
    waves.forEach((w, wi) => {
      w.groups.forEach((g) => {
        if (!enemyIds.has(g.enemyId)) {
          issues.push(`${where} wave ${wi + 1}: unknown enemyId "${g.enemyId}"`);
        }
      });
    });
  };
  checkWaves(set.waves, 'waves');
  for (const [lvl, lc] of Object.entries(set.levelCombat)) {
    checkWaves(lc.waves, `levelCombat ${lvl}`);
  }

  // Fusion results must be real cards.
  for (const [pair, result] of Object.entries(set.recipes)) {
    if (!cardIds.has(result)) issues.push(`recipe "${pair}": unknown result card "${result}"`);
  }

  // Unlocks reference real levels + cards; starting towers are real cards.
  for (const [lvl, u] of Object.entries(set.levelUnlocks)) {
    if (!levelIds.has(lvl)) issues.push(`levelUnlocks: unknown level "${lvl}"`);
    for (const t of u.towers) if (!cardIds.has(t)) issues.push(`levelUnlocks ${lvl}: unknown tower "${t}"`);
  }
  for (const t of set.startingTowers) {
    if (!cardIds.has(t)) issues.push(`startingTowers: unknown tower "${t}"`);
  }

  return issues;
}
