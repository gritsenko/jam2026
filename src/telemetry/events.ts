// Telemetry event contract — browser-side mirror of the backend envelope
// (sim/server/events.ts). Source of truth for the schema is
// docs/backlog/analytics-and-backend.md. Keep the two envelopes in sync.

export const EVENT_SCHEMA_VERSION = 1;

export type EventSource = 'user' | 'bot';

export interface EventEnvelope {
  schema: number;
  /** Discriminates bot runs from real players in the unified aggregate. */
  source: EventSource;
  /** Anonymous, persisted client id (no PII). */
  clientId: string;
  /** One game load. */
  sessionId: string;
  /** git sha of the build (code version). */
  balanceVersion: string;
  /** Active game config id (data version) — dashboard filter/compare dimension. */
  config: string;
  /** Client epoch ms. */
  ts: number;
  /** Monotonic per-session sequence — orders events and dedupes flush retries. */
  seq: number;
  /** Level id; omitted for session-scoped events. */
  level?: string;
  /** Wave number; omitted for non-combat events. */
  wave?: number;
  /** Event kind (session_start | level_start | level_end | …). */
  type: string;
  /** Type-specific payload. */
  props?: Record<string, unknown>;
}
