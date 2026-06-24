import type { CardDef } from './types';

/**
 * Card catalog (v2 model — see docs/synergy-grid-td-v2.md §5/§6/§9).
 *
 * Synergy is positional: every card broadcasts its buff to all orthogonal
 * neighbors (Grade I–II) and additionally to diagonals at Grade III. The grade
 * tables below carry damage/range, the buff %, the signature value and the
 * synergy reach. In-game labels are English to match docs/style_ref.png.
 */
export const CARDS: Record<string, CardDef> = {
  // --- Attacking ----------------------------------------------------------
  plasma_shutter: {
    id: 'plasma_shutter',
    name: 'Плазменный Затвор',
    shortName: 'PLASMA SHUTTER',
    element: 'Fire',
    category: 'attacking',
    baseLoad: 2,
    costGold: 40,
    cooldown: 0.8,
    buffStat: 'damage',
    signature: 'projectile_power', // damage per shot
    slotElements: ['Water', 'Physical', 'Energy'],
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
    name: 'Морозный Импульс',
    shortName: 'FROST PULSE',
    element: 'Water',
    category: 'attacking',
    baseLoad: 1,
    costGold: 25,
    cooldown: 1.5,
    buffStat: 'range',
    signature: 'freeze_radius', // sig = slow %, sig2 = Wet seconds
    slotElements: ['Electricity', 'Fire', 'Energy'],
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
    name: 'Грозовая Катушка',
    shortName: 'STORM COIL',
    element: 'Electricity',
    category: 'attacking',
    baseLoad: 2,
    costGold: 40,
    cooldown: 1.2,
    buffStat: 'tempo',
    signature: 'chain_targets', // sig = number of chain targets
    slotElements: ['Water', 'Energy', 'Fire'],
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
    shortName: 'URANIUM CELL',
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
};

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
