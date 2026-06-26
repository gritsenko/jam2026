// Headless engine for the *decision + economy* layer of a battle — the single
// source of truth that BattleScene renders and the bot plays. No Pixi: it owns the
// platform state (slots/gold/crystals/energy), validated actions (place/merge/burn/
// reroll/fusion/modernization) and the economy ledger, and wraps a (optionally
// seeded) BattleSim, feeding it tower specs + per-tick overload and accruing rewards
// on its callbacks. Pure logic ported from BattleScene (animations/SFX stay in the
// scene). See docs/backlog/autotest-system-impl-plan.md.

import type { ElementId } from '../theme';
import type { BattleStateMock, HandCard, PlacedCard } from '../config/types';
import { getCard, cardLoad } from '../config/cards';
import { createBattleState } from '../config/battleState';
import { combatForLevel } from '../config/levelCombat';
import { ENEMY_PATHS, CORE_MAX, CAPACITY_PER_WAVE, OVERDRIVE_CAPACITY_BONUS, WAVE_CLEAR_BONUS, PERFECT_CLEAR_CRYSTALS, DISRUPTOR_JAM_RANGE_FRAC } from '../config/combatRules';
import {
  OVERDRIVE_SEC, overdriveCost, REROLL_BASE_COST, REROLL_STEP, rollHandCard,
  DRAW_POOL, MOD_CARD_POOL, MOD_DRAW_CHANCE, MOD_ISOLATION_CAPACITY, MOD_FOCUS_DMG_MULT, MOD_EMERGENCY_OVERDRIVE_SEC,
} from '../config/battleRules';
import { fusionResult, fusionGoldCost, FUSION_CRYSTAL_COST } from '../config/fusion';
import { unlockedMechanicsForLevel, unlockedTowersForLevel } from '../config/progression';
import { computeSynergy, type SlotSynergy } from './synergy';
import { ArenaPath } from './path';
import { platformLayout } from './platformGeometry';
import {
  BattleSim, buildTowerSpec, isTower, overloadAmount,
  type SimCallbacks, type SimEnemy, type SimStatus, type TowerSpec,
} from './BattleSim';
import type { Rng } from './rng';

const ARENA = 1024; // bg_level is a 1024² arena image (the sim's coordinate space)

type Ledger = { gold: Record<string, number>; crystals: Record<string, number> };

export interface BattleCoreOptions {
  levelId: string;
  /** Optional seeded PRNG → reproducible combat rolls + hand draws (FPS-independent). */
  rng?: Rng;
  arenaW?: number;
  arenaH?: number;
  /** Observer callbacks (e.g. a telemetry recorder); economy is handled internally. */
  observer?: SimCallbacks;
}

export class BattleCore {
  readonly state: BattleStateMock;
  private synergy: (SlotSynergy | null)[] = [];
  private currentWave = 1;
  private rerollsThisWave = 0;
  burnsThisBattle = 0;
  fusionsThisBattle = 0;
  private overdriveStacks: number[] = [];
  private focusElement: ElementId | null = null;
  private readonly mechanics: ReadonlySet<string>;
  private readonly drawPool: string[];
  private instanceSeq = 0;

  readonly faucets: Ledger = { gold: {}, crystals: {} };
  readonly sinks: Ledger = { gold: {}, crystals: {} };

  private readonly sim: BattleSim;
  private readonly arenaW: number;
  private readonly arenaH: number;
  private readonly path: ArenaPath;
  private readonly rngNext: () => number;

