// Orchestrate bot matrix: configs × sell/burn scenarios × SEEDS smart runs.
//
//   SEEDS=100 tsx sim/bot/matrix-sweep.ts
//
// Writes sim/out/matrix/*.json + sim/out/matrix-report.md

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TSX = join(ROOT, 'sim/server/node_modules/.bin/tsx');
const OUT_DIR = join(ROOT, 'sim/out/matrix');
const seeds = Math.max(1, Number(process.env.SEEDS ?? 100) || 100);

const CONFIGS = [
  { id: 'default', label: 'Default' },
  { id: 'bot_tune', label: 'bot_tune' },
  { id: 'bot_tune_hard', label: 'bot_tune_hard' },
] as const;

const SCENARIOS = [
  { sell: true, burn: false, label: 'Sell only', key: 'sell_only' },
  { sell: false, burn: true, label: 'Burn only', key: 'burn_only' },
  { sell: false, burn: false, label: 'Both off', key: 'baseline' },
] as const;

interface CellSummary {
  gameConfig: string;
  scenario: { sellEnabled: boolean; burnFieldEnabled: boolean; label: string };
  winRate: number;
  avgCoreHp: number;
  avgEndWave: number;
  totalRuns: number;
  elapsedSec: number;
  byLevel: { level: string; winRate: number; avgCoreHp: number }[];
}

mkdirSync(OUT_DIR, { recursive: true });

const cells: { config: string; scenario: string; summary: CellSummary }[] = [];
const t0 = Date.now();

for (const cfg of CONFIGS) {
  for (const sc of SCENARIOS) {
    const outPath = join(OUT_DIR, `${cfg.id}_${sc.key}.json`);
    console.log(`\n▶ ${cfg.label} / ${sc.label} (${seeds} seeds)…`);
    const r = spawnSync(TSX, ['sim/bot/matrix-cell.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        GAME_CONFIG: cfg.id,
        SELL_ENABLED: sc.sell ? '1' : '0',
        BURN_FIELD_ENABLED: sc.burn ? '1' : '0',
        SEEDS: String(seeds),
        MATRIX_OUT: outPath,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      throw new Error(`matrix cell failed: ${cfg.id} ${sc.key}`);
    }
    const line = (r.stdout ?? '').trim().split('\n').pop()!;
    console.log(line);
    const summary = JSON.parse(readFileSync(outPath, 'utf8')) as CellSummary;
    cells.push({ config: cfg.label, scenario: sc.label, summary });
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const md = buildMarkdown(cells, seeds, elapsed);
const reportPath = join(ROOT, 'sim/out/matrix-report.md');
writeFileSync(reportPath, md, 'utf8');
console.log(`\nDone in ${elapsed}s → ${reportPath}`);

function pct(wr: number): string {
  return `${(wr * 100).toFixed(1)}%`;
}

function buildMarkdown(
  rows: { config: string; scenario: string; summary: CellSummary }[],
  seedCount: number,
  elapsedSec: string,
): string {
  const lines: string[] = [
    '# Bot matrix — smart policy',
    '',
    `**Seeds per level:** ${seedCount}  `,
    `**Elapsed:** ${elapsedSec}s  `,
    `**Policy:** smart`,
    '',
    '## Overall win rate (all levels)',
    '',
    '| Config | Sell only | Burn only | Both off |',
    '|--------|-----------|-----------|----------|',
  ];

  for (const cfg of CONFIGS) {
    const sell = rows.find((r) => r.config === cfg.label && r.scenario === 'Sell only');
    const burn = rows.find((r) => r.config === cfg.label && r.scenario === 'Burn only');
    const base = rows.find((r) => r.config === cfg.label && r.scenario === 'Both off');
    lines.push(
      `| ${cfg.label} | ${sell ? pct(sell.summary.winRate) : '—'} | ${burn ? pct(burn.summary.winRate) : '—'} | ${base ? pct(base.summary.winRate) : '—'} |`,
    );
  }

  lines.push('', '## Avg Core HP (all levels)', '', '| Config | Sell only | Burn only | Both off |', '|--------|-----------|-----------|----------|');
  for (const cfg of CONFIGS) {
    const sell = rows.find((r) => r.config === cfg.label && r.scenario === 'Sell only');
    const burn = rows.find((r) => r.config === cfg.label && r.scenario === 'Burn only');
    const base = rows.find((r) => r.config === cfg.label && r.scenario === 'Both off');
    lines.push(
      `| ${cfg.label} | ${sell?.summary.avgCoreHp ?? '—'} | ${burn?.summary.avgCoreHp ?? '—'} | ${base?.summary.avgCoreHp ?? '—'} |`,
    );
  }

  lines.push('', '## Per-level win rate', '');
  for (const cfg of CONFIGS) {
    lines.push(`### ${cfg.label}`, '');
    const cfgRows = rows.filter((r) => r.config === cfg.label);
    const levels = cfgRows[0]?.summary.byLevel.map((l) => l.level) ?? [];
    lines.push('| Level | Sell only | Burn only | Both off |');
    lines.push('|-------|-----------|-----------|----------|');
    for (const lvl of levels) {
      const cols = SCENARIOS.map((sc) => {
        const row = cfgRows.find((r) => r.scenario === sc.label);
        const cell = row?.summary.byLevel.find((l) => l.level === lvl);
        return cell ? pct(cell.winRate) : '—';
      });
      lines.push(`| ${lvl} | ${cols.join(' | ')} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
