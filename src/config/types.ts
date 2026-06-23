import type { ElementId } from '../theme';

export type { ElementId };

export type Direction = 'Up' | 'Down' | 'Left' | 'Right';

export type CardCategory = 'attacking' | 'support';

/**
 * A card definition (mock-data shape, distilled from docs/cards.json).
 * Combat fields are kept for display only — no battle logic runs on them yet.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  /** Short label shown on the card face (the ref shows e.g. "STORM COIL"). */
  readonly shortName: string;
  readonly element: ElementId;
  readonly category: CardCategory;
  readonly baseLoad: number; // energy load (can be negative for generators)
  readonly costSP: number; // play cost in Synergy Points (mock)
  readonly cooldown?: number;
  readonly baseDamage?: number;
  /** Buff broadcast directions at grade 1 — used to draw resonance arrows (mock). */
  readonly directions: Direction[];
  /** One-line flavor for the card face / tooltip. */
  readonly blurb: string;
  /** Asset manifest key for the card art; resolves to a placeholder until generated. */
  readonly iconKey: string;
}

/** A card occupying a platform slot. */
export interface PlacedCard {
  readonly cardId: string;
  /** Merge grade 1..3. */
  readonly grade: number;
}

/** A card held in the bottom hand. */
export interface HandCard {
  readonly instanceId: string;
  readonly cardId: string;
  readonly grade: number;
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly element: ElementId;
  readonly iconKey: string;
}

export type LevelState = 'locked' | 'available' | 'cleared';

export interface LevelNode {
  readonly id: string;
  readonly name: string;
  /** Position on the world map, normalized 0..1 in the portrait design space. */
  readonly nx: number;
  readonly ny: number;
  readonly state: LevelState;
}

/** Mock snapshot of the battle HUD state — drives the UI, no simulation. */
export interface BattleStateMock {
  wave: number;
  maxWave: number;
  gold: number;
  crystals: number;
  sp: number;
  /** Current energy load on the platform network. */
  energyLoad: number;
  /** Network capacity (overload begins above this). */
  energyCapacity: number;
  /** Hard ceiling shown by the gauge track. */
  energyMax: number;
  overdrive: boolean;
  /** 9 slots, row-major (index 0 = top-left). null = empty. */
  slots: (PlacedCard | null)[];
  hand: HandCard[];
}