  constructor(opts: BattleCoreOptions) {
    this.arenaW = opts.arenaW ?? ARENA;
    this.arenaH = opts.arenaH ?? ARENA;
    this.rngNext = opts.rng ? () => opts.rng!.next() : Math.random;
    const unlocked = unlockedTowersForLevel(opts.levelId);
    this.mechanics = unlockedMechanicsForLevel(opts.levelId);
    this.drawPool = DRAW_POOL.filter((id) => unlocked.has(id));
    this.state = createBattleState(unlocked);

    const lc = combatForLevel(opts.levelId);
    this.path = new ArenaPath(ENEMY_PATHS[lc.pathId ?? 'bottom'], this.arenaW, this.arenaH);
    const obs = opts.observer ?? {};
    this.sim = new BattleSim({
      path: this.path,
      waves: lc.waves,
      hpScale: lc.hpScale,
      bountyScale: lc.bountyScale,
      arenaWidth: this.arenaW,
      coreMax: CORE_MAX,
      rng: opts.rng,
      callbacks: {
        ...obs,
        onEnemyKilled: (e: SimEnemy) => {
          this.addReward(e.bounty, 'kill_bounty');
          const cb = e.def.crystalBounty ?? 0;
          if (cb > 0) this.addCrystals(cb, 'elite_drop');
          obs.onEnemyKilled?.(e);
        },
        onWaveStart: (n: number) => {
          this.currentWave = n;
          this.rerollsThisWave = 0;
          this.focusElement = null; // Focus lasts only its wave (§4)
          obs.onWaveStart?.(n);
        },
        onWaveCleared: (n: number, perfect: boolean) => {
          this.addReward(WAVE_CLEAR_BONUS, 'wave_clear');
          if (perfect) this.addCrystals(PERFECT_CLEAR_CRYSTALS, 'perfect_clear');
          obs.onWaveCleared?.(n, perfect);
        },
      },
    });
    this.refreshSynergy();
    this.refreshEnergy();
    this.syncTowers();
  }

  // --- read-through state ----------------------------------------------------
  get status(): SimStatus { return this.sim.status; }
  get coreHp(): number { return this.sim.coreHp; }
  get coreMax(): number { return CORE_MAX; }
  get waveNumber(): number { return this.sim.waveNumber; }
  get totalWaves(): number { return this.sim.totalWaves; }
  get gold(): number { return this.state.gold; }
  get crystals(): number { return this.state.crystals; }

  // --- lifecycle -------------------------------------------------------------
  start(): void { this.sim.start(); }

  /** Advance one fixed step: feed overload (like BattleScene.update) then tick the sim. */
  tick(dt: number): void {
    // Overdrive burn windows expire.
    if (this.overdriveStacks.length > 0) {
      for (let i = this.overdriveStacks.length - 1; i >= 0; i--) {
        this.overdriveStacks[i]! -= dt;
        if (this.overdriveStacks[i]! <= 0) this.overdriveStacks.splice(i, 1);
      }
      this.refreshEnergy();
    }
    if (this.sim.status === 'running') {
      this.sim.overload = overloadAmount(this.state.energyLoad, this.effectiveCapacity);
    }
    this.sim.update(dt);
  }

  // --- board setup (static-board policies) -----------------------------------
  /** Replace the whole platform (no gold charged — the board is given). */
  setBoard(slots: (PlacedCard | null)[]): void {
    for (let i = 0; i < 9; i++) this.state.slots[i] = slots[i] ?? null;
    this.refreshSynergy();
    this.refreshEnergy();
    this.syncTowers();
  }

  // --- actions (validated; return false when illegal/unaffordable) -----------
  place(cardId: string, grade: number, slot: number): boolean {
    const def = getCard(cardId);
    if (this.state.slots[slot] || this.state.gold < def.costGold) return false;
    this.state.slots[slot] = { cardId, grade };
    this.spendGold(def.costGold, 'place');
    this.afterBoardChange();
    return true;
  }

  mergeHand(cardId: string, grade: number, slot: number): boolean {
    const placed = this.state.slots[slot];
    const def = getCard(cardId);
    if (!placed || !this.canMerge(cardId, grade, slot) || this.state.gold < def.costGold) return false;
    this.state.slots[slot] = { cardId: placed.cardId, grade: Math.min(3, placed.grade + 1) };
    this.spendGold(def.costGold, 'merge');
    this.afterBoardChange();
    return true;
  }

