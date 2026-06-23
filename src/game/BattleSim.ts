import type { ElementId } from '../theme';
import type { CardDef, EnemyDef, WaveDef } from '../config/types';
import { getEnemy } from '../config/enemies';
import {
  FIRST_WAVE_DELAY,
  OVERDRIVE_CAPACITY_BONUS,
  OVERLOAD_FIRE_PENALTY,
  POWER_MULT,
  PROJECTILE_HIT_FRAC,
  PROJECTILE_SPEED_FRAC,
  RANGE_MULT,
  TEMPO_MULT,
  WAVE_INTERMISSION,
} from '../config/combatRules';
import type { ArenaPath } from './path';

// --- Runtime entities (plain state; the view mirrors these into sprites) -----

/** A live enemy walking the ring. */
export interface SimEnemy {
  readonly id: number;
  readonly def: EnemyDef;
  hp: number;
  readonly maxHp: number;
  /** Progress along the ring, 0..1 (1 = lap complete → breaches the core). */
  t: number;
  /** Arena-space position, refreshed each step from the path. */
  x: number;
  y: number;
  alive: boolean;
  /** Set when removed by completing the lap (vs. being killed). */
  leaked: boolean;
}

/** A firing tower derived from a placed card. */
export interface SimTower {
  readonly slotIndex: number;
  readonly element: ElementId;
  x: number;
  y: number;
  /** Targeting radius in arena pixels. */
  range: number;
  /** Damage per shot (already grade-scaled by the caller). */
  damage: number;
  /** Base seconds between shots. */
  cooldown: number;
  /** Seconds until the next shot is ready. */
  cdLeft: number;
  /** Duration the current cooldown was started with (for the HUD dial); 0 = ready. */
  cdMax: number;
}

/** Spec the scene feeds in for each attacking tower (the sim tracks the cooldown). */
export type TowerSpec = Omit<SimTower, 'cdLeft' | 'cdMax'>;

/** An in-flight projectile homing on its target enemy. */
export interface SimProjectile {
  readonly id: number;
  x: number;
  y: number;
  readonly target: SimEnemy;
  readonly speed: number;
  readonly damage: number;
  readonly element: ElementId;
  alive: boolean;
}

export type SimStatus = 'idle' | 'running' | 'victory' | 'defeat';
export type WavePhase = 'countdown' | 'spawning' | 'active';

export interface SimCallbacks {
  onEnemyKilled?(enemy: SimEnemy): void;
  onEnemyLeaked?(enemy: SimEnemy): void;
  onTowerFired?(slotIndex: number, target: SimEnemy): void;
  /** A projectile actually connected (vs. fizzling on an already-dead target). */
  onProjectileHit?(x: number, y: number, element: ElementId): void;
  onWaveStart?(waveNumber: number): void;
  onWaveCleared?(waveNumber: number): void;
  onVictory?(): void;
  onDefeat?(): void;
}

export interface BattleSimOptions {
  path: ArenaPath;
  waves: WaveDef[];
  /** Arena image width — converts the fractional combat-rule radii into pixels. */
  arenaWidth: number;
  coreMax: number;
  callbacks?: SimCallbacks;
}

/** One queued spawn: wait `gap` seconds (since the previous spawn) then spawn `def`. */
interface QueuedSpawn {
  def: EnemyDef;
  gap: number;
}

/**
 * Headless battle simulation: drives waves, enemy movement, tower targeting &
 * firing, projectiles, the core's integrity and win/lose — all in arena
 * coordinates, with no PixiJS dependency. The scene calls {@link update} each
 * frame and reads {@link enemies}/{@link projectiles} to sync its sprites.
 */
export class BattleSim {
  readonly enemies: SimEnemy[] = [];
  readonly projectiles: SimProjectile[] = [];
  private towers: SimTower[] = [];

  status: SimStatus = 'idle';
  wavePhase: WavePhase = 'countdown';
  /** Seconds left on the pre-wave / intermission timer (meaningful during 'countdown'). */
  countdown = FIRST_WAVE_DELAY;

  readonly coreMax: number;
  coreHp: number;

  /** Global fire-rate multiplier (>1 faster, <1 slower); set by the scene from energy state. */
  fireRateMult = 1;

  private readonly path: ArenaPath;
  private readonly waves: WaveDef[];
  private readonly cb: SimCallbacks;
  private readonly hitRadius: number;
  private readonly projectileSpeed: number;

  /** Zero-based index of the wave being fought; -1 before the first one. */
  private waveIndex = -1;
  private spawnQueue: QueuedSpawn[] = [];
  private spawnTimer = 0;
  private enemySeq = 0;
  private projSeq = 0;

