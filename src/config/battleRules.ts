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
 * Reactor burn (Overdrive) gold cost (v3 §3.Г). Burning a card is no longer
 * free: the first burn of a battle costs {@link OVERDRIVE_BASE_COST} gold and
 * each further burn adds {@link OVERDRIVE_STEP} (20 → 40 → 60 → 80 …). The
 * counter is **per-battle cumulative** — it keeps climbing all battle and does
 * NOT reset per wave (unlike the hand Reroll, §8.Б) — so the panic capacity
 * boost is a deliberately escalating gold sink rather than a free spam button.
 */
export const OVERDRIVE_BASE_COST = 20;
export const OVERDRIVE_STEP = 20;

/** Gold cost of the next burn given how many cards were already burned this battle. */
export function overdriveCost(burnsDone: number): number {
  return OVERDRIVE_BASE_COST + burnsDone * OVERDRIVE_STEP;
}

/**
 * Hand Reroll cost in Crystals (v2 §8.Б): the first reroll in a wave costs
 * REROLL_BASE_COST, each further reroll in the same wave adds REROLL_STEP
 * (10 → 15 → 20…). The counter resets at the start of every wave.
 */
export const REROLL_BASE_COST = 10;
export const REROLL_STEP = 5;

/**
 * Modernization cards (global platform upgrades, docs/done/modernization-cards.md).
 * These are the *behavior* tunables the battle reads; the gold / crystal prices
 * live on the {@link import('./cards').CardDef}s (single source for a card's cost).
 */
/** Isolation Circuit: permanent (battle-long) bump to the network's *base* capacity. */
export const MOD_ISOLATION_CAPACITY = 2;
/** Elemental Focus: damage multiplier for all towers of the chosen element, until the wave ends. */
export const MOD_FOCUS_DMG_MULT = 1.25;
/**
 * Emergency Overdrive window in seconds — shorter than a Reactor card-burn
 * ({@link OVERDRIVE_SEC} = 15s): the trade is "no card spent, but crystals + less time".
 */
export const MOD_EMERGENCY_OVERDRIVE_SEC = 10;

/**
 * Card ids eligible to spawn into the hand (hybrids are crafted, never dealt;
 * modernization cards are gated behind the `mod_cards` mechanic — see {@link MOD_CARD_POOL}).
 */
export const DRAW_POOL: string[] = CARD_LIST.filter(
  (c) => !c.hybrid && c.category !== 'modernization',
).map((c) => c.id);

/** Modernization card ids, drawn only when `mod_cards` is unlocked (§3, kept rare). */
export const MOD_CARD_POOL: string[] = CARD_LIST.filter((c) => c.category === 'modernization').map(
  (c) => c.id,
);

/**
 * Chance a freshly dealt hand card is a modernization card (when `mod_cards` is
 * unlocked, §3). Kept low so modernization stays a deliberate option, not the
 * background of the hand. Under tuning at playtest.
 */
export const MOD_DRAW_CHANCE = 0.16;

/**
 * Roll a fresh hand card (grade 1) from the draw pool. `seq` makes the instance
 * id unique. `pool` restricts the draw to the campaign's unlocked towers
 * (progression §7); it falls back to the full {@link DRAW_POOL} if empty/omitted.
 */
export function rollHandCard(seq: number, pool: readonly string[] = DRAW_POOL): HandCard {
  const from = pool.length > 0 ? pool : DRAW_POOL;
  const cardId = from[Math.floor(Math.random() * from.length)] ?? from[0]!;
  return { instanceId: `spawn-${seq}`, cardId, grade: 1 };
}
