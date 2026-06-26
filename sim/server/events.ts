// Telemetry event contract (source of truth for the backend).
// Mirrors the envelope documented in docs/backlog/analytics-and-backend.md.
// The browser client (src/telemetry/) and the bot recorder (sim/core/recorder.ts)
// produce events of this exact shape; only `type` + `props` vary per event.

export const EVENT_SCHEMA_VERSION = 1;

export type EventSource = 'user' | 'bot';

export interface EventEnvelope {
  /** Envelope schema version (forward-compat). */
  schema?: number;
  /** Discriminates bot runs from real players in the unified aggregate. */
  source: EventSource;
  /** Anonymous, persisted client id (no PII). */
  clientId: string;
  /** One game load. */
  sessionId: string;
  /** git sha of the build (code version). */
  balanceVersion?: string;
  /** Active game config id (data version) — dashboard filter/compare dimension. */
  config?: string;
  /** Client epoch ms. */
  ts: number;
  /** Monotonic per-session sequence — orders events and dedupes flush retries. */
  seq: number;
  /** Level id (e.g. "lvl_3"); empty/absent for session-scoped events. */
  level?: string;
  /** Wave number when the event occurred; absent for non-combat events. */
  wave?: number;
  /** Event kind: session_start | level_start | level_end | wave_cleared | place |
   *  merge | fusion | reroll | burn | modernization | econ | enemy_leaked | dropoff … */
  type: string;
  /** Type-specific payload. */
  props?: Record<string, unknown>;
}

export interface IngestEventsBody {
  events: EventEnvelope[];
}

// Fastify/ajv JSON schema for POST /ingest/events. Validates untrusted browser
// input before it reaches the DB. Permissive on `props` (type-specific), strict on
// the envelope. Caps batch size to bound a single request.
export const ingestEventsBodyJsonSchema = {
  type: 'object',
  required: ['events'],
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        required: ['source', 'clientId', 'sessionId', 'ts', 'seq', 'type'],
        additionalProperties: true,
        properties: {
          schema: { type: 'integer' },
          source: { type: 'string', enum: ['user', 'bot'] },
          clientId: { type: 'string', maxLength: 64 },
          sessionId: { type: 'string', maxLength: 64 },
          balanceVersion: { type: 'string', maxLength: 128 },
          config: { type: 'string', maxLength: 128 },
          ts: { type: 'integer' },
          seq: { type: 'integer', minimum: 0 },
          level: { type: 'string', maxLength: 64 },
          wave: { type: 'integer' },
          type: { type: 'string', maxLength: 64 },
          props: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
} as const;
