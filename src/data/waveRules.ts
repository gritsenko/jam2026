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
