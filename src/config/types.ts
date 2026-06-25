import type { ElementId } from '../theme';

export type { ElementId };

/** Orthogonal directions — still used by the grid to draw broadcast arrows. */
export type Direction = 'Up' | 'Down' | 'Left' | 'Right';

export type CardCategory = 'attacking' | 'support' | 'modernization';

/**
 * Which platform-wide upgrade a modernization card applies (docs/done/modernization-cards.md).
 * Unlike build cards, these never occupy a slot — they apply to the *whole*
 * platform on release over it:
 * - `isolation` — permanently (for the battle) raises the network's base capacity;
 * - `focus` — buffs the damage of all towers of a chosen element until the wave ends;
 * - `overdrive` — an emergency Reactor overdrive window paid in crystals, no card burned.
 */
export type ModEffect = 'isolation' | 'focus' | 'overdrive';

/** Stat a card broadcasts to its neighbors (drives the buff badges + combat). */
export type BuffStat = 'damage' | 'range' | 'tempo' | 'defense';

/**
 * The signature parameter a tower type scales as it merges (v2 §5). Each type
 * grows a *different* dimension, so grading feels distinct per card.
 */
export type SignatureKind =
  | 'projectile_power' // Plasma — damage per shot
  | 'freeze_radius' // Frost — slow strength + Wet duration (chill AoE)
  | 'chain_targets' // Storm — number of chain-lightning targets
  | 'pierce_length' // Railgun — pierce-line length (attack range)
  | 'barrier' // Shield — road-barrier HP + hold duration
  | 'energy_output'; // Stabilizer — energy generated for the network

/**
 * Stable id for each element-pair resonance reaction (v2 §7). Resolved against
 * the {@link import('./resonance').REACTIONS} table.
 */
export type ReactionId = 'steam' | 'superconductivity' | 'shrapnel';

/**
 * Per-grade tunables for a card (the array index is grade-1: [0]=Grade I).
 * Distilled from the v2 stat tables in §5/§6.
 */
export interface CardGrade {
  /** Damage per shot (attacking towers). */
  readonly damage?: number;
  /** Attack radius in grid cells (attacking towers; 0/undefined = no direct attack). */
  readonly rangeCells?: number;
  /**
   * Buff/penalty broadcast to every neighbor in reach, in percent on the card's
   * {@link CardDef.buffStat}: +22 → +22%, -15 → a -15% penalty (Railgun/Cell).
   */
  readonly buff: number;
  /**
   * Primary signature value at this grade. Meaning depends on
   * {@link CardDef.signature}: damage / slow% / chain targets / pierce range
   * cells / barrier HP / energy output.
   */
  readonly sig: number;
  /** Secondary signature value: Wet seconds (Frost) or barrier hold seconds (Shield). */
  readonly sig2?: number;
  /**
   * Extra +damage% the card also broadcasts at this grade (v2: Shield III and
   * Stabilizer III hand neighbors +10% damage on top of / instead of their main buff).
   */
  readonly bonusDamage?: number;
  /** Grade III: the broadcast also reaches the four diagonal neighbors. */
  readonly diagonal?: boolean;
}

/**
 * A card definition (v2 model). Grade-independent identity + per-grade stat
 * tables. Synergy is positional now (orthogonal neighbors, +diagonals at G III)
 * — there are no per-card broadcast directions.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  /** Short label shown on the card face (e.g. "TESLA GUN"). */
  readonly shortName: string;
  readonly element: ElementId;
  readonly category: CardCategory;
  /** Network load added on placement (negative for generators). */
  readonly baseLoad: number;
  /** Gold spent to place this card from the hand. */
  readonly costGold: number;
  /**
   * Crystal price instead of gold, for cards paid in the hard currency
   * (modernization Emergency Overdrive). Omitted → the card is paid in {@link costGold}.
   */
  readonly costCrystals?: number;
  /**
   * Modernization cards only ({@link CardCategory} `modernization`): the global
   * platform effect applied on release over the platform. Build cards leave it undefined.
   */
  readonly mod?: ModEffect;
  /** Base seconds between shots (attacking towers). */
  readonly cooldown?: number;
  /** Which neighbor stat this card buffs / penalizes. */
  readonly buffStat: BuffStat;
  /** The signature parameter this tower scales as it merges (v2 §5). */
  readonly signature: SignatureKind;
  /**
   * Desired-neighbor elements in slot-open order (v2 §9). The i-th synergy slot
   * (opens at grade i+1) wants this element; a neighbor of it lights that dot.
   * Support cards leave this empty and instead show coverage dots.
   */
  readonly slotElements: ElementId[];
  /**
   * Short effect label per synergy slot, parallel to {@link slotElements} (v2 §9):
   * what the i-th slot grants once its wanted element is adjacent — a resonance
   * reaction ("STEAM BURST"), "POWER" (energy feed), or a stat buff. Empty/omitted
   * for support cards, which fill a coverage role instead of resonating.
   */
  readonly slotEffects?: readonly string[];
  /** Per-grade stat tables (3 entries: Grade I / II / III). */
  readonly grades: readonly [CardGrade, CardGrade, CardGrade];
  /** One-line flavor for the card face / tooltip. */
  readonly blurb: string;
  /** Asset manifest key for the card art; resolves to a placeholder until generated. */
  readonly iconKey: string;
  /**
   * True for fusion hybrids (v2 §6.5): crafted in hand from two *different* base
   * cards, never dealt from the draw pool. They carry a compact two-element kit
   * but count as a single source for resonance (their `element` is the one source).
   */
  readonly hybrid?: boolean;
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

/**
 * Combat archetype (v3 §2.Г). `standard` enemies just walk the ring and breach
 * the core. A `disruptor` (Нарушитель) instead rushes the platform and *interrupts*
 * tower attacks — glitching a shot or, on a crit, briefly stunning the tower —
 * which is what finally gives the Shield's +DEF / interrupt-immunity a purpose.
 */
export type EnemyArchetype = 'standard' | 'disruptor';

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
  /** Combat archetype (defaults to `standard`). */
  readonly archetype?: EnemyArchetype;
  /** Disruptor only: seconds between interrupt attempts while it skirts the platform. */
  readonly interruptInterval?: number;
  /** Disruptor only: base chance an interrupt lands on a non-immune tower (0..1, v3 §2.Г). */
  readonly interruptChance?: number;
  /** Disruptor only: chance a landed interrupt crits into a short stun rather than a glitch. */
  readonly interruptCrit?: number;
  /**
   * Elite drop (v3 §8.В): crystals awarded on kill, *on top of* gold — the second
   * crystal source besides a Perfect Clear. Flat (not scaled by the level's
   * bountyScale, since crystals are the cross-battle tactical currency). Omitted /
   * 0 for ordinary enemies.
   */
  readonly crystalBounty?: number;
}

/**
 * Which arena edge a level's enemies march in from (drives the path template in
 * combatRules.ts `ENEMY_PATHS` + the pre-wave direction telegraph). `bottom` is
 * the all-around ring (the original route); the others concentrate the march on
 * two adjacent edges, so a defense built for one direction has a real cold corner
 * when the next level attacks from another (v3 "corner = best arc" made dynamic).
 */
export type PathId = 'bottom' | 'top' | 'left' | 'right';

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
