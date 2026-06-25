import type { PathId, WaveDef } from './types';
import { WAVES } from './waves';

/**
 * Per-level combat config — the wave script and difficulty tier for each campaign
 * node. Replaces the single shared {@link WAVES} track: every level now has its
 * own enemy curve and a `hpScale`/`bountyScale` tier multiplier (the spawn applies
 * them per-instance — see {@link import('../game/BattleSim').BattleSim}).
 *
 * Design: docs/done/levels-post-tutorial.md. The three post-tutorial scripts
 * (Ember Hollow / Glass Dunes / Coolant Ridge) are ported verbatim from that doc;
 * the tutorial levels (1–3) ramp gently within the *roster available at that level*
 * (no Magma until lvl_4, no Disruptor until lvl_5, no tank pressure until lvl_6),
 * and lvl_7 is the climactic finale. `bountyScale ≈ hpScale` keeps the gold race
 * (enemy-balance §4).
 */
export interface LevelCombat {
  /** This level's wave script (played in order; `maxWave` = waves.length). */
  readonly waves: WaveDef[];
  /** Multiplier on every spawned enemy's maxHp (difficulty tier). */
  readonly hpScale: number;
  /** Multiplier on every spawned enemy's bounty (kept ≈ hpScale so income tracks). */
  readonly bountyScale: number;
  /**
   * Which edge enemies march in from (combatRules.ts `ENEMY_PATHS`). Omitted =
   * `bottom` (the all-around ring). The tutorial levels stay on `bottom` so the
   * player learns positioning on the forgiving ring; later levels rotate the
   * direction so a static layout no longer covers everything.
   */
  readonly pathId?: PathId;
}

/**
 * Levels keyed by {@link import('./levels').LEVELS} id. Any level missing here
 * falls back to the shared {@link WAVES} at tier ×1 (see {@link combatForLevel}).
 */
