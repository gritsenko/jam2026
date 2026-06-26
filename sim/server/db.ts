// SQLite storage (better-sqlite3, synchronous). One file DB at sim/out/telemetry.db.
// PR1 scope: raw `events` table (source of truth, idempotent ingest) + forward-compat
// `runs` table for bot Run records (filled later by sim/server/import.ts).
// Denormalized sessions/attempts + aggregate come in PR3.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventEnvelope } from './events.ts';

const DB_PATH =
  process.env.TELEMETRY_DB ??
  fileURLToPath(new URL('../out/telemetry.db', import.meta.url));

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT    NOT NULL,
    client_id       TEXT    NOT NULL,
    source          TEXT    NOT NULL,
    config          TEXT,
    balance_version TEXT,
    type            TEXT    NOT NULL,
    level           TEXT,
    wave            INTEGER,
    sell_enabled    INTEGER,
    burn_field_enabled INTEGER,
    ts              INTEGER NOT NULL,
    seq             INTEGER NOT NULL,
    props_json      TEXT,
    UNIQUE(session_id, seq)
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_type_level ON events(type, level);
  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

  CREATE TABLE IF NOT EXISTS runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT    NOT NULL DEFAULT 'bot',
    config          TEXT,
    seed            INTEGER,
    policy          TEXT,
    stage           TEXT,
    balance_version TEXT,
    record_json     TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runs_source_stage ON runs(source, stage);
`);

// Migrate older DBs created before the `config` column existed (idempotent) — must
// run BEFORE the config indexes, since an old table won't have the column yet.
for (const t of ['events', 'runs']) {
  try {
    db.exec(`ALTER TABLE ${t} ADD COLUMN config TEXT`);
  } catch {
    /* column already exists */
  }
}
try {
  db.exec(`ALTER TABLE events ADD COLUMN sell_enabled INTEGER`);
} catch {
  /* column already exists */
}
try {
  db.exec(`ALTER TABLE events ADD COLUMN burn_field_enabled INTEGER`);
} catch {
  /* column already exists */
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_events_config ON events(config);
  CREATE INDEX IF NOT EXISTS idx_runs_config ON runs(config);
`);

// INSERT OR IGNORE makes ingest idempotent: a re-flushed batch (same session_id+seq)
// is silently dropped instead of duplicated. result.changes is 1 on insert, 0 on dup.
const insertEventStmt = db.prepare(`
  INSERT OR IGNORE INTO events
    (session_id, client_id, source, config, balance_version, type, level, wave, sell_enabled, burn_field_enabled, ts, seq, props_json)
  VALUES
    (@session_id, @client_id, @source, @config, @balance_version, @type, @level, @wave, @sell_enabled, @burn_field_enabled, @ts, @seq, @props_json)
`);

export interface IngestResult {
  accepted: number;
  inserted: number;
  duplicates: number;
}

const insertManyTxn = db.transaction((events: EventEnvelope[]): IngestResult => {
  let inserted = 0;
  for (const e of events) {
    const info = insertEventStmt.run({
      session_id: e.sessionId,
      client_id: e.clientId,
      source: e.source,
      config: e.config ?? null,
      balance_version: e.balanceVersion ?? null,
      type: e.type,
      level: e.level ?? null,
      wave: e.wave ?? null,
      sell_enabled: e.sellEnabled === true ? 1 : e.sellEnabled === false ? 0 : null,
      burn_field_enabled:
        e.burnFieldEnabled === true ? 1 : e.burnFieldEnabled === false ? 0 : null,
      ts: e.ts,
      seq: e.seq,
      props_json: e.props ? JSON.stringify(e.props) : null,
    });
    inserted += info.changes;
  }
  return { accepted: events.length, inserted, duplicates: events.length - inserted };
});

export function insertEvents(events: EventEnvelope[]): IngestResult {
  return insertManyTxn(events);
}

export function countEvents(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  return row.n;
}

export function countRuns(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number };
  return row.n;
}

export interface EventRow {
  session_id: string;
  client_id: string;
  source: string;
  config: string | null;
  balance_version: string | null;
  type: string;
  level: string | null;
  wave: number | null;
  ts: number;
  seq: number;
  props_json: string | null;
}

/** All events ordered for per-session segmentation (session, then seq). */
export function allEvents(): EventRow[] {
  return db
    .prepare('SELECT * FROM events ORDER BY session_id, seq')
    .all() as EventRow[];
}

export interface RunRow {
  source: string;
  config: string | null;
  seed: number | null;
  policy: string | null;
  stage: string | null;
  balance_version: string | null;
  record_json: string;
}

export function allRuns(): RunRow[] {
  return db.prepare('SELECT * FROM runs').all() as RunRow[];
}

export interface InsertRun {
  config?: string;
  seed?: number;
  policy?: string;
  stage?: string;
  balanceVersion?: string;
  record: unknown;
}

const insertRunStmt = db.prepare(`
  INSERT INTO runs (source, config, seed, policy, stage, balance_version, record_json)
  VALUES ('bot', @config, @seed, @policy, @stage, @balance_version, @record_json)
`);

const insertRunsTxn = db.transaction((runs: InsertRun[]): number => {
  for (const r of runs) {
    insertRunStmt.run({
      config: r.config ?? null,
      seed: r.seed ?? null,
      policy: r.policy ?? null,
      stage: r.stage ?? null,
      balance_version: r.balanceVersion ?? null,
      record_json: JSON.stringify(r.record),
    });
  }
  return runs.length;
});

export function insertRuns(runs: InsertRun[]): number {
  return insertRunsTxn(runs);
}
