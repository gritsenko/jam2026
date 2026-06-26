// mulberry32 — tiny deterministic PRNG (one 32-bit state). Same seed → same
// sequence, so seeded simulation/policies are reproducible and FPS-independent.
// Single source: sim/bot/rng.ts re-exports this. `next()` matches the original
// bot PRNG byte-for-byte (so existing randomBoard layouts are unchanged); `fork`
// is added for independent per-entity sub-streams (e.g. per-enemy interrupt rolls).

export interface Rng {
  /** Next value in [0, 1). */
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  /** A deterministic, independent sub-stream keyed by `salt` (e.g. an enemy id). */
  fork(salt: number): Rng;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    // Mix the original seed with the salt (independent of how far `a` advanced),
    // so fork(salt) is stable for a given (seed, salt) regardless of call order.
    fork: (salt: number): Rng =>
      makeRng((Math.imul((seed >>> 0) ^ (salt + 0x9e3779b9), 0x85ebca6b) ^ 0xc2b2ae35) >>> 0),
  };
}
