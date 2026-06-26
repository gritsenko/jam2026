// Network transport: batches buffered events and POSTs them. Uses fetch(keepalive)
// for normal flushes and navigator.sendBeacon for page-hide (survives unload).
// Endpoint comes from VITE_TELEMETRY_URL; empty → telemetry is fully disabled.

import { append, snapshot, removeFront, size } from './buffer';
import type { EventEnvelope } from './events';

const ENDPOINT = ((import.meta.env.VITE_TELEMETRY_URL as string | undefined) ?? '').replace(
  /\/$/,
  '',
);
const INGEST_PATH = '/ingest/events';
const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 5000;

let timer: ReturnType<typeof setTimeout> | null = null;

export function enabled(): boolean {
  return ENDPOINT.length > 0;
}

function schedule(): void {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

export function enqueue(ev: EventEnvelope): void {
  append([ev]);
  if (size() >= BATCH_SIZE) void flush();
  else schedule();
}

/** Normal async flush (fetch + keepalive). Clears the buffer only on HTTP 2xx. */
export async function flush(): Promise<void> {
  if (!enabled()) return;
  const batch = snapshot();
  if (batch.length === 0) return;
  try {
    const res = await fetch(`${ENDPOINT}${INGEST_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    if (res.ok) removeFront(batch.length);
  } catch {
    /* keep buffered, retry on next flush */
  }
}

/** Unload-safe flush via sendBeacon. Optimistically clears (no ack available);
 *  server dedupes by (sessionId, seq) so a lost beacon just retries next load. */
export function flushBeacon(): void {
  if (!enabled()) return;
  const batch = snapshot();
  if (batch.length === 0) return;
  try {
    const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
    if (navigator.sendBeacon(`${ENDPOINT}${INGEST_PATH}`, blob)) removeFront(batch.length);
  } catch {
    /* ignore */
  }
}
