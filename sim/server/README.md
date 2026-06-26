# sgtd-telemetry-server

Telemetry/analytics backend for Synergy Grid TD. Ingests **real-player events** (from the
browser game's `src/telemetry/`) and **bot runs** (`runs.jsonl`) into a single SQLite file,
and serves a unified aggregate for the dashboard. Full design:
[docs/backlog/analytics-and-backend.md](../../docs/backlog/analytics-and-backend.md).

This is a **separate package** (own `package.json`/`node_modules`). It is **not** imported by
the game, so the game's "only runtime dependency is pixi.js" rule is preserved.

## Run

```bash
cd sim/server
npm install        # fastify, @fastify/cors, better-sqlite3 (native)
npm start          # http://127.0.0.1:8787   (npm run dev for watch mode)
```

DB file: `sim/out/telemetry.db` (gitignored). Override with `TELEMETRY_DB=/path/to.db`.
Override port with `PORT=...`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/` | Live dashboard (HTML) — fetches `/aggregate`, renders the 4 telemetry layers, user vs bot |
| `GET`  | `/health` | `{ ok, schema }` liveness |
| `GET`  | `/stats`  | `{ events, runs }` row counts |
| `POST` | `/ingest/events` | body `{ events: EventEnvelope[] }` — schema-validated, idempotent by `(sessionId, seq)` |
| `POST` | `/ingest/runs` | body `{ runs: [{ record, stage?, seed?, policy?, balanceVersion? }] }` — bot Run records (§5.1) |
| `GET`  | `/aggregate?source=user\|bot\|all&level=lvl_3` | unified aggregate (§5.2), grouped by (stage, source) |
| `GET`  | `/sessions?source=&level=&limit=` | per-attempt drilldown |

Bot runs from a file: `tsx import.ts ../out/runs.jsonl` (ndjson of Run records → `runs` table).

Open the dashboard at <http://127.0.0.1:8787/> while the server runs.

## Smoke test

```bash
curl -s localhost:8787/health
curl -s -X POST localhost:8787/ingest/events -H 'content-type: application/json' \
  -d '{"events":[{"source":"user","clientId":"c1","sessionId":"s1","ts":1,"seq":0,"type":"session_start"}]}'
curl -s localhost:8787/stats
# re-POST the same body → duplicates:1, inserted:0 (idempotency)
```
