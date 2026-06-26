// HTTP routes: health, event ingest, bot-run ingest, aggregate + sessions query,
// and a self-contained live dashboard at '/'. See analytics-and-backend.md.

import type { FastifyInstance } from 'fastify';
import { ingestEventsBodyJsonSchema, EVENT_SCHEMA_VERSION } from './events.ts';
import type { IngestEventsBody } from './events.ts';
import {
  insertEvents,
  insertRuns,
  countEvents,
  countRuns,
  allEvents,
  allRuns,
} from './db.ts';
import { buildAggregate } from './aggregate.ts';
import { attemptsFromUserEvents, attemptFromRun } from './normalize.ts';
import { DASHBOARD_HTML } from './dashboard.ts';

interface IngestRunsBody {
  runs: Array<{
    config?: string;
    seed?: number;
    policy?: string;
    stage?: string;
    balanceVersion?: string;
    record?: unknown;
  }>;
}

export function registerRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({ ok: true, schema: EVENT_SCHEMA_VERSION }));

  app.get('/stats', async () => ({ events: countEvents(), runs: countRuns() }));

  app.post<{ Body: IngestEventsBody }>(
    '/ingest/events',
    { schema: { body: ingestEventsBodyJsonSchema } },
    async (req) => {
      const result = insertEvents(req.body.events);
      return { ok: true, ...result };
    },
  );

  // Bot runs (Run record §5.1). Each item carries the record + optional index cols.
  app.post<{ Body: IngestRunsBody }>('/ingest/runs', async (req) => {
    const runs = Array.isArray(req.body?.runs) ? req.body.runs : [];
    const inserted = insertRuns(
      runs.map((r) => ({
        config: r.config ?? (r.record as { config?: string } | undefined)?.config,
        seed: r.seed,
        policy: r.policy,
        stage: r.stage ?? (r.record as { stage?: string } | undefined)?.stage,
        balanceVersion:
          r.balanceVersion ?? (r.record as { balanceVersion?: string } | undefined)?.balanceVersion,
        record: r.record ?? r,
      })),
    );
    return { ok: true, inserted };
  });

  app.get<{ Querystring: { config?: string; source?: string; level?: string } }>('/aggregate', async (req) => {
    return buildAggregate({ config: req.query.config, source: req.query.source, level: req.query.level });
  });

  // Per-attempt drilldown for the dashboard.
  app.get<{ Querystring: { config?: string; source?: string; level?: string; limit?: string } }>(
    '/sessions',
    async (req) => {
      const user = attemptsFromUserEvents(allEvents().filter((e) => e.source === 'user'));
      const bot = allRuns().map(attemptFromRun);
      let list = [...user, ...bot];
      const { config, source, level } = req.query;
      if (config && config !== 'all') list = list.filter((a) => a.config === config);
      if (source && source !== 'all') list = list.filter((a) => a.source === source);
      if (level) list = list.filter((a) => a.stage === level);
      const limit = Math.min(Number(req.query.limit ?? 200) || 200, 1000);
      return { attempts: list.slice(-limit) };
    },
  );

  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(DASHBOARD_HTML);
  });
}
