import type { EnemyDef } from './types';

/**
 * The four elemental creatures that march the ring road. Combat stats are tuned
 * for a short prototype lap (~10–25s) so towers get many shots per enemy.
 *
 * `speed` is in laps-per-second (1/speed = seconds to complete the ring), which
 * keeps movement resolution-independent — the view multiplies the path point by
 * the on-screen arena size, the simulation never sees pixels.
 */
export const ENEMIES: EnemyDef[] = [
  // Fast, fragile skirmisher.
  { id: 'frost_wisp', name: 'Frost Wisp', element: 'Water', iconKey: 'enemy_frost_wisp', maxHp: 35, speed: 0.085, bounty: 5, coreDamage: 1 },
  // Mid runner.
  { id: 'volt_crawler', name: 'Volt Crawler', element: 'Electricity', iconKey: 'enemy_volt_crawler', maxHp: 55, speed: 0.07, bounty: 6, coreDamage: 1 },
  // Slow bruiser.
  { id: 'magma_brute', name: 'Magma Brute', element: 'Fire', iconKey: 'enemy_magma_brute', maxHp: 90, speed: 0.05, bounty: 9, coreDamage: 2 },
  // Very slow tank — punishes thin defenses.
  { id: 'iron_husk', name: 'Iron Husk', element: 'Physical', iconKey: 'enemy_iron_husk', maxHp: 240, speed: 0.035, bounty: 16, coreDamage: 3 },
  // Saboteur (v3 §2.Г): doesn't lean on the core — it jams nearby towers, glitching
  // their shots or stunning them on a crit. Shield-buffed and central towers shrug it off.
  // Doubles as the prototype's "elite" (v3 §8.В): drops crystals on kill until the
  // dedicated elite roster lands (docs/planned/enemy-roster-design.md).
  {
    id: 'signal_disruptor',
    name: 'Signal Disruptor',
    element: 'Electricity',
    iconKey: 'enemy_disruptor',
    maxHp: 80,
    speed: 0.062,
    bounty: 12,
    coreDamage: 1,
    archetype: 'disruptor',
    interruptInterval: 1.6,
    interruptChance: 0.6,
    interruptCrit: 0.25,
    crystalBounty: 2,
  },
  // --- Support mobs (docs/planned/support-enemies.md) -------------------------
  // The "enemies synergize" mirror: no direct attack, low HP, premium bounty —
  // the threat is what they hand to allies, so focusing them first is the play.
  // Each aura affects *other* enemies within auraRadiusFrac (resolved in BattleSim).
  {
    id: 'resonance_mote', name: 'Resonance Mote', element: 'Energy', iconKey: 'enemy_resonance_mote',
    maxHp: 70, speed: 0.06, bounty: 12, coreDamage: 1,
    archetype: 'support', auraRadiusFrac: 0.18, auraHastePct: 25,
  },
  {
    id: 'coolant_mender', name: 'Coolant Mender', element: 'Water', iconKey: 'enemy_coolant_mender',
    maxHp: 65, speed: 0.055, bounty: 11, coreDamage: 1,
    archetype: 'support', auraRadiusFrac: 0.16, auraHealPerSec: 8,
  },
  {
    id: 'aegis_beacon', name: 'Aegis Beacon', element: 'Energy', iconKey: 'enemy_aegis_beacon',
    maxHp: 60, speed: 0.05, bounty: 13, coreDamage: 1,
    archetype: 'support', auraRadiusFrac: 0.15, allyShieldHp: 60,
  },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

export function getEnemy(id: string): EnemyDef {
  const def = ENEMY_BY_ID[id];
  if (!def) throw new Error(`Unknown enemy id: ${id}`);
  return def;
}
