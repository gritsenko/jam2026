// Maps BattleSim callbacks into a Run record (§5.1) shaped to match the backend's
// AttemptSummary, so bot runs land in the same /aggregate as real players (source
// 'bot'). See docs/backlog/autotest-system-impl-plan.md and analytics-and-backend.md.

import type { SimEnemy, SimStatus } from '../../src/game/BattleSim';
import type { PlacedCard } from '../../src/config/types';

/** Minimal end-state view — satisfied by both BattleSim and BattleCore. */
interface EndState {
  status: SimStatus;
  coreHp: number;
  waveNumber: number;
}
import { WAVE_CLEAR_BONUS, PERFECT_CLEAR_CRYSTALS, CORE_MAX } from '../../src/config/combatRules';

export interface RunRecord {
  stage: string;
  /** Which game config this run used (dashboard config filter/compare). */
  config: string;
  balanceVersion: string;
  seed: number;
  policy: string;
  outcome: string;
  coreHp: number;
  coreMax: number;
  endedWave: number;
  durationSec: number;
  wavesCleared: number;
  perfectWaves: number;
  faucets: { gold: Record<string, number>; crystals: Record<string, number> };
  sinks: { gold: Record<string, number>; crystals: Record<string, number> };
  kills: Record<string, number>;
  leaks: Record<string, number>;
  damageByElement: Record<string, number>;
  shotsByCard: Record<string, number>;
}

function bump(rec: Record<string, number>, key: string, by = 1): void {
  rec[key] = (rec[key] ?? 0) + by;
}

export interface Recorder {
  callbacks: {
    onEnemyKilled(e: SimEnemy): void;
    onEnemyLeaked(e: SimEnemy): void;
    onEnemyDamaged(e: SimEnemy, amount: number, crit: boolean, element: string): void;
    onTowerFired(slotIndex: number): void;
    onWaveCleared(n: number, perfect: boolean): void;
  };
  finish(sim: EndState, durationSec: number, ctx: { seed: number; policy: string; config: string; balanceVersion: string }): RunRecord;
}

/** Build a recorder for one run. `slots` resolves tower-fired slot → cardId. */
export function createRecorder(stage: string, slots: (PlacedCard | null)[]): Recorder {
  const kills: Record<string, number> = {};
  const leaks: Record<string, number> = {};
  const damageByElement: Record<string, number> = {};
  const shotsByCard: Record<string, number> = {};
  const faucets = { gold: {} as Record<string, number>, crystals: {} as Record<string, number> };
  let wavesCleared = 0;
  let perfectWaves = 0;

  return {
    callbacks: {
      onEnemyKilled(e) {
        bump(kills, e.def.id);
        bump(faucets.gold, 'kill_bounty', e.bounty);
        const cb = e.def.crystalBounty ?? 0;
        if (cb > 0) bump(faucets.crystals, 'elite_drop', cb);
      },
      onEnemyLeaked(e) {
        bump(leaks, e.def.id);
      },
      onEnemyDamaged(_e, amount, _crit, element) {
        bump(damageByElement, element, amount);
      },
      onTowerFired(slotIndex) {
        const placed = slots[slotIndex];
        if (placed) bump(shotsByCard, placed.cardId);
      },
      onWaveCleared(_n, perfect) {
        wavesCleared += 1;
        bump(faucets.gold, 'wave_clear', WAVE_CLEAR_BONUS);
        if (perfect) {
          perfectWaves += 1;
          bump(faucets.crystals, 'perfect_clear', PERFECT_CLEAR_CRYSTALS);
        }
      },
    },
    finish(sim, durationSec, ctx) {
      return {
        stage,
        config: ctx.config,
        balanceVersion: ctx.balanceVersion,
        seed: ctx.seed,
        policy: ctx.policy,
        outcome: sim.status === 'victory' ? 'victory' : sim.status === 'defeat' ? 'defeat' : 'timeout',
        coreHp: sim.coreHp,
        coreMax: CORE_MAX,
        endedWave: sim.waveNumber,
        durationSec: Math.round(durationSec * 10) / 10,
        wavesCleared,
        perfectWaves,
        faucets,
        sinks: { gold: {}, crystals: {} }, // baseline policies don't model economy spend
        kills,
        leaks,
        damageByElement,
        shotsByCard,
      };
    },
  };
}