  constructor(opts: BattleSimOptions) {
    this.path = opts.path;
    this.waves = opts.waves;
    this.coreMax = opts.coreMax;
    this.coreHp = opts.coreMax;
    this.cb = opts.callbacks ?? {};
    this.hitRadius = PROJECTILE_HIT_FRAC * opts.arenaWidth;
    this.projectileSpeed = PROJECTILE_SPEED_FRAC * opts.arenaWidth;
  }

  /** 1-based number of the current/next wave for the HUD. */
  get waveNumber(): number {
    return Math.min(this.waveIndex + 1, this.waves.length);
  }

  get totalWaves(): number {
    return this.waves.length;
  }

  /** 1-based number of the wave that the current countdown will start next. */
  get nextWaveNumber(): number {
    return Math.min(this.waveIndex + 2, this.waves.length);
  }

  /** Begin the battle (first wave after the opening countdown). */
  start(): void {
    if (this.status !== 'idle') return;
    this.status = 'running';
    this.wavePhase = 'countdown';
    this.countdown = FIRST_WAVE_DELAY;
  }

  /**
   * Replace the firing towers (called when the platform changes). Cooldown
   * progress is preserved per slot so re-placing a card never resets the rest
   * of the grid's timers.
   */
  setTowers(specs: TowerSpec[]): void {
    const prev = new Map(this.towers.map((t) => [t.slotIndex, t]));
    this.towers = specs.map((s) => {
      const p = prev.get(s.slotIndex);
      return { ...s, cdLeft: p?.cdLeft ?? 0, cdMax: p?.cdMax ?? 0 };
    });
  }

  /**
   * Cooldown progress for the tower in `slotIndex`: 1 right after it fires,
   * shrinking to 0 as it becomes ready again (0 if there is no attacking tower
   * there or it is idle). Drives the slot's mini cooldown dial.
   */
  cooldownFrac(slotIndex: number): number {
    const tower = this.towers.find((t) => t.slotIndex === slotIndex);
    if (!tower || tower.cdMax <= 0 || tower.cdLeft <= 0) return 0;
    return Math.min(1, tower.cdLeft / tower.cdMax);
  }

