import type { CardDef } from './types';

/**
 * Card catalog (v2 model — see docs/backlog/synergy-grid-td-v2.md §5/§6/§9).
 *
 * Synergy is positional: every card broadcasts its buff to all orthogonal
 * neighbors (Grade I–II) and additionally to diagonals at Grade III. The grade
 * tables below carry damage/range, the buff %, the signature value and the
 * synergy reach. In-game labels are English to match docs/visual_refs/new_style.jpg.
 */
export const CARDS: Record<string, CardDef> = {
  // --- Attacking ----------------------------------------------------------
  plasma_shutter: {
    id: 'plasma_shutter',
    name: 'Огневая Пушка',
    shortName: 'FIRE GUN',
    element: 'Fire',
    category: 'attacking',
    baseLoad: 2,
    costGold: 40,
    cooldown: 0.8,
    buffStat: 'damage',
    signature: 'projectile_power', // damage per shot
    slotElements: ['Water', 'Physical', 'Energy'],
    slotEffects: ['STEAM BURST', 'SHRAPNEL', 'POWER'],
    grades: [
      { damage: 15, rangeCells: 2, buff: 15, sig: 15 },
      { damage: 23, rangeCells: 2, buff: 22, sig: 23 },
      { damage: 35, rangeCells: 2.2, buff: 22, sig: 35, diagonal: true },
    ],
    blurb: '+DMG to neighbors • Fire',
    iconKey: 'plasma_shutter',
  },
  frost_pulse: {
    id: 'frost_pulse',
    name: 'Ледяная Пушка',
    shortName: 'ICE GUN',
    element: 'Water',
    category: 'attacking',
    baseLoad: 1,
    costGold: 25,
    cooldown: 1.5,
    buffStat: 'range',
    signature: 'freeze_radius', // sig = slow %, sig2 = Wet seconds
    slotElements: ['Electricity', 'Fire', 'Energy'],
    slotEffects: ['SUPERCONDUCT', 'STEAM BURST', 'POWER'],
    grades: [
      { damage: 8, rangeCells: 2.4, buff: 20, sig: 25, sig2: 3 },
      { damage: 8, rangeCells: 2.6, buff: 30, sig: 35, sig2: 3 },
      { damage: 8, rangeCells: 2.8, buff: 30, sig: 50, sig2: 5, diagonal: true },
    ],
    blurb: 'Applies WET • slows • +RNG',
    iconKey: 'frost_pulse',
  },
  storm_coil: {
    id: 'storm_coil',
    name: 'Тесла-Пушка',
    shortName: 'TESLA GUN',
    element: 'Electricity',
    category: 'attacking',
    baseLoad: 2,
    costGold: 40,
    cooldown: 1.2,
    buffStat: 'tempo',
    signature: 'chain_targets', // sig = number of chain targets
    slotElements: ['Water', 'Energy', 'Fire'],
    slotEffects: ['SUPERCONDUCT', 'POWER', '+DMG'],
    grades: [
      { damage: 10, rangeCells: 2, buff: 15, sig: 3 },
      { damage: 10, rangeCells: 2.1, buff: 22, sig: 5 },
      { damage: 10, rangeCells: 2.3, buff: 22, sig: 8, diagonal: true },
    ],
    blurb: 'Chain lightning • x2 vs WET',
    iconKey: 'storm_coil',
  },
  railgun: {
    id: 'railgun',
    name: 'Тяжелый Рельсотрон',
    shortName: 'RAILGUN',
    element: 'Physical',
    category: 'attacking',
    baseLoad: 3,
    costGold: 90,
    cooldown: 3.0,
    buffStat: 'tempo', // a *penalty* to neighbors (negative), fades with grade
    signature: 'pierce_length', // sig = attack range cells (line length)
    slotElements: ['Energy', 'Fire', 'Water'],
    slotEffects: ['POWER', 'SHRAPNEL', 'CHILL'],
    grades: [
      { damage: 120, rangeCells: 2.6, buff: -5, sig: 2.6 },
      { damage: 200, rangeCells: 3.4, buff: -2, sig: 3.4 },
      { damage: 350, rangeCells: 4.6, buff: 0, sig: 4.6, diagonal: true },
    ],
    blurb: 'Pierces a line • drains neighbors',
    iconKey: 'railgun',
  },
  // --- Support ------------------------------------------------------------
  shield_generator: {
    id: 'shield_generator',
    name: 'Генератор Щита',
    shortName: 'SHIELD DOME',
    element: 'Physical',
    category: 'support',
    baseLoad: 1,
    costGold: 30,
    buffStat: 'defense',
    signature: 'barrier', // sig = barrier HP, sig2 = hold seconds
    slotElements: [], // support: coverage dots, not resonance
    grades: [
      // rangeCells = how far the barrier reaches onto the road to grab the lead enemy.
      { rangeCells: 2.2, buff: 50, sig: 100, sig2: 4 },
      { rangeCells: 2.4, buff: 50, sig: 250, sig2: 6 },
      { rangeCells: 2.6, buff: 50, sig: 250, sig2: 6, bonusDamage: 10, diagonal: true },
    ],
    blurb: '+DEF • road barrier',
    iconKey: 'shield_generator',
  },
  grid_stabilizer: {
    id: 'grid_stabilizer',
    name: 'Стабилизатор Сети',
    shortName: 'GRID STABILIZER',
    element: 'Energy',
    category: 'support',
    baseLoad: -2,
    costGold: 25,
    buffStat: 'tempo', // a *penalty* to neighbors, fades to 0 (then +DMG) with grade
    signature: 'energy_output', // sig = energy generated
    slotElements: [], // support: coverage dots, not resonance
    grades: [
      { buff: -15, sig: 2 },
      { buff: -10, sig: 4 },
      { buff: 0, sig: 6, bonusDamage: 10, diagonal: true },
    ],
    blurb: '+energy • slows neighbors',
    iconKey: 'grid_stabilizer',
  },
  // --- Modernization (global platform upgrades, docs/done/modernization-cards.md) ---
  // Not placed in a slot: dragging one holos the *whole* platform and releasing
  // over it applies the upgrade globally. They carry no synergy / signature (the
  // placeholder fields below are inert — the card is gated by `category` /
  // `mod` everywhere it matters). Prices mirror docs/cards.json `global_upgrades`.
  isolation_circuit: {
    id: 'isolation_circuit',
    name: 'Изоляционный Контур',
    shortName: 'ISOLATION',
    element: 'Energy',
    category: 'modernization',
    mod: 'isolation',
    baseLoad: 0,
    costGold: 150,
    buffStat: 'damage', // inert (modernization cards broadcast nothing)
    signature: 'energy_output', // inert placeholder
    slotElements: [],
    grades: [
      { buff: 0, sig: 0 },
      { buff: 0, sig: 0 },
      { buff: 0, sig: 0 },
    ],
    blurb: '+2 base capacity • all battle',
    iconKey: 'isolation_circuit',
  },
  elemental_focus: {
    id: 'elemental_focus',
    name: 'Элементальный Фокус',
    shortName: 'FOCUS',
    element: 'Physical',
    category: 'modernization',
    mod: 'focus',
    baseLoad: 0,
    costGold: 120,
    buffStat: 'damage',
    signature: 'energy_output',
    slotElements: [],
    grades: [
      { buff: 0, sig: 0 },
      { buff: 0, sig: 0 },
      { buff: 0, sig: 0 },
    ],
    blurb: '+25% DMG to one element • this wave',
    iconKey: 'elemental_focus',
  },
  emergency_overdrive: {
    id: 'emergency_overdrive',
    name: 'Экстренный Овердрайв',
    shortName: 'OVERDRIVE',
    element: 'Fire',
    category: 'modernization',
    mod: 'overdrive',
    baseLoad: 0,
    costGold: 0,
    costCrystals: 80,
    buffStat: 'damage',
    signature: 'energy_output',
    slotElements: [],
    grades: [
      { buff: 0, sig: 0 },
      { buff: 0, sig: 0 },
      { buff: 0, sig: 0 },
    ],
    blurb: 'Reactor overdrive 10s • no card burned',
    iconKey: 'emergency_overdrive',
  },
  // --- Hybrids (fusion in hand, v2 §6.5) ----------------------------------
  // Crafted from two different base cards; compact two-element kits with a
  // boosted base stat line. They reuse a parent's art for now — real hybrid
  // sprites are a follow-up (register in assetManifest, then gen_sprite).
  steam_cannon: {
    id: 'steam_cannon',
    name: 'Паровая Пушка',
    shortName: 'STEAM CANNON',
    element: 'Water',
    category: 'attacking',
    baseLoad: 2,
    costGold: 30,
    cooldown: 1.1,
    buffStat: 'range',
    signature: 'freeze_radius', // damage + slow + Wet packed into one shot
    hybrid: true,
    slotElements: ['Electricity', 'Fire', 'Energy'],
    slotEffects: ['SUPERCONDUCT', 'STEAM BURST', 'POWER'],
    grades: [
      { damage: 28, rangeCells: 2.4, buff: 25, sig: 40, sig2: 3 },
      { damage: 42, rangeCells: 2.6, buff: 30, sig: 45, sig2: 4 },
      { damage: 60, rangeCells: 2.8, buff: 30, sig: 55, sig2: 5, diagonal: true },
    ],
    blurb: 'Steam blast • dmg + slow',
    iconKey: 'frost_pulse',
  },
  cryo_discharge: {
    id: 'cryo_discharge',
    name: 'Криоразряд',
    shortName: 'CRYO-DISCHARGE',
    element: 'Electricity',
    category: 'attacking',
    baseLoad: 2,
    costGold: 30,
    cooldown: 1.1,
    buffStat: 'tempo',
    signature: 'chain_targets', // chain lightning, x2 vs Wet (intrinsic to Electricity)
    hybrid: true,
    slotElements: ['Water', 'Energy', 'Fire'],
    slotEffects: ['SUPERCONDUCT', 'POWER', '+DMG'],
    grades: [
      { damage: 22, rangeCells: 2.2, buff: 18, sig: 4 },
      { damage: 22, rangeCells: 2.3, buff: 24, sig: 6 },
      { damage: 22, rangeCells: 2.5, buff: 24, sig: 9, diagonal: true },
    ],
    blurb: 'Chain lightning • x2 vs WET',
    iconKey: 'storm_coil',
  },
  ion_volley: {
    id: 'ion_volley',
    name: 'Ионный Залп',
    shortName: 'ION VOLLEY',
    element: 'Fire',
    category: 'attacking',
    baseLoad: 2,
    costGold: 30,
    cooldown: 0.4, // very high tempo
    buffStat: 'damage',
    signature: 'chain_targets', // each shot jumps to a 2nd target
    hybrid: true,
    slotElements: ['Water', 'Physical', 'Energy'],
    slotEffects: ['STEAM BURST', 'SHRAPNEL', 'POWER'],
    grades: [
      { damage: 16, rangeCells: 2.1, buff: 15, sig: 2 },
      { damage: 24, rangeCells: 2.2, buff: 20, sig: 2 },
      { damage: 34, rangeCells: 2.4, buff: 20, sig: 3, diagonal: true },
    ],
    blurb: 'Rapid fire • jumps to 2nd target',
    iconKey: 'plasma_shutter',
  },
  // Heavy Railgun hybrids (v3 §6.5): each is a piercing line themed by its non-
  // Railgun parent. They cost the "+3 load" the doc charges for cramming a Railgun
  // into a hybrid. They reuse the Railgun art for now (real hybrid sprites later).
  thermo_spear: {
    id: 'thermo_spear',
    name: 'Термокопьё',
    shortName: 'THERMO SPEAR',
    element: 'Fire',
    category: 'attacking',
    baseLoad: 3,
    costGold: 35,
    cooldown: 2.6,
    buffStat: 'damage',
    signature: 'pierce_length', // a fiery pierce line (Shrapnel-friendly: Fire+Physical)
    hybrid: true,
    slotElements: ['Physical', 'Water', 'Energy'],
    slotEffects: ['SHRAPNEL', 'STEAM BURST', 'POWER'],
    grades: [
      { damage: 150, rangeCells: 3.0, buff: 18, sig: 3.0 },
      { damage: 250, rangeCells: 3.8, buff: 24, sig: 3.8 },
      { damage: 420, rangeCells: 4.8, buff: 24, sig: 4.8, diagonal: true },
    ],
    blurb: 'Pierces a line • detonates Fire',
    iconKey: 'railgun',
  },
  icebreaker: {
    id: 'icebreaker',
    name: 'Ледобой',
    shortName: 'ICEBREAKER',
    element: 'Water',
    category: 'attacking',
    baseLoad: 3,
    costGold: 35,
    cooldown: 2.6,
    buffStat: 'range',
    signature: 'pierce_length', // pierce line that also chills the lane it cuts
    hybrid: true,
    slotElements: ['Electricity', 'Fire', 'Energy'],
    slotEffects: ['SUPERCONDUCT', 'STEAM BURST', 'POWER'],
    grades: [
      { damage: 110, rangeCells: 3.0, buff: 22, sig: 3.0 },
      { damage: 180, rangeCells: 3.6, buff: 30, sig: 3.6 },
      { damage: 300, rangeCells: 4.4, buff: 30, sig: 4.4, diagonal: true },
    ],
    blurb: 'Pierces a line • chills targets',
    iconKey: 'railgun',
  },
  gauss_coil: {
    id: 'gauss_coil',
    name: 'Гаусс-Катушка',
    shortName: 'GAUSS COIL',
    element: 'Electricity',
    category: 'attacking',
    baseLoad: 3,
    costGold: 35,
    cooldown: 2.6,
    buffStat: 'tempo',
    signature: 'pierce_length', // electrified pierce line; x2 vs Wet is intrinsic to Electricity
    hybrid: true,
    slotElements: ['Water', 'Energy', 'Fire'],
    slotEffects: ['SUPERCONDUCT', 'POWER', '+DMG'],
    grades: [
      { damage: 90, rangeCells: 3.0, buff: 18, sig: 3.0 },
      { damage: 150, rangeCells: 3.6, buff: 24, sig: 3.6 },
      { damage: 260, rangeCells: 4.4, buff: 24, sig: 4.4, diagonal: true },
    ],
    blurb: 'Electric pierce line • x2 vs WET',
    iconKey: 'railgun',
  },
};

