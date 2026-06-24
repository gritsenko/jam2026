import { CARD_LIST } from './cards';
import type { HandCard } from './types';

/**
 * Tunables for the battle interaction loop (placing / burning / spawning).
 * Kept out of the scene so balance lives with the rest of the game data.
 */

/**
 * Default number of hand positions. Three to start; later this can grow via
 * upgrades / level rewards (the hand layout already scales to any count).
 */
export const HAND_SIZE = 3;

/** Seconds an emptied hand position spends recharging before it spawns a new card. */
export const HAND_RESPAWN_SEC = 4;

/** Reactor burn duration: capacity stays boosted this long (v2 §3.Г: +2 for 15s). */
export const OVERDRIVE_SEC = 15;

/**
 * Hand Reroll cost in Crystals (v2 §8.Б): the first reroll in a wave costs
 * REROLL_BASE_COST, each further reroll in the same wave adds REROLL_STEP
 * (10 → 15 → 20…). The counter resets at the start of every wave.
 */
export const REROLL_BASE_COST = 10;
export const REROLL_STEP = 5;

/** Card ids eligible to spawn into the hand (hybrids are crafted, never dealt). */
export const DRAW_POOL: string[] = CARD_LIST.filter((c) => !c.hybrid).map((c) => c.id);

/** Roll a fresh hand card (grade 1) from the draw pool. `seq` makes the instance id unique. */
export function rollHandCard(seq: number): HandCard {
  const cardId = DRAW_POOL[Math.floor(Math.random() * DRAW_POOL.length)] ?? DRAW_POOL[0]!;
  return { instanceId: `spawn-${seq}`, cardId, grade: 1 };
}
