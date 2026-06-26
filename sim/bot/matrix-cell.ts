// Run one matrix cell: smart policy × SEEDS × all levels for the active GAME_CONFIG
// and SELL_ENABLED / BURN_FIELD_ENABLED env flags. Writes JSON summary to MATRIX_OUT.
//
//   GAME_CONFIG=default SELL_ENABLED=1 BURN_FIELD_ENABLED=0 SEEDS=100 \
//     MATRIX_OUT=sim/out/matrix/default_sell.json \
//     tsx sim/bot/matrix-cell.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const gameConfig = process.env.GAME_CONFIG ?? 'default';
const seeds = Math.max(1, Number(process.env.SEEDS ?? 100) || 100);
const sellEnabled = process.env.SELL_ENABLED === '1';
const burnFieldEnabled = process.env.BURN_FIELD_ENABLED === '1';
const outPath = process.env.MATRIX_OUT ?? 'sim/out/matrix/cell.json';

const { LEVEL_ORDER } = await import('../../src/config/progression');
const { runOne } = await import('./runOne');

interface LevelAgg {
  runs: number;
  wins: number;
  coreSum: number;
  waveSum: number;
}

const t0 = Date.now();
const byLevel = new Map<string, LevelAgg>();
let totalRuns = 0;
let totalWins = 0;
let coreSum = 0;
let waveSum = 0;

for (const level of LEVEL_ORDER) {
  for (let seed = 1; seed <= seeds; seed++) {
    const r = runOne(level, 'smart', seed, gameConfig);
    totalRuns++;
    if (r.outcome === 'victory') totalWins++;
    coreSum += r.coreHp;
    waveSum += r.endedWave;
    const g = byLevel.get(level) ?? { runs: 0, wins: 0, coreSum: 0, waveSum: 0 };
    g.runs++;
    if (r.outcome === 'victory') g.wins++;
    g.coreSum += r.coreHp;
    g.waveSum += r.endedWave;
    byLevel.set(level, g);
  }
}

const summary = {
  gameConfig,
  scenario: {
    sellEnabled,
    burnFieldEnabled,
    label: scenarioLabel(sellEnabled, burnFieldEnabled),
  },
  seeds,
  policy: 'smart',
  totalRuns,
  winRate: round3(totalWins / totalRuns),
  avgCoreHp: round1(coreSum / totalRuns),
  avgEndWave: round1(waveSum / totalRuns),
  elapsedSec: round1((Date.now() - t0) / 1000),
  byLevel: [...byLevel.entries()].map(([level, g]) => ({
    level,
    runs: g.runs,
    winRate: round3(g.wins / g.runs),
    avgCoreHp: round1(g.coreSum / g.runs),
    avgEndWave: round1(g.waveSum / g.runs),
  })),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ outPath, ...summary, winRatePct: Math.round(summary.winRate * 1000) / 10 }));

function scenarioLabel(sell: boolean, burn: boolean): string {
  if (sell && !burn) return 'sell_only';
  if (!sell && burn) return 'burn_only';
  if (!sell && !burn) return 'baseline';
  return 'sell_and_burn';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
