// Legacy wave-authoring rules for support mobs (docs/planned/enemy-roster-design.md).
// Enforced in validate.ts — supports may only appear in waves that also field a
// large escort pack or at least one boss.

import type { EnemyDef } from '../config/types';
import type { WaveDef } from '../config/types';

/** Min non-support enemies in the same wave when no boss is present. */
export const SUPPORT_MIN_ESCORT = 14;

/** Enemies at or above this base maxHp count as bosses for escort rules. */
export const BOSS_HP_THRESHOLD = 1000;

export function isSupportEnemy(id: string, enemies: readonly EnemyDef[]): boolean {
  return enemies.find((e) => e.id === id)?.archetype === 'support';
}

export function isBossEnemy(id: string, enemies: readonly EnemyDef[]): boolean {
  const hp = enemies.find((e) => e.id === id)?.maxHp ?? 0;
  return hp >= BOSS_HP_THRESHOLD;
}

/** Non-support headcount in a wave (disruptors, grunts, bosses all count). */
export function escortCount(wave: WaveDef, enemies: readonly EnemyDef[]): number {
  let n = 0;
  for (const g of wave.groups) {
    if (!isSupportEnemy(g.enemyId, enemies)) n += g.count;
  }
  return n;
}

export function waveHasBoss(wave: WaveDef, enemies: readonly EnemyDef[]): boolean {
  return wave.groups.some((g) => isBossEnemy(g.enemyId, enemies));
}

export function waveHasSupport(wave: WaveDef, enemies: readonly EnemyDef[]): boolean {
  return wave.groups.some((g) => isSupportEnemy(g.enemyId, enemies));
}

/** Returns human-readable issues for one wave (empty = OK). */
export function supportEscortIssues(
  wave: WaveDef,
  enemies: readonly EnemyDef[],
  where: string,
): string[] {
  if (!waveHasSupport(wave, enemies)) return [];
  const escort = escortCount(wave, enemies);
  const boss = waveHasBoss(wave, enemies);
  if (boss || escort >= SUPPORT_MIN_ESCORT) return [];
  return [
    `${where}: support mob(s) need escort ≥${SUPPORT_MIN_ESCORT} or a boss (got ${escort})`,
  ];
}

export interface SpawnQueueEntry {
  def: EnemyDef;
  gap: number;
}

/**
 * Flatten a wave into a spawn queue. Support mobs are inserted at the midpoint of
 * the non-support stream so they arrive mid-wave (not at the front where towers
 * can snipe them before escorts stack).
 */
export function buildSpawnQueue(
  wave: WaveDef,
  resolve: (id: string) => EnemyDef,
): SpawnQueueEntry[] {
  const grunt: SpawnQueueEntry[] = [];
  const support: SpawnQueueEntry[] = [];
  for (const group of wave.groups) {
    if (group.count <= 0) continue;
    const def = resolve(group.enemyId);
    const bucket = def.archetype === 'support' ? support : grunt;
    for (let i = 0; i < group.count; i++) bucket.push({ def, gap: group.gap });
  }
  if (support.length === 0) return grunt;
  const mid = Math.floor(grunt.length / 2);
  return [...grunt.slice(0, mid), ...support, ...grunt.slice(mid)];
}
