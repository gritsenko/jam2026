import type { ElementId } from '../theme';

export type { ElementId };

export type Direction = 'Up' | 'Down' | 'Left' | 'Right';

export type CardCategory = 'attacking' | 'support';

/** Stat a card broadcasts to its neighbors (drives the inspection badges). */
export type BuffStat = 'damage' | 'range' | 'tempo' | 'defense';

/**
 * What a placed card transmits to neighboring slots (mock display data distilled
 * from the `buff_profile` / `special_negative_effect` in docs/cards.json). Drives
 * the tap-to-inspect overlay; no battle logic consumes it yet.
 */
export interface CardBuff {
  /** Which neighbor stat is modified. */
  readonly stat: BuffStat;
  /** Percent delta applied to neighbors: +15 → +15%, -15 → a -15% penalty. */
  readonly value: number;
  /**
   * Who receives it: 'directions' uses the card's broadcast `directions`;
   * 'adjacent' hits all four orthogonal neighbors (e.g. energy/heat drains).
   */
  readonly scope: 'directions' | 'adjacent';
  /** Short label drawn on the neighbor badge, e.g. '+15% DMG'. */
  readonly label: string;
}

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
  readonly costSP: number; // play cost in Synergy Points (legacy mock, unused)
  /** Gold spent to place this card from the hand. Gated by the player's gold. */
  readonly costGold: number;
  readonly cooldown?: number;
  readonly baseDamage?: number;
  /** Attack radius in grid cells (attacking towers only). Only nearby road is in reach. */
  readonly rangeCells?: number;
  /** Which stat a merge grade upgrades for this tower: damage / fire-rate / radius. */
  readonly upgrade?: 'power' | 'tempo' | 'range';
  /** Buff broadcast directions at grade 1 — used to draw resonance arrows (mock). */
  readonly directions: Direction[];
  /** Effect transmitted to neighboring slots (inspection overlay). */
  readonly buff?: CardBuff;
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
  /** Hit points at full health. */
  readonly maxHp: number;
  /** Travel speed along the ring, as a fraction of the full lap per second (so 1/speed = seconds per lap). */
  readonly speed: number;
  /** Gold awarded to the player on kill. */
  readonly bounty: number;
  /** Core integrity lost if this enemy completes the lap and breaches the core. */
  readonly coreDamage: number;
}

/** One burst of identical enemies within a wave. */
export interface SpawnGroup {
  readonly enemyId: string;
  readonly count: number;
  /** Seconds between consecutive spawns inside this group. */
  readonly gap: number;
}

/** A single wave: spawn groups played back-to-back, in order. */
export interface WaveDef {
  readonly groups: SpawnGroup[];
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
