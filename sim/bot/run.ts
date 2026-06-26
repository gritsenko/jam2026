// Bot harness CLI: runs (level × policy × seed) headlessly and writes
// sim/out/runs.jsonl (ndjson Run records) + sim/out/analysis.json (win-rate
// summary). Deterministic policies run once; stochastic ones use all SEEDS, so a
// big sweep yields a real distribution. Optionally pushes to the telemetry backend.
//
//   tsx sim/bot/run.ts
//   SEEDS=1000 GAME_CONFIG=default tsx sim/bot/run.ts
//   SEEDS=1000 INGEST_URL=http://127.0.0.1:8787 tsx sim/bot/run.ts
// (or import the file: tsx sim/server/import.ts sim/out/runs.jsonl)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVEL_ORDER } from '../../src/config/progression';
import { POLICIES, isStochastic } from './policies';
import { runOne } from './runOne';
import type { RunRecord } from './recorder';

const gameConfig = process.env.GAME_CONFIG ?? 'default';
const seeds = Math.max(1, Number(process.env.SEEDS ?? 1) || 1);
const ingestUrl = process.env.INGEST_URL;

const outDir = dirname(fileURLToPath(new URL('../out/runs.jsonl', import.meta.url)));
mkdirSync(outDir, { recursive: true });

const t0 = Date.now();
const records: RunRecord[] = [];
for (const level of LEVEL_ORDER) {
  for (const policy of POLICIES) {
    const n = isStochastic(policy) ? seeds : 1; // deterministic policies run once
    for (let seed = 1; seed <= n; seed++) {
      records.push(runOne(level, policy, seed, gameConfig));
    }
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

writeFileSync(`${outDir}/runs.jsonl`, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

// Aggregate analysis per (stage, policy): win-rate distribution + averages.
interface Bucket {
  n: number;
  wins: number;
  coreSum: number;
  waveSum: number;
  durSum: number;
  perfectSum: number;
}
const byKey = new Map<string, Bucket>();
for (const r of records) {
  const k = `${r.stage}|${r.policy}`;
  const g = byKey.get(k) ?? { n: 0, wins: 0, coreSum: 0, waveSum: 0, durSum: 0, perfectSum: 0 };
  g.n += 1;
  if (r.outcome === 'victory') g.wins += 1;
  g.coreSum += r.coreHp;
  g.waveSum += r.endedWave;
  g.durSum += r.durationSec;
  g.perfectSum += r.perfectWaves;
  byKey.set(k, g);
}
const analysis = {
  meta: { gameConfig, seeds, totalRuns: records.length, elapsedSec: Number(elapsed) },
  byStagePolicy: [...byKey.entries()].map(([k, g]) => {
    const [stage, policy] = k.split('|');
    return {
      stage,
      policy,
      runs: g.n,
      winRate: Math.round((g.wins / g.n) * 1000) / 1000,
      avgCoreHp: Math.round((g.coreSum / g.n) * 10) / 10,
      avgEndWave: Math.round((g.waveSum / g.n) * 10) / 10,
      avgDurationSec: Math.round((g.durSum / g.n) * 10) / 10,
      avgPerfectWaves: Math.round((g.perfectSum / g.n) * 100) / 100,
    };
  }),
};
writeFileSync(`${outDir}/analysis.json`, JSON.stringify(analysis, null, 2) + '\n', 'utf8');

console.log(`${records.length} runs in ${elapsed}s → ${outDir}/runs.jsonl + analysis.json (gameConfig=${gameConfig}, seeds=${seeds})\n`);
console.log('stage        policy        runs   winRate  avgCore  avgWave');
for (const a of analysis.byStagePolicy) {
  console.log(
    `${a.stage!.padEnd(12)} ${a.policy!.padEnd(12)} ${String(a.runs).padStart(5)}   ${(a.winRate * 100).toFixed(0).padStart(4)}%    ${String(a.avgCoreHp).padStart(5)}   ${String(a.avgEndWave).padStart(5)}`,
  );
}

// Push to the backend in batches (respect the 1 MB ingest body limit).
async function push(url: string): Promise<void> {
  const endpoint = url.replace(/\/$/, '') + '/ingest/runs';
  const CHUNK = 300;
  let pushed = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK).map((record) => ({ stage: record.stage, config: gameConfig, balanceVersion: gameConfig, record }));
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runs: batch }),
    }).then((x) => x.json());
    pushed += (r as { inserted?: number }).inserted ?? 0;
  }
  console.log(`\npushed ${pushed} runs to ${endpoint}`);
}

if (ingestUrl) {
  push(ingestUrl).catch((e) => console.error('\npush failed:', String(e)));
}