/**
 * iconKeys whose `<iconKey>_dirs` 3×3 aim sheet uses the COMPOSED layout: the
 * center cell is a *stationary base* and the 8 perimeter cells are the rotating
 * *head only*. SlotView draws the base once underneath and crossfades the head
 * between octants for a smooth turn (the base stays outside the crossfade, so it
 * never ghosts). Sheets NOT listed here use the old layout — each cell is a full
 * turret with the base baked in — and hard-swap frames. Add an iconKey here once
 * its `_dirs` sheet is redrawn in the composed layout.
 */
export const COMPOSED_AIM_SHEETS = new Set<string>(['plasma_shutter']);

export const CARD_LIST: CardDef[] = Object.values(CARDS);

export function getCard(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`Unknown card id: ${id}`);
  return def;
}

/** The card's per-grade row, clamped to the valid 1..3 range. */
export function cardGrade(def: CardDef, grade: number): CardDef['grades'][number] {
  const i = Math.min(Math.max(grade, 1), 3) - 1;
  return def.grades[i]!;
}

/** Number of synergy slots a card exposes at a grade (= grade; v2 §2.Б). */
export function synergySlots(grade: number): number {
  return Math.min(Math.max(grade, 1), 3);
}

/**
 * Network load a card draws at a grade (v2 §3.А). Consumers *double* per grade
 * (×1/×2/×4 → 2/4/8, 3/6/12) so a field merge is energy-neutral: two Grade-I
 * towers (2+2=4) equal one Grade-II (4), and merging up neither refunds nor
 * charges energy. Generators (negative baseLoad) scale linearly instead, matching
 * their §5/§6 output table (2/4/6).
 */
export function cardLoad(def: CardDef, grade: number): number {
  const g = Math.min(Math.max(grade, 1), 3);
  return def.baseLoad > 0 ? def.baseLoad * Math.pow(2, g - 1) : def.baseLoad * g;
}
