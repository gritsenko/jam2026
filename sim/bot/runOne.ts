// Run a single headless battle: (level, policy, seed) → RunRecord. Drives the
// shared BattleCore (decision/economy engine over a headless BattleSim) at a fixed
// dt — overload + economy are handled by BattleCore, so the bot plays through the
// same engine the game uses. Static-board policies use setBoard; action policies
// (later) will call core.place/merge/... between ticks.

import { BattleCore } from '../../src/game/BattleCore';
import { boardFor, type PolicyName } from './policies';
import { createRecorder, type RunRecord } from './recorder';

const DT = 1 / 60;
const MAX_TICKS = 60 * 60 * 15; // 15-minute safety cap → 'timeout'

export function runOne(
  levelId: string,
  policy: PolicyName,
  seed: number,
  gameConfig: string,
): RunRecord {
  const slots = boardFor(policy, levelId, seed);
  const rec = createRecorder(levelId, slots);
  // No `rng` passed → legacy clock-based rolls (deterministic under fixed dt), so
  // the static-board curve is reproducible. Action policies can opt into a seeded
  // rng here for FPS-independent reproducibility.
  const core = new BattleCore({ levelId, observer: rec.callbacks });
  core.setBoard(slots);
  core.start();

  let ticks = 0;
  while (core.status === 'running' && ticks < MAX_TICKS) {
    core.tick(DT);
    ticks++;
  }
  return rec.finish(core, ticks * DT, { seed, policy, config: gameConfig, balanceVersion: gameConfig });
}
