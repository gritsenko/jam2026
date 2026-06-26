// Run a single headless battle: (level, policy, seed) → RunRecord. Drives the
// shared BattleCore at a fixed dt — overload, hand respawn and economy are handled
// by BattleCore, so the bot plays through the same engine the game uses.
//   - static policies (seeded/greedyFill/randomBoard): set a fixed board, then run.
//   - active policy (smart): SmartController plays over time with a seeded rng.

import { BattleCore } from '../../src/game/BattleCore';
import { makeRng } from '../../src/game/rng';
import { boardFor, isActive, type PolicyName } from './policies';
import { SmartController } from './smartController';
import { createRecorder, type RunRecord, type SlotsRef } from './recorder';

const DT = 1 / 60;
const MAX_TICKS = 60 * 60 * 15; // 15-minute safety cap → 'timeout'

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function runOne(
  levelId: string,
  policy: PolicyName,
  seed: number,
  gameConfig: string,
): RunRecord {
  const active = isActive(policy);
  // Active policies use a seeded rng (reproducible hand draws + combat rolls).
  // Static policies pass none → legacy deterministic rolls (parity preserved).
  const rng = active ? makeRng(seed * 2654435761 + hashStr(levelId + ':' + policy)) : undefined;

  const live: SlotsRef = { slots: [] };
  const rec = createRecorder(levelId, live);
  const core = new BattleCore({ levelId, observer: rec.callbacks, rng });
  live.slots = core.state.slots; // live board reference for tower-fired resolution

  if (!active) core.setBoard(boardFor(policy, levelId, seed));

  const ctrl = active ? new SmartController() : null;
  core.start();
  let ticks = 0;
  while (core.status === 'running' && ticks < MAX_TICKS) {
    ctrl?.tick(core, DT);
    core.tick(DT);
    ticks++;
  }

  return rec.finish(core, ticks * DT, {
    seed,
    policy,
    config: gameConfig,
    balanceVersion: gameConfig,
    faucets: core.faucets,
    sinks: core.sinks,
  });
}
