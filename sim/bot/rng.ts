// Re-export the shared PRNG (single source: src/game/rng.ts). Bot policies import
// from here; the implementation lives with the game so the sim and the bot agree.
export { makeRng } from '../../src/game/rng';
export type { Rng } from '../../src/game/rng';
