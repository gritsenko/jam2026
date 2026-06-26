// One-off helper: serialize the current TS design constants into the default
// ConfigSet JSON (src/data/sets/default/). Run with tsx. Safe to re-run — after
// the config-as-data migration it reads the same values back (activeSet) and
// regenerates byte-identical JSON, which doubles as a fidelity check.
//
//   sim/server/node_modules/.bin/tsx tools/dump_config.ts
//
// Dumps content + numeric tuning sets (combatRules/battleRules/battleSeed). JSON
// keys for the numeric sets = the TS export names, so the round-trip is trivially
// byte-for-byte (no key mapping). Run BEFORE rewiring config/*.ts to read activeSet.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARDS } from '../src/config/cards';
import { ENEMIES } from '../src/config/enemies';
import { LEVELS } from '../src/config/levels';
import { LEVEL_COMBAT } from '../src/config/levelCombat';
import { WAVES } from '../src/config/waves';
import { REACTIONS } from '../src/config/resonance';
import { LEVEL_UNLOCKS, STARTING_TOWERS } from '../src/config/progression';
import * as CR from '../src/config/combatRules';
import * as BR from '../src/config/battleRules';
import { createBattleState } from '../src/config/battleState';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/data/sets/default');
mkdirSync(outDir, { recursive: true });

// Fusion recipes: the source RECIPES const is module-private and keyed by a
// sorted "a|b" pair key. Mirror it here (6 entries from fusion.ts) so it lands in
// the ConfigSet without exporting internals.
const RECIPES: Record<string, string> = {
  'frost_pulse|plasma_shutter': 'steam_cannon',
  'frost_pulse|storm_coil': 'cryo_discharge',
  'plasma_shutter|storm_coil': 'ion_volley',
  'plasma_shutter|railgun': 'thermo_spear',
  'frost_pulse|railgun': 'icebreaker',
  'railgun|storm_coil': 'gauss_coil',
};

function write(name: string, data: unknown): void {
  const file = resolve(outDir, name);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('wrote', file);
}

// Numeric tuning sets — keys mirror the TS export names exactly (see schema.ts
// CombatRules/BattleRules). ENEMY_PATH (derived alias) is intentionally omitted.
const combatRules = {
  CORE_MAX: CR.CORE_MAX,
  FIRST_WAVE_DELAY: CR.FIRST_WAVE_DELAY,
  WAVE_INTERMISSION: CR.WAVE_INTERMISSION,
  PROJECTILE_SPEED_FRAC: CR.PROJECTILE_SPEED_FRAC,
  PROJECTILE_HIT_FRAC: CR.PROJECTILE_HIT_FRAC,
  OVERLOAD_FIRE_PENALTY_PER_LOAD: CR.OVERLOAD_FIRE_PENALTY_PER_LOAD,
  OVERLOAD_FIRE_FLOOR: CR.OVERLOAD_FIRE_FLOOR,
  OVERDRIVE_CAPACITY_BONUS: CR.OVERDRIVE_CAPACITY_BONUS,
  CAPACITY_PER_WAVE: CR.CAPACITY_PER_WAVE,
  WAVE_CLEAR_BONUS: CR.WAVE_CLEAR_BONUS,
  PERFECT_CLEAR_CRYSTALS: CR.PERFECT_CLEAR_CRYSTALS,
  WET_DAMAGE_MULT: CR.WET_DAMAGE_MULT,
  SLOW_REFRESH_SEC: CR.SLOW_REFRESH_SEC,
  CHAIN_RADIUS_FRAC: CR.CHAIN_RADIUS_FRAC,
  CHAIN_FALLOFF: CR.CHAIN_FALLOFF,
  PLASMA_SHOCKWAVE_FRAC: CR.PLASMA_SHOCKWAVE_FRAC,
  PLASMA_SLOW_PROJECTILE_MULT: CR.PLASMA_SLOW_PROJECTILE_MULT,
  SHRAPNEL_AOE_MULT: CR.SHRAPNEL_AOE_MULT,
  AOE_SPLASH_FRAC: CR.AOE_SPLASH_FRAC,
  FROST_FREEZE_RADIUS_FRAC: CR.FROST_FREEZE_RADIUS_FRAC,
  RAILGUN_BEAM_HALF_WIDTH_FRAC: CR.RAILGUN_BEAM_HALF_WIDTH_FRAC,
  DISRUPTOR_JAM_RANGE_FRAC: CR.DISRUPTOR_JAM_RANGE_FRAC,
  INTERRUPT_STUN_SEC: CR.INTERRUPT_STUN_SEC,
  BARRIER_COOLDOWN_SEC: CR.BARRIER_COOLDOWN_SEC,
  AURA_HASTE_CAP_PCT: CR.AURA_HASTE_CAP_PCT,
  AURA_SHIELD_DECAY_PER_SEC: CR.AURA_SHIELD_DECAY_PER_SEC,
  STEAM_SLOW: CR.STEAM_SLOW,
  STEAM_DOT_DPS: CR.STEAM_DOT_DPS,
  STEAM_DOT_SEC: CR.STEAM_DOT_SEC,
  SUPERCONDUCT_TEMPO_MULT: CR.SUPERCONDUCT_TEMPO_MULT,
  SUPERCONDUCT_STUN_CHANCE: CR.SUPERCONDUCT_STUN_CHANCE,
  SUPERCONDUCT_STUN_SEC: CR.SUPERCONDUCT_STUN_SEC,
  ENEMY_PATHS: CR.ENEMY_PATHS,
};
const battleRules = {
  HAND_SIZE: BR.HAND_SIZE,
  HAND_RESPAWN_SEC: BR.HAND_RESPAWN_SEC,
  OVERDRIVE_SEC: BR.OVERDRIVE_SEC,
  OVERDRIVE_BASE_COST: BR.OVERDRIVE_BASE_COST,
  OVERDRIVE_STEP: BR.OVERDRIVE_STEP,
  REROLL_BASE_COST: BR.REROLL_BASE_COST,
  REROLL_STEP: BR.REROLL_STEP,
  MOD_ISOLATION_CAPACITY: BR.MOD_ISOLATION_CAPACITY,
  MOD_FOCUS_DMG_MULT: BR.MOD_FOCUS_DMG_MULT,
  MOD_EMERGENCY_OVERDRIVE_SEC: BR.MOD_EMERGENCY_OVERDRIVE_SEC,
  MOD_DRAW_CHANCE: BR.MOD_DRAW_CHANCE,
};

write('cards.json', CARDS);
write('enemies.json', ENEMIES);
write('levels.json', LEVELS);
write('levelCombat.json', LEVEL_COMBAT);
write('waves.json', WAVES);
write('reactions.json', REACTIONS);
write('recipes.json', RECIPES);
write('progression.json', { levelUnlocks: LEVEL_UNLOCKS, startingTowers: STARTING_TOWERS });
write('combatRules.json', combatRules);
write('battleRules.json', battleRules);
write('battleSeed.json', createBattleState());

console.log('done.');
