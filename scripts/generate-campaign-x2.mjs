// Generates src/data/game_configs/campaign_x2 from campaign_tight:
//   - hpScale ×2, bountyScale ×1.35 (partial economy relief)
//   - wave counts ×1.3, gaps ×0.88
//   - bosses (grid_warden mid, overload_titan finale) on lvl_7–lvl_12

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}/src/data/game_configs/campaign_tight`;
const DST = `${ROOT}/src/data/game_configs/campaign_x2`;

const SUPPORT = new Set(['resonance_mote', 'coolant_mender', 'aegis_beacon']);
const BOSS_IDS = new Set(['grid_warden', 'overload_titan']);

/** Boss base HP in campaign_x2 — lower than bot_tune because level hpScale is already ~×2. */
const BOSS_PATCH = {
  grid_warden: { maxHp: 4500, speed: 0.034, coreDamage: 3 },
  overload_titan: { maxHp: 11000, speed: 0.022, coreDamage: 8 },
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function scaleCount(n) {
  return Math.max(1, Math.ceil(n * 1.3));
}

function scaleGap(g) {
  return round2(g * 0.88);
}

function escortInWave(groups) {
  return groups.reduce((sum, g) => (SUPPORT.has(g.enemyId) || BOSS_IDS.has(g.enemyId) ? sum : sum + g.count), 0);
}

function waveHas(groups, id) {
  return groups.some((g) => g.enemyId === id);
}

function scaleGroups(groups) {
  return groups.map((g) => ({
    ...g,
    count: BOSS_IDS.has(g.enemyId) ? g.count : scaleCount(g.count),
    gap: scaleGap(g.gap),
  }));
}

/** Uniform linear hp tier on top of 2× campaign_tight (smooth ramp lvl 1→12). */
function uniformHpScale(levelNum, tightScale) {
  const linear = 2.0 + (levelNum - 1) * 0.26;
  const doubled = tightScale * 2;
  return round2((linear + doubled) / 2);
}

function wardenWave(levelNum) {
  const grunt = Math.max(14, 10 + levelNum);
  return {
    groups: [
      { enemyId: 'volt_crawler', count: scaleCount(grunt - 6), gap: scaleGap(0.52) },
      { enemyId: 'frost_wisp', count: scaleCount(6), gap: scaleGap(0.4) },
      { enemyId: 'magma_brute', count: scaleCount(4), gap: scaleGap(0.95) },
      { enemyId: 'grid_warden', count: 1, gap: scaleGap(4.2) },
      { enemyId: 'signal_disruptor', count: scaleCount(2 + Math.floor(levelNum / 4)), gap: scaleGap(1.6) },
      ...(levelNum >= 9 ? [{ enemyId: 'coolant_mender', count: 1, gap: scaleGap(2.6) }] : []),
    ],
  };
}

function titanFinale(levelNum) {
  const grunt = Math.max(16, 12 + levelNum);
  return {
    groups: [
      { enemyId: 'volt_crawler', count: scaleCount(Math.floor(grunt * 0.4)), gap: scaleGap(0.48) },
      { enemyId: 'frost_wisp', count: scaleCount(Math.floor(grunt * 0.3)), gap: scaleGap(0.36) },
      { enemyId: 'magma_brute', count: scaleCount(5 + Math.floor(levelNum / 3)), gap: scaleGap(0.88) },
      { enemyId: 'iron_husk', count: scaleCount(1 + Math.floor(levelNum / 5)), gap: scaleGap(2.6) },
      { enemyId: 'aegis_beacon', count: scaleCount(levelNum >= 10 ? 2 : 1), gap: scaleGap(2.8) },
      { enemyId: 'coolant_mender', count: 1, gap: scaleGap(2.4) },
      { enemyId: 'overload_titan', count: 1, gap: scaleGap(5) },
      { enemyId: 'signal_disruptor', count: scaleCount(2 + Math.floor(levelNum / 3)), gap: scaleGap(1.45) },
    ],
  };
}

function ensureBosses(waves, levelNum) {
  const out = waves.map((w) => ({ groups: scaleGroups(w.groups) }));

  if (levelNum < 7) return out;

  const hasWarden = out.some((w) => waveHas(w.groups, 'grid_warden'));
  const hasTitan = out.some((w) => waveHas(w.groups, 'overload_titan'));

  if (!hasTitan) out.push(titanFinale(levelNum));
  if (!hasWarden) out.splice(out.length - 1, 0, wardenWave(levelNum));

  for (const w of out) {
    if (waveHas(w.groups, 'grid_warden') || waveHas(w.groups, 'overload_titan')) {
      const escort = escortInWave(w.groups);
      if (escort < 14) {
        const g = w.groups.find((x) => x.enemyId === 'volt_crawler');
        if (g) g.count += 14 - escort;
        else w.groups.unshift({ enemyId: 'volt_crawler', count: 14 - escort, gap: scaleGap(0.5) });
      }
    }
  }
  return out;
}

function transformLevelCombat(tight) {
  const out = {};
  for (const [id, lc] of Object.entries(tight)) {
    const n = Number(id.replace('lvl_', ''));
    out[id] = {
      ...lc,
      hpScale: uniformHpScale(n, lc.hpScale),
      bountyScale: round2(lc.bountyScale * 1.35),
      waves: ensureBosses(lc.waves, n),
    };
  }
  return out;
}

// Copy static files, transform levelCombat.
const FILES = [
  'cards',
  'enemies',
  'levels',
  'waves',
  'reactions',
  'recipes',
  'progression',
  'combatRules',
  'battleRules',
  'battleSeed',
];

if (existsSync(DST)) {
  console.log('overwriting', DST);
} else {
  mkdirSync(DST, { recursive: true });
}

const tightCombat = JSON.parse(readFileSync(`${SRC}/levelCombat.json`, 'utf8'));
writeFileSync(`${DST}/levelCombat.json`, JSON.stringify(transformLevelCombat(tightCombat), null, 2) + '\n');

for (const f of FILES) {
  if (f === 'levelCombat') continue;
  let raw = readFileSync(`${SRC}/${f}.json`, 'utf8');
  if (f === 'battleSeed') {
    const seed = JSON.parse(raw);
    seed.gold = Math.max(260, Math.floor(seed.gold * 0.85));
    raw = JSON.stringify(seed, null, 2) + '\n';
  }
  if (f === 'enemies') {
    const enemies = JSON.parse(raw);
    for (const e of enemies) {
      const patch = BOSS_PATCH[e.id];
      if (patch) Object.assign(e, patch);
    }
    raw = JSON.stringify(enemies, null, 2) + '\n';
  }
  writeFileSync(`${DST}/${f}.json`, raw);
}

console.log('generated campaign_x2');
