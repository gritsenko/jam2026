import { CARD_LIST, getCard } from './cards';
import type { HandCard } from './types';
import { activeGameConfig } from '../data/load';

/**
 * Tunables for the battle interaction loop (placing / burning / spawning). Data
 * lives in JSON (src/data/game_configs/<config>/battleRules.json) via the active ConfigSet
 * (docs/backlog/config-as-data.md); same named exports, only the source changed.
 * Functions and CARD_LIST-derived pools below stay computed in TS.
 */
const B = activeGameConfig.battleRules;

/** Fallbacks when a config JSON predates newer battleRules keys. */
const BR_DEFAULTS = {
  OVERDRIVE_BASE_COST: 20,
  OVERDRIVE_STEP: 20,
  SELL_REFUND_RATE: 0.5,
  FIELD_BURN_COST_MULT: 2,
} as const;

function brNum(key: keyof typeof BR_DEFAULTS): number {
  const v = B[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : BR_DEFAULTS[key];
}

/** Default number of hand positions (the hand layout scales to any count). */
export const HAND_SIZE = B.HAND_SIZE;
/** Seconds an emptied hand position spends recharging before it spawns a new card. */
export const HAND_RESPAWN_SEC = B.HAND_RESPAWN_SEC;
/** Reactor burn duration: capacity stays boosted this long (v2 §3.Г: +2 for 15s). */
export const OVERDRIVE_SEC = B.OVERDRIVE_SEC;

/**
 * Reactor burn (Overdrive) gold cost (v3 §3.Г): first burn costs OVERDRIVE_BASE_COST,
 * each further burn adds OVERDRIVE_STEP (20 → 40 → 60…). Per-battle cumulative.
 */
export const OVERDRIVE_BASE_COST = brNum('OVERDRIVE_BASE_COST');
export const OVERDRIVE_STEP = brNum('OVERDRIVE_STEP');

/** Gold cost of the next burn given how many cards were already burned this battle. */
export function overdriveCost(burnsDone: number): number {
  const burns = Number.isFinite(burnsDone) ? Math.max(0, Math.floor(burnsDone)) : 0;
  return OVERDRIVE_BASE_COST + burns * OVERDRIVE_STEP;
}

/**
 * Hand Reroll cost in Crystals (v2 §8.Б): the first reroll in a wave costs
 * REROLL_BASE_COST, each further reroll in the same wave adds REROLL_STEP
 * (10 → 15 → 20…). The counter resets at the start of every wave.
 */
export const REROLL_BASE_COST = B.REROLL_BASE_COST;
export const REROLL_STEP = B.REROLL_STEP;

/**
 * Modernization cards (global platform upgrades, docs/done/modernization-cards.md).
 * These are the *behavior* tunables the battle reads; the gold / crystal prices
 * live on the {@link import('./cards').CardDef}s (single source for a card's cost).
 */
/** Isolation Circuit: permanent (battle-long) bump to the network's *base* capacity. */
export const MOD_ISOLATION_CAPACITY = B.MOD_ISOLATION_CAPACITY;
/** Elemental Focus: damage multiplier for all towers of the chosen element, until the wave ends. */
export const MOD_FOCUS_DMG_MULT = B.MOD_FOCUS_DMG_MULT;
/** Emergency Overdrive window in seconds — shorter than a Reactor card-burn. */
export const MOD_EMERGENCY_OVERDRIVE_SEC = B.MOD_EMERGENCY_OVERDRIVE_SEC;

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
export const MOD_DRAW_CHANCE = B.MOD_DRAW_CHANCE;

/** Fraction of invested gold returned when selling a placed tower (test: 0.5 max). */
export const SELL_REFUND_RATE = brNum('SELL_REFUND_RATE');

/** Gold spent to reach a tower's current grade (tracked on instance, or derived). */
export function towerGoldInvested(cardId: string, grade: number, tracked?: number): number {
  if (tracked !== undefined && Number.isFinite(tracked)) return Math.max(0, tracked);
  const cost = getCard(cardId).costGold;
  const base = Number.isFinite(cost) ? cost : 0;
  const g = Number.isFinite(grade) ? Math.max(1, Math.floor(grade)) : 1;
  return base * 2 ** (g - 1);
}

/** Refund from selling a tower at the configured rate. */
export function sellRefundAmount(invested: number): number {
  const inv = Number.isFinite(invested) ? Math.max(0, invested) : 0;
  return Math.floor(inv * SELL_REFUND_RATE);
}

/** Gold mult when burning a placed tower (Reactor) vs a hand card. */
export const FIELD_BURN_COST_MULT = brNum('FIELD_BURN_COST_MULT');

/** Gold cost to burn a tower on the field (2× the next hand-card burn price). */
export function fieldBurnCost(burnsDone: number): number {
  return overdriveCost(burnsDone) * FIELD_BURN_COST_MULT;
}

/** Safe gold integer for HUD cost labels (never NaN). */
export function formatGoldAmount(gold: number): string {
  if (!Number.isFinite(gold)) return '0';
  return String(Math.max(0, Math.round(gold)));
}

/**
 * Roll a fresh hand card (grade 1) from the draw pool. `seq` makes the instance
 * id unique. `pool` restricts the draw to the campaign's unlocked towers
 * (progression §7); it falls back to the full {@link DRAW_POOL} if empty/omitted.
 */
export function rollHandCard(
  seq: number,
  pool: readonly string[] = DRAW_POOL,
  rng: () => number = Math.random,
): HandCard {
  const from = pool.length > 0 ? pool : DRAW_POOL;
  const cardId = from[Math.floor(rng() * from.length)] ?? from[0]!;
  return { instanceId: `spawn-${seq}`, cardId, grade: 1 };
}