  update(dt: number): void {
    if (this.status !== 'running') return;

    this.tickWaveSpawning(dt);
    this.moveEnemies(dt);
    this.fireTowers(dt);
    this.moveProjectiles(dt);

    // Reap dead projectiles and enemies (the view detects removal via callbacks /
    // disappearing ids and plays its own impact / death animations).
    this.reap(this.projectiles);
    this.reap(this.enemies);

    // Defeat takes precedence over a wave clear in the same frame (e.g. the last
    // enemy of the last wave breaches the core: that is a loss, not a victory).
    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.status = 'defeat';
      this.cb.onDefeat?.();
      return;
    }
    this.checkWaveCleared();
  }

  // --- Waves ---------------------------------------------------------------

  private tickWaveSpawning(dt: number): void {
    if (this.wavePhase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startNextWave();
      return;
    }
    if (this.wavePhase !== 'spawning') return;

    this.spawnTimer -= dt;
    // A single frame may release several enemies if it was long (or gaps are tiny).
    while (this.wavePhase === 'spawning' && this.spawnTimer <= 0 && this.spawnQueue.length > 0) {
      const next = this.spawnQueue.shift()!;
      this.spawnEnemy(next.def);
      const upcoming = this.spawnQueue[0];
      if (upcoming) this.spawnTimer += upcoming.gap;
      else this.wavePhase = 'active';
    }
  }

  private startNextWave(): void {
    this.waveIndex++;
    const wave = this.waves[this.waveIndex];
    if (!wave) {
      // No more waves queued — nothing to spawn (victory is handled on clear).
      this.wavePhase = 'active';
      return;
    }
    this.spawnQueue = [];
    for (const group of wave.groups) {
      if (group.count <= 0) continue;
      const def = getEnemy(group.enemyId);
      for (let i = 0; i < group.count; i++) this.spawnQueue.push({ def, gap: group.gap });
    }
    this.cb.onWaveStart?.(this.waveNumber);
    if (this.spawnQueue.length === 0) {
      // Degenerate wave (no groups / all zero-count): nothing to spawn — treat it
      // as fully spawned so checkWaveCleared advances next frame (no soft-lock).
      this.wavePhase = 'active';
      return;
    }
    this.wavePhase = 'spawning';
    // Small lead-in before the first enemy of the wave appears.
    this.spawnTimer = Math.min(0.5, this.spawnQueue[0]?.gap ?? 0.5);
  }

  private checkWaveCleared(): void {
    if (this.status !== 'running') return;
    if (this.wavePhase !== 'active') return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;

    const clearedNumber = this.waveIndex + 1;
    this.cb.onWaveCleared?.(clearedNumber);

    if (this.waveIndex >= this.waves.length - 1) {
      this.status = 'victory';
      this.cb.onVictory?.();
      return;
    }
    this.wavePhase = 'countdown';
    this.countdown = WAVE_INTERMISSION;
  }

  private spawnEnemy(def: EnemyDef): void {
    const p = this.path.pointAt(0);
    this.enemies.push({
      id: this.enemySeq++,
      def,
      hp: def.maxHp,
      maxHp: def.maxHp,
      t: 0,
      x: p.x,
      y: p.y,
      alive: true,
      leaked: false,
    });
  }

  // --- Movement / combat ---------------------------------------------------

  private moveEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += e.def.speed * dt;
      if (e.t >= 1) {
        const end = this.path.pointAt(1);
        e.x = end.x;
        e.y = end.y;
        e.alive = false;
        e.leaked = true;
        this.coreHp -= e.def.coreDamage;
        this.cb.onEnemyLeaked?.(e);
      } else {
        const p = this.path.pointAt(e.t);
        e.x = p.x;
        e.y = p.y;
      }
    }
  }

  private fireTowers(dt: number): void {
    const mult = Math.max(this.fireRateMult, 0.1);
    for (const tower of this.towers) {
      if (tower.cdLeft > 0) {
        tower.cdLeft -= dt;
        if (tower.cdLeft > 0) continue;
      }
      const target = this.acquireTarget(tower);
      if (!target) {
        tower.cdLeft = 0; // stay ready; fire the instant a target enters range
        continue;
      }
      this.fireProjectile(tower, target);
      tower.cdLeft = tower.cooldown / mult;
      tower.cdMax = tower.cdLeft;
    }
  }

  /** The enemy furthest along the ring that is within the tower's range. */
  private acquireTarget(tower: SimTower): SimEnemy | null {
    let best: SimEnemy | null = null;
    const r2 = tower.range * tower.range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - tower.x;
      const dy = e.y - tower.y;
      if (dx * dx + dy * dy > r2) continue;
      if (!best || e.t > best.t) best = e;
    }
    return best;
  }

  private fireProjectile(tower: SimTower, target: SimEnemy): void {
    this.projectiles.push({
      id: this.projSeq++,
      x: tower.x,
      y: tower.y,
      target,
      speed: this.projectileSpeed,
      damage: tower.damage,
      element: tower.element,
      alive: true,
    });
    this.cb.onTowerFired?.(tower.slotIndex, target);
  }

  private moveProjectiles(dt: number): void {
    const step = this.projectileSpeed * dt;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (!p.target.alive) {
        p.alive = false; // target already gone — fizzle
        continue;
      }
      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= this.hitRadius || d <= step) {
        p.x = p.target.x;
        p.y = p.target.y;
        p.alive = false;
        this.cb.onProjectileHit?.(p.x, p.y, p.element);
        this.damageEnemy(p.target, p.damage);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  private damageEnemy(enemy: SimEnemy, amount: number): void {
    if (!enemy.alive) return;
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      this.cb.onEnemyKilled?.(enemy);
    }
  }

  private reap<T extends { alive: boolean }>(list: T[]): void {
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i]!.alive) list.splice(i, 1);
    }
  }
}

/** Damage / cooldown / range a card resolves to at a given merge grade. */
export interface ResolvedTowerStats {
  damage: number;
  cooldown: number;
  /** Attack radius in grid cells (0 = does not attack). */
  rangeCells: number;
}

/**
 * Resolve an attacking card's stats at `grade`. Merging upgrades exactly one
 * dimension per card (CardDef.upgrade): 'power' scales damage, 'tempo' scales
 * fire rate (shrinks cooldown), 'range' scales the attack radius.
 */
export function towerStats(def: CardDef, grade: number): ResolvedTowerStats {
  const i = Math.min(Math.max(grade, 1), 3) - 1;
  const power = def.upgrade === 'power' ? POWER_MULT[i]! : 1;
  const tempo = def.upgrade === 'tempo' ? TEMPO_MULT[i]! : 1;
  const range = def.upgrade === 'range' ? RANGE_MULT[i]! : 1;
  return {
    damage: Math.round((def.baseDamage ?? 0) * power),
    cooldown: (def.cooldown ?? 1) / tempo,
    rangeCells: (def.rangeCells ?? 0) * range,
  };
}

/** Effective global fire-rate multiplier from the current energy state. */
export function fireRateFromEnergy(load: number, capacity: number, overdrive: boolean): number {
  const effectiveCap = capacity + (overdrive ? OVERDRIVE_CAPACITY_BONUS : 0);
  const overload = Math.max(0, load - effectiveCap);
  return 1 / (1 + OVERLOAD_FIRE_PENALTY * overload);
}
