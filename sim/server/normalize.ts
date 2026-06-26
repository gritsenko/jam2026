// Normalize raw telemetry into per-attempt summaries so real players (event
// streams) and bot runs (Run records §5.1) collapse into ONE aggregate with a
// `source` discriminator. See docs/backlog/analytics-and-backend.md §2.

import type { EventRow, RunRow } from './db.ts';

export interface AttemptSummary {
  source: string; // 'user' | 'bot'
  stage: string; // level id
  config: string; // game config id (filter/compare dimension)
  balanceVersion: string;
  outcome: string; // 'victory' | 'defeat' | 'incomplete'
  stars: number;
  coreHp: number;
  coreMax: number;
  endedWave: number;
  durationSec: number;
  rerolls: number;
  burns: number;
  fusions: number;
  wavesCleared: number;
  perfectWaves: number;
  faucets: { gold: Record<string, number>; crystals: Record<string, number> };
  sinks: { gold: Record<string, number>; crystals: Record<string, number> };
  kills: Record<string, number>;
  leaks: Record<string, number>;
  damageByElement: Record<string, number>;
  shotsByCard: Record<string, number>;
}

function blankAttempt(source: string, stage: string, config: string, balanceVersion: string): AttemptSummary {
  return {
    source,
    stage,
    config,
    balanceVersion,
    outcome: 'incomplete',
    stars: 0,
    coreHp: 0,
    coreMax: 0,
    endedWave: 0,
    durationSec: 0,
    rerolls: 0,
    burns: 0,
    fusions: 0,
    wavesCleared: 0,
    perfectWaves: 0,
    faucets: { gold: {}, crystals: {} },
    sinks: { gold: {}, crystals: {} },
    kills: {},
    leaks: {},
    damageByElement: {},
    shotsByCard: {},
  };
}

function bump(rec: Record<string, number>, key: string, by: number): void {
  rec[key] = (rec[key] ?? 0) + by;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

interface ParsedEvent extends EventRow {
  props: Record<string, unknown>;
}

function parse(rows: EventRow[]): ParsedEvent[] {
  return rows.map((r) => ({
    ...r,
    props: r.props_json ? (JSON.parse(r.props_json) as Record<string, unknown>) : {},
  }));
}

/**
 * Segment user events into level attempts. Rows must already be ordered by
 * (session_id, seq). An attempt opens on level_start and closes on level_end
 * (or when the next level_start appears / the session ends → 'incomplete').
 */
export function attemptsFromUserEvents(rows: EventRow[]): AttemptSummary[] {
  const events = parse(rows);
  const attempts: AttemptSummary[] = [];
  let session = '';
  let cur: AttemptSummary | null = null;

  const flush = (): void => {
    if (cur) attempts.push(cur);
    cur = null;
  };

  for (const e of events) {
    if (e.session_id !== session) {
      flush(); // new session → close any dangling attempt
      session = e.session_id;
    }
    const bv = str(e.balance_version, 'unknown');
    const cfg = str(e.config, 'unknown');

    switch (e.type) {
      case 'level_start':
        flush();
        cur = blankAttempt('user', str(e.level, 'unknown'), cfg, bv);
        break;
      case 'level_end':
        if (!cur) cur = blankAttempt('user', str(e.level, 'unknown'), cfg, bv);
        cur.outcome = str(e.props.outcome, 'incomplete');
        cur.stars = num(e.props.stars);
        cur.coreHp = num(e.props.coreHp);
        cur.coreMax = num(e.props.coreMax);
        cur.endedWave = num((e.props.endedAt as { wave?: number } | undefined)?.wave, num(e.wave));
        cur.durationSec = num(e.props.durationSec);
        cur.rerolls = num(e.props.rerolls);
        cur.burns = num(e.props.burns);
        cur.fusions = num(e.props.fusions);
        flush();
        break;
      case 'wave_cleared':
        if (cur) {
          cur.wavesCleared += 1;
          if (e.props.perfect === true) cur.perfectWaves += 1;
        }
        break;
      case 'econ':
        if (cur) {
          const cur2 = cur;
          const currency = str(e.props.currency) === 'crystals' ? 'crystals' : 'gold';
          const reason = str(e.props.reason, 'other');
          const amount = num(e.props.amount);
          const bucket = e.props.kind === 'faucet' ? cur2.faucets : cur2.sinks;
          bump(bucket[currency], reason, amount);
        }
        break;
      case 'wave_combat_summary':
        if (cur) {
          mergeInto(cur.kills, e.props.kills);
          mergeInto(cur.leaks, e.props.leaks);
          mergeInto(cur.damageByElement, e.props.damageByElement);
          mergeInto(cur.shotsByCard, e.props.shotsByCard);
        }
        break;
      default:
        break;
    }
  }
  flush();
  return attempts;
}

function mergeInto(target: Record<string, number>, src: unknown): void {
  if (!src || typeof src !== 'object') return;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) bump(target, k, v);
  }
}

/**
 * Map a bot Run record into the same AttemptSummary shape. The bot (sim/bot)
 * emits a record already shaped like AttemptSummary, so this reads its fields
 * directly (with defaults) → bot + user share one aggregate.
 */
export function attemptFromRun(run: RunRow): AttemptSummary {
  let rec: Record<string, unknown> = {};
  try {
    rec = JSON.parse(run.record_json) as Record<string, unknown>;
  } catch {
    rec = {};
  }
  const a = blankAttempt(
    'bot',
    str(run.stage ?? rec.stage, 'unknown'),
    str(run.config ?? rec.config ?? run.balance_version, 'unknown'),
    str(run.balance_version ?? rec.balanceVersion, 'unknown'),
  );
  a.outcome = str(rec.outcome, 'incomplete');
  a.coreHp = num(rec.coreHp);
  a.coreMax = num(rec.coreMax);
  a.endedWave = num(rec.endedWave);
  a.durationSec = num(rec.durationSec);
  a.wavesCleared = num(rec.wavesCleared);
  a.perfectWaves = num(rec.perfectWaves);
  const f = rec.faucets as { gold?: unknown; crystals?: unknown } | undefined;
  if (f) {
    mergeInto(a.faucets.gold, f.gold);
    mergeInto(a.faucets.crystals, f.crystals);
  }
  const s = rec.sinks as { gold?: unknown; crystals?: unknown } | undefined;
  if (s) {
    mergeInto(a.sinks.gold, s.gold);
    mergeInto(a.sinks.crystals, s.crystals);
  }
  mergeInto(a.kills, rec.kills);
  mergeInto(a.leaks, rec.leaks);
  mergeInto(a.damageByElement, rec.damageByElement);
  mergeInto(a.shotsByCard, rec.shotsByCard);
  return a;
}
