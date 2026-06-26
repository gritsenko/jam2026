/**
 * Headless smoke checks for fusion hybrid perks (v2 §6.5).
 * Run: npx tsx tools/verify_hybrids.ts
 */
import { getCard, hasHybridPerk } from '../src/config/cards';
import { buildTowerSpec } from '../src/game/BattleSim';

const emptyMods = {
  reactions: [] as const,
  damageMult: 1,
  rangeMult: 1,
  tempoMult: 1,
  defenseMult: 1,
};

const cellPx = 100;
const arenaW = 1080;

type Check = { id: string; perk: string; ok: (s: ReturnType<typeof buildTowerSpec>) => boolean };

const checks: Check[] = [
  {
    id: 'steam_cannon',
    perk: 'steamBurst',
    ok: (s) => s.aoeRadius > 0 && s.freezeRadius > 0 && s.slowFactor > 0,
  },
  {
    id: 'cryo_discharge',
    perk: 'wetOnHit',
    ok: (s) => s.wetSec > 0 && s.chainTargets > 1,
  },
  {
    id: 'thermo_spear',
    perk: 'builtInShrapnel',
    ok: (s) => s.pierce && s.aoeRadius > 0,
  },
  {
    id: 'icebreaker',
    perk: 'bonusVsSlowWet',
    ok: (s) => s.vsSlowWetMult > 1 && s.pierce,
  },
  {
    id: 'gauss_coil',
    perk: 'chainAfterPierce',
    ok: (s) => s.chainAfterPierce > 0 && s.pierce,
  },
  {
    id: 'ion_volley',
    perk: '(baseline)',
    ok: (s) => s.chainTargets === 2 && s.cooldown < 0.5,
  },
];

let failed = 0;
for (const { id, perk, ok } of checks) {
  const def = getCard(id);
  const spec = buildTowerSpec(def, 1, { x: 0, y: 0 }, cellPx, arenaW, emptyMods);
  const pass = ok(spec);
  console.log(`${pass ? 'OK' : 'FAIL'} ${id} [${perk}]`, {
    aoe: Math.round(spec.aoeRadius),
    wet: spec.wetSec,
    chain: spec.chainTargets,
    arc: spec.chainAfterPierce,
    vsSlowWet: spec.vsSlowWetMult,
  });
  if (!pass) failed++;
  if (perk !== '(baseline)' && !hasHybridPerk(def, perk as never)) {
    console.log(`  WARN: missing hybridPerk ${perk}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll hybrid spec checks passed.');
