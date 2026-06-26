// CLI: import bot Run records (§5.1) from an ndjson file into the runs table.
// Usage: tsx import.ts ../out/runs.jsonl
// Each non-empty line is one JSON Run record. stage/balanceVersion are read off
// the record when present. Idempotency is not enforced for runs (re-import → dupes),
// so import into a fresh DB or clear runs first.

import { readFileSync } from 'node:fs';
import { insertRuns, countRuns } from './db.ts';

const path = process.argv[2];
if (!path) {
  console.error('usage: tsx import.ts <runs.jsonl>');
  process.exit(1);
}

const lines = readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const runs = lines.map((line) => {
  const record = JSON.parse(line) as { stage?: string; balanceVersion?: string; seed?: number; policy?: string };
  return {
    seed: record.seed,
    policy: record.policy,
    stage: record.stage,
    balanceVersion: record.balanceVersion,
    record,
  };
});

const inserted = insertRuns(runs);
console.log(`imported ${inserted} run(s) from ${path} → runs table now has ${countRuns()}`);
