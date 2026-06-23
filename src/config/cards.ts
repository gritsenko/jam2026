import type { CardDef } from './types';

/**
 * Mock card catalog distilled from docs/cards.json (alpha starter set).
 * Numbers are for display only — no combat logic consumes them yet.
 * In-game labels are English to match the style reference (docs/style_ref.png).
 */
export const CARDS: Record<string, CardDef> = {
  plasma_shutter: {
    id: 'plasma_shutter',
    name: 'Плазменный Затвор',
    shortName: 'PLASMA SHUTTER',
    element: 'Fire',
    category: 'attacking',
    baseLoad: 2,
    costSP: 20,
    costGold: 40,
    cooldown: 0.8,
    baseDamage: 15,
    rangeCells: 2,
    upgrade: 'power',
    directions: ['Up'],
    buff: { stat: 'damage', value: 15, scope: 'directions', label: '+15% DMG' },
    blurb: '+15% DAMAGE — broadcast up',
    iconKey: 'plasma_shutter',
  },
  frost_pulse: {
    id: 'frost_pulse',
    name: 'Морозный Импульс',
    shortName: 'FROST PULSE',
    element: 'Water',
    category: 'attacking',
    baseLoad: 1,
    costSP: 10,
    costGold: 25,
    cooldown: 1.5,
    baseDamage: 8,
    rangeCells: 2.4,
    upgrade: 'range',
    directions: ['Left', 'Right'],
    buff: { stat: 'range', value: 20, scope: 'directions', label: '+20% RNG' },
    blurb: 'Applies WET • slows 25%',
    iconKey: 'frost_pulse',
  },
  storm_coil: {
    id: 'storm_coil',
    name: 'Грозовая Катушка',
    shortName: 'STORM COIL',
    element: 'Electricity',
    category: 'attacking',
    baseLoad: 2,
    costSP: 20,
    costGold: 40,
    cooldown: 1.2,
    baseDamage: 10,
    rangeCells: 2,
    upgrade: 'tempo',
    directions: ['Left'],
    buff: { stat: 'tempo', value: 15, scope: 'directions', label: '+15% SPD' },
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
    costSP: 35,
    costGold: 90,
    cooldown: 3.0,
    baseDamage: 60,
    rangeCells: 2.6,
    upgrade: 'power',
    directions: [],
    buff: { stat: 'tempo', value: -5, scope: 'adjacent', label: '-5% SPD' },
    blurb: 'Pierces a line • drains neighbors',
    iconKey: 'railgun',
  },
  shield_generator: {
    id: 'shield_generator',
    name: 'Генератор Щита',
    shortName: 'SHIELD DOME',
    element: 'Physical',
    category: 'support',
    baseLoad: 1,
    costSP: 15,
    costGold: 30,
    directions: ['Left', 'Right'],
    buff: { stat: 'defense', value: 50, scope: 'directions', label: '+50% DEF' },
    blurb: '+50% armor • road barrier',
    iconKey: 'shield_generator',
  },
  grid_stabilizer: {
    id: 'grid_stabilizer',
    name: 'Стабилизатор Сети',
    shortName: 'URANIUM CELL',
    element: 'Energy',
    category: 'support',
    baseLoad: -2,
    costSP: 10,
    costGold: 25,
    directions: [],
    buff: { stat: 'tempo', value: -15, scope: 'adjacent', label: '-15% SPD' },
    blurb: '+2 network energy • slows neighbors',
    iconKey: 'grid_stabilizer',
  },
};

export const CARD_LIST: CardDef[] = Object.values(CARDS);

export function getCard(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`Unknown card id: ${id}`);
  return def;
}
