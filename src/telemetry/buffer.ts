// Offline-resilient event buffer. In-memory queue is primary (survives broken
// storage); localStorage is a best-effort mirror so undelivered events survive a
// reload. Events are cleared from the front only after a successful flush.

import type { EventEnvelope } from './events';

const BUF_KEY = 'sgtd.telemetry.buf.v1';
const MAX_BUFFERED = 1000; // cap memory/storage; drop oldest beyond this

function hydrate(): EventEnvelope[] {
  try {
    const raw = localStorage.getItem(BUF_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as EventEnvelope[]) : [];
  } catch {
    return [];
  }
}

let queue: EventEnvelope[] = hydrate();

function persist(): void {
  try {
    localStorage.setItem(BUF_KEY, JSON.stringify(queue));
  } catch {
    /* ignore — storage unavailable, in-memory queue still works */
  }
}

export function append(events: EventEnvelope[]): void {
  queue.push(...events);
  if (queue.length > MAX_BUFFERED) queue = queue.slice(queue.length - MAX_BUFFERED);
  persist();
}

export function snapshot(): EventEnvelope[] {
  return queue.slice();
}

/** Drop the first `n` events (the slice that was just delivered). */
export function removeFront(n: number): void {
  if (n <= 0) return;
  queue = queue.slice(n);
  persist();
}

export function size(): number {
  return queue.length;
}