  mergeField(fromIndex: number, toIndex: number): boolean {
    const source = this.state.slots[fromIndex];
    const target = this.state.slots[toIndex];
    if (!source || !target || fromIndex === toIndex) return false;
    if (!this.canMerge(source.cardId, source.grade, toIndex)) return false;
    const cost = getCard(target.cardId).costGold;
    if (this.state.gold < cost) return false;
    this.state.slots[toIndex] = { cardId: target.cardId, grade: Math.min(3, target.grade + 1) };
    this.state.slots[fromIndex] = null;
    this.spendGold(cost, 'merge');
    this.afterBoardChange();
    return true;
  }

  burn(): boolean {
    const cost = this.burnCost();
    if (this.state.gold < cost) return false;
    this.spendGold(cost, 'burn');
    this.burnsThisBattle++;
    this.overdriveStacks.push(OVERDRIVE_SEC);
    this.refreshEnergy();
    return true;
  }

  reroll(): boolean {
    if (!this.mechanics.has('reroll')) return false;
    const cost = this.rerollCost();
    if (this.state.crystals < cost) return false;
    this.spendCrystals(cost, 'reroll');
    this.rerollsThisWave++;
    this.state.hand = this.state.hand.map(() => this.rollHandCard());
    return true;
  }

  /** Fuse two hand cards (by instanceId) into a hybrid (v2 §6.5). */
  fusion(aInstanceId: string, bInstanceId: string): boolean {
    if (!this.mechanics.has('fusion')) return false;
    const a = this.state.hand.find((h) => h.instanceId === aInstanceId);
    const b = this.state.hand.find((h) => h.instanceId === bInstanceId);
    if (!a || !b || a === b) return false;
    const hybridId = fusionResult(a.cardId, b.cardId);
    if (!hybridId) return false;
    const goldCost = fusionGoldCost(a.grade, b.grade);
    if (this.state.gold < goldCost || this.state.crystals < FUSION_CRYSTAL_COST) return false;
    this.spendGold(goldCost, 'fusion');
    this.spendCrystals(FUSION_CRYSTAL_COST, 'fusion');
    this.fusionsThisBattle++;
    // Source consumed; target becomes the crafted hybrid.
    this.state.hand = this.state.hand
      .filter((h) => h.instanceId !== aInstanceId)
      .map((h) => (h.instanceId === bInstanceId ? { instanceId: h.instanceId, cardId: hybridId, grade: 1 } : h));
    return true;
  }

  /** Apply a modernization card globally (isolation / focus / emergency overdrive). */
  modernization(cardId: string, element?: ElementId): boolean {
    const def = getCard(cardId);
    if (def.category !== 'modernization') return false;
    if (def.mod === 'isolation') {
      if (this.state.gold < def.costGold) return false;
      this.spendGold(def.costGold, 'modernization');
      this.state.energyCapacity += MOD_ISOLATION_CAPACITY;
      this.refreshEnergy();
    } else if (def.mod === 'focus') {
      if (!element || this.state.gold < def.costGold) return false;
      this.spendGold(def.costGold, 'modernization');
      this.focusElement = element;
      this.syncTowers();
    } else if (def.mod === 'overdrive') {
      const cost = def.costCrystals ?? 0;
      if (this.state.crystals < cost) return false;
      this.spendCrystals(cost, 'modernization');
      this.overdriveStacks.push(MOD_EMERGENCY_OVERDRIVE_SEC);
      this.refreshEnergy();
    } else {
      return false;
    }
    return true;
  }