export const LEVEL_COMBAT: Record<string, LevelCombat> = {
  // --- Tutorial cluster (1–3): start roster is thin, so keep enemies to fodder
  //     and runners. No Magma/Disruptor/tank pressure — those are each a later
  //     level's lesson. Tier ×1; the challenge is learning placement, not stats.

  // lvl_1 Sunbaked Gulch — start with only Plasma + Frost (no merge). Pure intro:
  // a trickle of wisps, then runners. Teaches placement + range coverage.
  lvl_1: {
    hpScale: 1.0,
    bountyScale: 1.0,
    waves: [
      { groups: [{ enemyId: 'frost_wisp', count: 5, gap: 1.2 }] },
      { groups: [
        { enemyId: 'frost_wisp', count: 6, gap: 0.9 },
        { enemyId: 'volt_crawler', count: 3, gap: 1.0 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 6, gap: 0.8 },
        { enemyId: 'frost_wisp', count: 5, gap: 0.6 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.5 },
      ] },
    ],
  },

  // lvl_2 Rusted Spillway — Storm Coil unlocked (chain shines on swarms). Denser
  // wisp/volt streams reward the chain; still no heavy units. Clearing grants
  // merge + reroll + crystals.
  lvl_2: {
    hpScale: 1.0,
    bountyScale: 1.0,
    waves: [
      { groups: [{ enemyId: 'volt_crawler', count: 6, gap: 0.9 }] },
      { groups: [
        { enemyId: 'frost_wisp', count: 8, gap: 0.5 },
        { enemyId: 'volt_crawler', count: 4, gap: 0.8 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
        { enemyId: 'frost_wisp', count: 6, gap: 0.5 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 6, gap: 0.6 },
        { enemyId: 'frost_wisp', count: 10, gap: 0.4 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.4 },
      ] },
    ],
  },

  // lvl_3 Static Mesa — merge is available now; dense electric swarms make the
  // Water+Electricity resonance (Frost wet → Storm ×2) the obvious answer.
  // Clearing grants the resonance mechanic. Tiny HP bump to ramp.
  lvl_3: {
    hpScale: 1.05,
    bountyScale: 1.05,
    waves: [
      { groups: [{ enemyId: 'volt_crawler', count: 7, gap: 0.8 }] },
      { groups: [
        { enemyId: 'frost_wisp', count: 10, gap: 0.45 },
        { enemyId: 'volt_crawler', count: 4, gap: 0.8 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 9, gap: 0.6 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.45 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 10, gap: 0.55 },
        { enemyId: 'frost_wisp', count: 10, gap: 0.4 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 12, gap: 0.5 },
        { enemyId: 'frost_wisp', count: 12, gap: 0.35 },
      ] },
    ],
  },

  // --- Post-tutorial cluster (4–6): ported verbatim from
  //     docs/done/levels-post-tutorial.md. Each level makes ONE threat dominant.

  // lvl_4 Ember Hollow (doc Level A) — bruiser pressure (first Magma). Teaches
  // sustained single-target DPS + the value of AoE/pierce. ×1.15. First directional
  // twist: the brutes pour in from the TOP, so a bottom-anchored layout can't reach.
  lvl_4: {
    hpScale: 1.15,
    bountyScale: 1.15,
    pathId: 'top',
    waves: [
      { groups: [{ enemyId: 'volt_crawler', count: 6, gap: 0.9 }] },
      { groups: [{ enemyId: 'frost_wisp', count: 10, gap: 0.5 }] },
      { groups: [
        { enemyId: 'magma_brute', count: 5, gap: 1.3 },
        { enemyId: 'frost_wisp', count: 6, gap: 0.5 },
      ] },
      { groups: [
        { enemyId: 'magma_brute', count: 7, gap: 1.1 },
        { enemyId: 'volt_crawler', count: 6, gap: 0.7 },
      ] },
      { groups: [
        { enemyId: 'magma_brute', count: 6, gap: 1.0 },
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.4 },
      ] },
      { groups: [
        { enemyId: 'magma_brute', count: 8, gap: 0.9 },
        { enemyId: 'iron_husk', count: 2, gap: 4.0 },
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
      ] },
    ],
  },

  // lvl_5 Glass Dunes (doc Level B) — sabotage pressure (Disruptor packs 2→5).
  // Challenge is tower uptime, not HP, so the tier is deliberately low (×1.10).
  // Saboteurs strike from the LEFT — a fresh edge to re-anchor on.
  lvl_5: {
    hpScale: 1.1,
    bountyScale: 1.1,
    pathId: 'left',
    waves: [
      { groups: [{ enemyId: 'volt_crawler', count: 7, gap: 0.8 }] },
      { groups: [
        { enemyId: 'signal_disruptor', count: 2, gap: 2.5 },
        { enemyId: 'volt_crawler', count: 6, gap: 0.7 },
      ] },
      { groups: [
        { enemyId: 'frost_wisp', count: 10, gap: 0.4 },
        { enemyId: 'signal_disruptor', count: 2, gap: 2.0 },
      ] },
      { groups: [
        { enemyId: 'signal_disruptor', count: 3, gap: 1.8 },
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
      ] },
      { groups: [
        { enemyId: 'signal_disruptor', count: 4, gap: 1.5 },
        { enemyId: 'magma_brute', count: 4, gap: 1.1 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.4 },
      ] },
      { groups: [
        { enemyId: 'signal_disruptor', count: 5, gap: 1.2 },
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
        { enemyId: 'magma_brute', count: 3, gap: 1.0 },
      ] },
    ],
  },

  // lvl_6 Coolant Ridge (doc Level C) — tanks + mix + a boss wave of four Husks.
  // Tests total DPS, Core defense, the whole roster + resonance. ×1.30, 7 waves.
  // Tanks grind in from the RIGHT.
  lvl_6: {
    hpScale: 1.3,
    bountyScale: 1.3,
    pathId: 'right',
    waves: [
      { groups: [{ enemyId: 'magma_brute', count: 6, gap: 1.0 }] },
      { groups: [
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.4 },
      ] },
      { groups: [
        // Resonance Mote (support) debuts early: it hastes the tank pair → focus it.
        { enemyId: 'resonance_mote', count: 1, gap: 2.0 },
        { enemyId: 'iron_husk', count: 2, gap: 3.5 },
        { enemyId: 'volt_crawler', count: 8, gap: 0.6 },
      ] },
      { groups: [
        { enemyId: 'signal_disruptor', count: 3, gap: 1.8 },
        { enemyId: 'magma_brute', count: 6, gap: 0.9 },
        { enemyId: 'iron_husk', count: 1, gap: 0 },
      ] },
      { groups: [
        // Coolant Mender (support) mid-level: it repairs the husks → burst them down.
        { enemyId: 'coolant_mender', count: 1, gap: 2.0 },
        { enemyId: 'iron_husk', count: 3, gap: 3.0 },
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
        { enemyId: 'signal_disruptor', count: 3, gap: 1.6 },
      ] },
      { groups: [
        { enemyId: 'magma_brute', count: 8, gap: 0.8 },
        { enemyId: 'signal_disruptor', count: 4, gap: 1.5 },
        { enemyId: 'frost_wisp', count: 12, gap: 0.3 },
      ] },
      { groups: [
        // Boss wave: two Aegis Beacons (support) shield the husks → kill the beacons first.
        { enemyId: 'aegis_beacon', count: 2, gap: 2.5 },
        { enemyId: 'iron_husk', count: 4, gap: 2.5 },
        { enemyId: 'magma_brute', count: 8, gap: 0.8 },
        { enemyId: 'signal_disruptor', count: 4, gap: 1.5 },
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
      ] },
    ],
  },

  // lvl_7 Overload Spire — finale. Full roster + fusion in play; everything at
  // once and a bigger boss wave (five Husks) than Coolant. Highest tier. Back to
  // the all-around ring (`bottom`): hardest to hold because pressure comes from
  // every edge, so the player can't concentrate on one hot corner.
  lvl_7: {
    hpScale: 1.45,
    bountyScale: 1.45,
    pathId: 'bottom',
    waves: [
      { groups: [
        { enemyId: 'magma_brute', count: 6, gap: 1.0 },
        { enemyId: 'volt_crawler', count: 6, gap: 0.6 },
      ] },
      { groups: [
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
        { enemyId: 'frost_wisp', count: 10, gap: 0.35 },
      ] },
      { groups: [
        { enemyId: 'iron_husk', count: 2, gap: 3.5 },
        { enemyId: 'magma_brute', count: 5, gap: 1.0 },
        { enemyId: 'volt_crawler', count: 6, gap: 0.6 },
      ] },
      { groups: [
        { enemyId: 'signal_disruptor', count: 4, gap: 1.5 },
        { enemyId: 'magma_brute', count: 6, gap: 0.9 },
        { enemyId: 'frost_wisp', count: 8, gap: 0.4 },
      ] },
      { groups: [
        { enemyId: 'iron_husk', count: 3, gap: 2.8 },
        { enemyId: 'signal_disruptor', count: 3, gap: 1.6 },
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
      ] },
      { groups: [
        { enemyId: 'magma_brute', count: 8, gap: 0.8 },
        { enemyId: 'frost_wisp', count: 12, gap: 0.3 },
      ] },
      { groups: [
        { enemyId: 'iron_husk', count: 5, gap: 2.2 },
        { enemyId: 'signal_disruptor', count: 5, gap: 1.3 },
        { enemyId: 'magma_brute', count: 8, gap: 0.8 },
        { enemyId: 'volt_crawler', count: 10, gap: 0.5 },
      ] },
    ],
  },
};

/**
 * Combat config for a level, falling back to the shared {@link WAVES} at tier ×1
 * for any id not in {@link LEVEL_COMBAT} (mirrors progression.ts's per-level
 * resolvers; the `??` keeps it total under noUncheckedIndexedAccess).
 */
export function combatForLevel(levelId: string): LevelCombat {
  return LEVEL_COMBAT[levelId] ?? { waves: WAVES, hpScale: 1, bountyScale: 1 };
}
