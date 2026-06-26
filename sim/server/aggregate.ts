// Build the unified aggregate (§5.2) from user events + bot runs. Grouped by
// (stage, source) so the dashboard can draw bot vs user with one lens.

import { allEvents, allRuns } from './db.ts';
import { attemptsFromUserEvents, attemptFromRun } from './normalize.ts';
import type { AttemptSummary } from './normalize.ts';

export interface StageSourceMetrics {
  attempts: number;
  wins: number;
  winRate: number;
  avgCoreHpEnd: number;
  coreMax: number;
  avgDurationSec: number;
  leakRate: number;
  avgRerolls: number;
  avgBurns: number;
  avgFusions: number;
  perfectWaves: number;
  wavesCleared: number;
  /** Histogram of where attempts ended (by wave) — the "where runs die" map. */
  deathsByWave: Record<string, number>;
  faucets: { gold: Record<string, number>; crystals: Record<string, number> };
  sinks: { gold: Record<string, number>; crystals: Record<string, number> };
  kills: Record<string, number>;
  leaks: Record<string, number>;
  damageByElement: Record<string, number>;
  shotsByCard: Record<string, number>;
}

export interface Aggregate {
  meta: {
    generatedAt: number;
    balanceVersions: string[];
    /** All game config ids present (so the dashboard can populate the selector). */
    configs: string[];
    /** The config this aggregate was filtered to (or 'all'). */
    config: string;
    sources: string[];
    totalAttempts: number;
  };
  // stages[stage][source] = metrics
  stages: Record<string, Record<string, StageSourceMetrics>>;
}

export interface AggregateFilter {
  config?: string; // '' / 'all' → no filter
  source?: string; // 'user' | 'bot' | 'all'
  level?: string;
}

function addInto(target: Record<string, number>, src: Record<string, number>): void {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] ?? 0) + v;
}

function summarize(group: AttemptSummary[]): StageSourceMetrics {
  const m: StageSourceMetrics = {
    attempts: group.length,
    wins: 0,
    winRate: 0,
    avgCoreHpEnd: 0,
    coreMax: 0,
    avgDurationSec: 0,
    leakRate: 0,
    avgRerolls: 0,
    avgBurns: 0,
    avgFusions: 0,
    perfectWaves: 0,
    wavesCleared: 0,
    deathsByWave: {},
    faucets: { gold: {}, crystals: {} },
    sinks: { gold: {}, crystals: {} },
    kills: {},
    leaks: {},
    damageByElement: {},
    shotsByCard: {},
  };
  let coreHpSum = 0;
  let durSum = 0;
  let totalKills = 0;
  let totalLeaks = 0;
  for (const a of group) {
    if (a.outcome === 'victory') m.wins += 1;
    coreHpSum += a.coreHp;
    m.coreMax = Math.max(m.coreMax, a.coreMax);
    durSum += a.durationSec;
    m.avgRerolls += a.rerolls;
    m.avgBurns += a.burns;
    m.avgFusions += a.fusions;
    m.perfectWaves += a.perfectWaves;
    m.wavesCleared += a.wavesCleared;
    m.deathsByWave[String(a.endedWave)] = (m.deathsByWave[String(a.endedWave)] ?? 0) + 1;
    addInto(m.faucets.gold, a.faucets.gold);
    addInto(m.faucets.crystals, a.faucets.crystals);
    addInto(m.sinks.gold, a.sinks.gold);
    addInto(m.sinks.crystals, a.sinks.crystals);
    addInto(m.kills, a.kills);
    addInto(m.leaks, a.leaks);
    addInto(m.damageByElement, a.damageByElement);
    addInto(m.shotsByCard, a.shotsByCard);
    totalKills += Object.values(a.kills).reduce((s, n) => s + n, 0);
    totalLeaks += Object.values(a.leaks).reduce((s, n) => s + n, 0);
  }
  const n = group.length || 1;
  m.winRate = m.wins / n;
  m.avgCoreHpEnd = coreHpSum / n;
  m.avgDurationSec = durSum / n;
  m.avgRerolls /= n;
  m.avgBurns /= n;
  m.avgFusions /= n;
  m.leakRate = totalKills + totalLeaks > 0 ? totalLeaks / (totalKills + totalLeaks) : 0;
  return m;
}

export function buildAggregate(filter: AggregateFilter = {}): Aggregate {
  const userAttempts = attemptsFromUserEvents(allEvents().filter((e) => e.source === 'user'));
  const botAttempts = allRuns().map(attemptFromRun);
  const everything = [...userAttempts, ...botAttempts];

  // Distinct configs across ALL data (populate the selector independent of filter).
  const configs = [...new Set(everything.map((a) => a.config))].sort();
  const balanceVersions = new Set<string>();
  const sources = new Set<string>();

  const wantConfig = filter.config && filter.config !== 'all' ? filter.config : null;
  const wantSource = filter.source && filter.source !== 'all' ? filter.source : null;
  const all = everything.filter(
    (a) =>
      (!wantConfig || a.config === wantConfig) &&
      (!wantSource || a.source === wantSource) &&
      (!filter.level || a.stage === filter.level),
  );

  const stages: Record<string, Record<string, AttemptSummary[]>> = {};
  for (const a of all) {
    balanceVersions.add(a.balanceVersion);
    sources.add(a.source);
    (stages[a.stage] ??= {})[a.source] ??= [];
    stages[a.stage]![a.source]!.push(a);
  }

  const out: Aggregate['stages'] = {};
  for (const [stage, bySource] of Object.entries(stages)) {
    out[stage] = {};
    for (const [source, group] of Object.entries(bySource)) {
      out[stage]![source] = summarize(group);
    }
  }

  return {
    meta: {
      generatedAt: Date.now(),
      balanceVersions: [...balanceVersions].sort(),
      configs,
      config: wantConfig ?? 'all',
      sources: [...sources].sort(),
      totalAttempts: all.length,
    },
    stages: out,
  };
}