  /** Deal a fresh hand card (mod-card share when unlocked), via the seeded rng. */
  rollHandCard(): HandCard {
    if (this.mechanics.has('mod_cards') && MOD_CARD_POOL.length > 0 && this.rngNext() < MOD_DRAW_CHANCE) {
      const id = MOD_CARD_POOL[Math.floor(this.rngNext() * MOD_CARD_POOL.length)]!;
      return { instanceId: `spawn-${this.instanceSeq++}`, cardId: id, grade: 1 };
    }
    return rollHandCard(this.instanceSeq++, this.drawPool, this.rngNext);
  }

  // --- economy ledger --------------------------------------------------------
  private bump(l: Ledger, currency: 'gold' | 'crystals', amount: number, reason: string): void {
    l[currency][reason] = (l[currency][reason] ?? 0) + amount;
  }
  private addReward(n: number, reason: string): void {
    if (!n) return;
    this.state.gold += n;
    this.bump(this.faucets, 'gold', n, reason);
  }
  private spendGold(n: number, reason: string): void {
    this.state.gold = Math.max(0, this.state.gold - n);
    this.bump(this.sinks, 'gold', n, reason);
  }
  private addCrystals(n: number, reason: string): void {
    if (!n) return;
    this.state.crystals += n;
    this.bump(this.faucets, 'crystals', n, reason);
  }
  private spendCrystals(n: number, reason: string): void {
    this.state.crystals = Math.max(0, this.state.crystals - n);
    this.bump(this.sinks, 'crystals', n, reason);
  }

  // --- checks / derived ------------------------------------------------------
  canMerge(cardId: string, grade: number, slot: number): boolean {
    const placed = this.state.slots[slot];
    return !!placed && placed.cardId === cardId && placed.grade === grade && placed.grade < 3;
  }
  burnCost(): number { return overdriveCost(this.burnsThisBattle); }
  rerollCost(): number { return REROLL_BASE_COST + this.rerollsThisWave * REROLL_STEP; }
  get effectiveCapacity(): number {
    return (
      this.state.energyCapacity +
      (this.currentWave - 1) * CAPACITY_PER_WAVE +
      this.overdriveStacks.length * OVERDRIVE_CAPACITY_BONUS
    );
  }

  // --- recomputes ------------------------------------------------------------
  private afterBoardChange(): void {
    this.refreshEnergy();
    this.refreshSynergy();
    this.syncTowers();
  }
  private refreshEnergy(): void {
    let load = 0;
    for (const placed of this.state.slots) if (placed) load += cardLoad(getCard(placed.cardId), placed.grade);
    this.state.energyLoad = Math.max(0, load);
    this.state.overdrive = this.overdriveStacks.length > 0;
  }
  private refreshSynergy(): void {
    this.synergy = computeSynergy(this.state.slots);
  }
  private syncTowers(): void {
    const layout = platformLayout(this.arenaW, this.arenaH);
    const jamReach = DISRUPTOR_JAM_RANGE_FRAC * this.arenaW;
    const specs: TowerSpec[] = [];
    this.state.slots.forEach((placed, i) => {
      if (!placed) return;
      const def = getCard(placed.cardId);
      if (!isTower(def, placed.grade)) return;
      const syn = this.synergy[i];
      const p = layout.slotPos(i);
      const spec = buildTowerSpec(def, placed.grade, p, layout.cellWorldSize, this.arenaW, {
        damageMult: syn?.damageMult ?? 1,
        rangeMult: syn?.rangeMult ?? 1,
        tempoMult: syn?.tempoMult ?? 1,
        defenseMult: syn?.defenseMult ?? 1,
        reactions: syn?.reactions ?? [],
      });
      const roadFar = this.path.nearestDistance(p.x, p.y) >= jamReach;
      const focusMult = this.focusElement && def.element === this.focusElement ? MOD_FOCUS_DMG_MULT : 1;
      specs.push({
        ...spec,
        slotIndex: i,
        damage: Math.round(spec.damage * focusMult),
        interruptImmune: spec.interruptImmune || roadFar,
      });
    });
    this.sim.setTowers(specs);
  }
}
