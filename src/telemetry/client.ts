// Anonymous identity + opt-out for telemetry. Mirrors the graceful-localStorage
// pattern of src/game/progress.ts: if storage is unavailable (private mode), fall
// back to in-memory so the game never breaks.

const CLIENT_KEY = 'sgtd.client.v1';
const OPTOUT_KEY = 'sgtd.telemetry.optout.v1';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore — storage unavailable */
  }
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for non-secure contexts where crypto.randomUUID is missing.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

let cachedClientId: string | null = null;

/** Stable anonymous id, persisted across loads. */
export function getClientId(): string {
  if (cachedClientId) return cachedClientId;
  let id = safeGet(CLIENT_KEY);
  if (!id) {
    id = uuid();
    safeSet(CLIENT_KEY, id);
  }
  cachedClientId = id;
  return id;
}

/** One id per game load. */
export const sessionId = uuid();

let seq = 0;
/** Monotonic per-session sequence number. */
export function nextSeq(): number {
  return seq++;
}

export function isOptedOut(): boolean {
  return safeGet(OPTOUT_KEY) === '1';
}

export function setOptedOut(optedOut: boolean): void {
  safeSet(OPTOUT_KEY, optedOut ? '1' : '0');
}
