import type { ElementId } from '../theme';
import type { CardDef, EnemyDef, ReactionId, WaveDef } from '../config/types';
import { t } from '../core/i18n';
import type { Rng } from './rng';
import { getEnemy } from '../config/enemies';
import { buildSpawnQueue } from '../data/waveRules';
import { cardGrade, cardLoad, hasHybridPerk, towerMuzzleFrac } from '../config/cards';
import {
  shotStyle,
  BALLISTIC_ARC,
  BALLISTIC_SPEED_MULT,
  HOMING_ACCEL_MULT,
  HOMING_MAX_MULT,
  HOMING_START_MULT,
} from '../config/projectiles';
import {
  AOE_SPLASH_FRAC,
  AURA_HASTE_CAP_PCT,
  AURA_SHIELD_DECAY_PER_SEC,
  BARRIER_COOLDOWN_SEC,
  CHAIN_FALLOFF,
  CHAIN_RADIUS_FRAC,
  DISRUPTOR_JAM_RANGE_FRAC,
  FIRST_WAVE_DELAY,
  FROST_FREEZE_RADIUS_FRAC,
  HYBRID_SLOW_WET_BONUS,
  HYBRID_STEAM_BURST_FRAC,
  INTERRUPT_STUN_SEC,
  OVERLOAD_FIRE_FLOOR,
  OVERLOAD_FIRE_PENALTY_PER_LOAD,
  PLASMA_SHOCKWAVE_FRAC,
  PLASMA_SLOW_PROJECTILE_MULT,
  PROJECTILE_HIT_FRAC,
  PROJECTILE_SPEED_FRAC,
  RAILGUN_BEAM_HALF_WIDTH_FRAC,
  SHRAPNEL_AOE_MULT,
  SLOW_REFRESH_SEC,
  STEAM_DOT_DPS,
  STEAM_DOT_SEC,
  STEAM_SLOW,
  SUPERCONDUCT_STUN_CHANCE,
  SUPERCONDUCT_STUN_SEC,
  SUPERCONDUCT_TEMPO_MULT,
  WAVE_INTERMISSION,
  WET_DAMAGE_MULT,
} from '../config/combatRules';
import type { ArenaPath } from './path';

// --- Runtime entities (plain state; the view mirrors these into sprites) -----

/** A live enemy walking the ring. */
export interface SimEnemy {
  readonly id: number;
  readonly def: EnemyDef;
  hp: number;
  readonly maxHp: number;
  /** Gold awarded on kill — `def.bounty` already scaled by the level's tier (bountyScale). */
  readonly bounty: number;
  /** Progress along the ring, 0..1 (1 = lap complete → breaches the core). */
  t: number;
  /** Arena-space position, refreshed each step from the path. */
  x: number;
  y: number;
  alive: boolean;
  /** Set when removed by completing the lap (vs. being killed). */
  leaked: boolean;
  // --- Statuses (sim-clock deadlines, in seconds) ---
  /** Movement is multiplied by `slowFactor` until this time. */
  slowUntil: number;
  /** Remaining slow strength: 0.5 = move at 50% speed. */
  slowFactor: number;
  /** Wet until this time → takes extra Electricity damage. */
  wetUntil: number;
  /** Frozen/held in place until this time (barrier hold or stun). */
  stunUntil: number;
  /** Damage-over-time (Steam) until this time. */
  dotUntil: number;
  dotDps: number;
  /** Disruptor only (v3 §2.Г): seconds until its next interrupt attempt. */
  interruptCd: number;
  /**
   * Move-speed multiplier from nearby Resonance Motes (1 = none; capped). Recomputed
   * each frame by {@link BattleSim.tickAuras} (docs/done/support-enemies.md).
   */
  hasteMult: number;
  /** Aegis-Beacon ally shield: absorbs flat damage before HP, decays when unrefreshed. */
  shield: number;
  /** High-water shield value granted (for the view's shield-bubble fraction); 0 = never shielded. */
  shieldMax: number;
}

/** On-hit payload a tower stamps onto its shots / strikes. */
export interface HitEffects {
  aoeRadius: number; // px (0 = single target)
  splashFrac: number;
  /** Frost freeze radius in px (v3 §5): slow/Wet land on everyone within this of the impact (0 = struck target only). */
  freezeRadius: number;
  slowFactor: number; // 0 = none
  slowSec: number;
  wetSec: number;
  dotDps: number;
  dotSec: number;
  stunChance: number;
  stunSec: number;
  vsWetMult: number; // 1 = none (Storm = 2)
  /** Bonus damage vs slowed or Wet targets (Icebreaker, v2 §6.5). */
  vsSlowWetMult: number;
  chainTargets: number; // 1 = no chain
  /** Chain hops after a pierce beam (Gauss Coil, v2 §6.5). */
  chainAfterPierce: number;
}

/** A firing tower derived from a placed card + its synergy. */
export interface SimTower extends HitEffects {
  readonly slotIndex: number;
  readonly element: ElementId;
  /** Firing tower's iconKey → the renderer picks its shot sprite & travel style. */
  readonly iconKey: string;
  x: number;
  y: number;
  /** Targeting radius in arena pixels. */
  range: number;
  /** Damage per shot (grade + neighbor-buff scaled by the caller). */
  damage: number;
  /** Base seconds between shots. */
  cooldown: number;
  /** Seconds until the next shot is ready. */
  cdLeft: number;
  /** Duration the current cooldown was started with (for the HUD dial); 0 = ready. */
  cdMax: number;
  /** Strikes every enemy along a pierced line through the lead target (Railgun, v3 §6). */
  pierce: boolean;
  /** Plasma shockwave mode (v3 §5): a slow, non-homing round detonating at the aim point. */
  slowProjectile: boolean;
  /**
   * Barrel length from the slot center to the muzzle, in arena pixels. Shots and
   * the muzzle flash spawn this far along the aim direction (so the bolt appears
   * to leave the gun tip, not the tower center). 0 for static / center-firing towers.
   */
  muzzleLen: number;
  /** Holds the lead enemy still for this many seconds, then long recharge (Shield). */
  barrierSec: number;
  /** Network load this tower draws — scales its overload fire-rate penalty (v3 §3.А). */
  readonly load: number;
  /**
   * Graduated interrupt resistance from neighboring Shields (v3 §2.Г): 0 = none,
   * approaching 1 = full. It scales *down* both the chance a Disruptor's interrupt
   * lands and the chance a landed one crits into a stun (vs. a mere glitch). At ≥ 1
   * the tower is fully immune ({@link interruptImmune} is set).
   */
  defense: number;
  /**
   * Fully immune to Disruptor interrupts: either positionally (central / road-far
   * slot the saboteur can never reach) or from stacked Shield defense (≥ 1; v3 §2.Г).
   */
  interruptImmune: boolean;
  /** Sim-clock deadline this tower is locked (stunned) until; 0 = free to fire. */
  disabledUntil: number;
  /**
   * Last acquired lead-target position (arena coords), refreshed every frame so
   * the renderer can rotate the turret to track it even between shots. Only valid
   * when {@link hasAim}; the renderer reads it via {@link BattleSim.towerAim}.
   */
  aimX: number;
  aimY: number;
  hasAim: boolean;
}

/**
 * Spec the scene feeds in for each tower; the sim owns the per-frame runtime
 * state (cooldown + interrupt-stun), so those are filled in by {@link BattleSim.setTowers}.
 */
export type TowerSpec = Omit<
  SimTower,
  'cdLeft' | 'cdMax' | 'disabledUntil' | 'aimX' | 'aimY' | 'hasAim'
>;

/**
 * An in-flight projectile, carrying its on-hit effects. Homes on its target enemy
 * unless {@link firePos} is set (Plasma shockwave mode), in which case it travels
 * to that fixed point and detonates there regardless of where the target went.
 */
export interface SimProjectile extends HitEffects {
  readonly id: number;
  x: number;
  y: number;
  readonly target: SimEnemy;
  /** Fixed aim point for a non-homing shockwave / ballistic-lob shot; undefined = homing. */
  readonly firePos?: { x: number; y: number };
  readonly speed: number;
  readonly damage: number;
  readonly element: ElementId;
  alive: boolean;
  // --- Cosmetic carry-through for the renderer (sim stays authoritative on hits) ---
  /** Muzzle the shot left from (for the view's ballistic-arc progress fraction). */
  readonly originX: number;
  readonly originY: number;
  /** Ballistic arc peak as a fraction of arena width (0 = flat / homing). */
  readonly arcPeak: number;
  /** Homing self-acceleration in px/s² (0 = constant `speed`); ramps `curSpeed` to the `speed` cap. */
  readonly accel: number;
  /** Runtime ramped speed for accelerating shots (px/s). */
  curSpeed?: number;
  /** iconKey of the firing tower → the view picks the shot sprite/style. */
  readonly sourceIcon: string;
}

export type SimStatus = 'idle' | 'running' | 'victory' | 'defeat';
export type WavePhase = 'countdown' | 'spawning' | 'active';

export interface SimCallbacks {
  onEnemyKilled?(enemy: SimEnemy): void;
  onEnemyLeaked?(enemy: SimEnemy): void;
  /** An enemy took a discrete hit — `amount` already folds in the Wet bonus; `crit` = a Wet x2 strike; `element` = the source tower's element (for per-tower hit SFX). */
  onEnemyDamaged?(enemy: SimEnemy, amount: number, crit: boolean, element: ElementId): void;
  /** A Disruptor jammed a tower (v3 §2.Г): `stun` = locked for a beat, else a glitched shot. */
  onTowerInterrupted?(slotIndex: number, kind: 'glitch' | 'stun', x: number, y: number): void;
  /** A tower fired; `originX/originY` is the muzzle (gun tip) the shot left from. */
  onTowerFired?(slotIndex: number, target: SimEnemy, originX: number, originY: number): void;
  /** A projectile actually connected (vs. fizzling on an already-dead target). */
  onProjectileHit?(x: number, y: number, element: ElementId): void;
  /** A chain-lightning hop / pierce beam — draw a line (+ tracer slug) between two points. `iconKey` = source tower, for the tracer sprite. */
  onBeam?(x1: number, y1: number, x2: number, y2: number, element: ElementId, iconKey?: string): void;
  /** A Shield barrier engaged on the road at (x,y). */
  onBarrier?(x: number, y: number): void;
  onWaveStart?(waveNumber: number): void;
  onWaveCleared?(waveNumber: number, perfect: boolean): void;
  onVictory?(): void;
  onDefeat?(): void;
}

export interface BattleSimOptions {
  path: ArenaPath;
  waves: WaveDef[];
  /** Arena image width — converts the fractional combat-rule radii into pixels. */
  arenaWidth: number;
  coreMax: number;
  /** Per-level difficulty tier: every spawned enemy's maxHp is multiplied by this (default 1). */
  hpScale?: number;
  /** Per-level reward tier: every spawned enemy's bounty is multiplied by this (default 1). */
  bountyScale?: number;
  callbacks?: SimCallbacks;
  /**
   * Optional seeded PRNG. When set, stun/interrupt rolls use a per-enemy sub-stream
   * (FPS-independent, reproducible). When omitted, the legacy clock-based sin-hash
   * is used → production behaviour is byte-for-byte unchanged.
   */
  rng?: Rng;
}

/** One queued spawn: wait `gap` seconds (since the previous spawn) then spawn `def`. */
interface QueuedSpawn {
  def: EnemyDef;
  gap: number;
}

/**
 * Headless battle simulation: drives waves, enemy movement & statuses, tower
 * targeting & firing (projectiles, chain lightning, pierce lines, barriers),
 * resonance on-hit effects, the core's integrity and win/lose — all in arena
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

  /**
   * Network overload — units of load past capacity; set by the scene each frame.
   * Each firing tower's fire rate is then cut in proportion to its *own* load
   * (v3 §3.А), so heavy turrets dim first while light support barely slows.
   */
  overload = 0;

  /** Monotonic sim clock (seconds) — status deadlines are measured against this. */
  private clock = 0;

  /** Read-only sim clock, so the scene can evaluate per-enemy status deadlines (Wet/slow/DoT) for overlays. */
  get now(): number {
    return this.clock;
  }

  /** Optional seeded PRNG + per-enemy sub-streams (see BattleSimOptions.rng). */
  private rng?: Rng;
  private enemyRng = new Map<number, Rng>();

  private readonly path: ArenaPath;
  private readonly waves: WaveDef[];
  /** Per-level difficulty/reward tiers, applied per-instance at spawn (default 1). */
  private readonly hpScale: number;
  private readonly bountyScale: number;
  private readonly cb: SimCallbacks;
  private readonly hitRadius: number;
  private readonly projectileSpeed: number;
  private readonly chainRadius: number;
  /** Perpendicular half-width of a Railgun pierce line, in px. */
  private readonly railgunBand: number;
  /** Reach within which a Disruptor jams a tower, in px. */
  private readonly jamRange: number;
  /** Arena image width in px — converts fractional aura radii (support mobs) to px. */
  private readonly arenaWidth: number;

  /** Zero-based index of the wave being fought; -1 before the first one. */
  private waveIndex = -1;
  private spawnQueue: QueuedSpawn[] = [];
  private spawnTimer = 0;
  private enemySeq = 0;
  private projSeq = 0;
  /** Whether the current wave has leaked any enemy (clears Perfect Clear). */
  private waveLeaked = false;

  constructor(opts: BattleSimOptions) {
    this.path = opts.path;
    this.waves = opts.waves;
    this.hpScale = opts.hpScale ?? 1;
    this.bountyScale = opts.bountyScale ?? 1;
    this.coreMax = opts.coreMax;
    this.coreHp = opts.coreMax;
    this.cb = opts.callbacks ?? {};
    this.hitRadius = PROJECTILE_HIT_FRAC * opts.arenaWidth;
    this.projectileSpeed = PROJECTILE_SPEED_FRAC * opts.arenaWidth;
    this.chainRadius = CHAIN_RADIUS_FRAC * opts.arenaWidth;
    this.railgunBand = RAILGUN_BEAM_HALF_WIDTH_FRAC * opts.arenaWidth;
    this.jamRange = DISRUPTOR_JAM_RANGE_FRAC * opts.arenaWidth;
    this.arenaWidth = opts.arenaWidth;
    this.rng = opts.rng;
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
      return {
        ...s,
        cdLeft: p?.cdLeft ?? 0,
        cdMax: p?.cdMax ?? 0,
        disabledUntil: p?.disabledUntil ?? 0,
        aimX: p?.aimX ?? 0,
        aimY: p?.aimY ?? 0,
        hasAim: p?.hasAim ?? false,
      };
    });
  }

  /**
   * Cooldown progress for the tower in `slotIndex`: 1 right after it fires,
   * shrinking to 0 as it becomes ready again (0 if there is no tower there or it
   * is idle). Drives the slot's mini cooldown dial.
   */
  cooldownFrac(slotIndex: number): number {
    const tower = this.towers.find((t) => t.slotIndex === slotIndex);
    if (!tower || tower.cdMax <= 0 || tower.cdLeft <= 0) return 0;
    return Math.min(1, tower.cdLeft / tower.cdMax);
  }

  /**
   * The lead-target position the tower in `slotIndex` is currently tracking
   * (arena = scene coords), or null if it has no target in range. The renderer
   * turns this into an aim angle to rotate/select the turret's facing.
   */
  towerAim(slotIndex: number): { x: number; y: number } | null {
    const tower = this.towers.find((t) => t.slotIndex === slotIndex);
    return tower && tower.hasAim ? { x: tower.aimX, y: tower.aimY } : null;
  }

  update(dt: number): void {
    if (this.status !== 'running') return;
    this.clock += dt;

    this.tickWaveSpawning(dt);
    this.tickAuras(dt);
    this.moveEnemies(dt);
    this.tickStatuses(dt);
    this.tickInterrupts(dt);
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
    this.waveLeaked = false;
    const wave = this.waves[this.waveIndex];
    if (!wave) {
      // No more waves queued — nothing to spawn (victory is handled on clear).
      this.wavePhase = 'active';
      return;
    }
    this.spawnQueue = buildSpawnQueue(wave, getEnemy);
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
    this.cb.onWaveCleared?.(clearedNumber, !this.waveLeaked);

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
    // Apply the level's tier multipliers per-instance — never mutate the shared
    // frozen EnemyDef. maxHp scales difficulty; bounty travels on the instance so
    // the kill reward (read by the scene) matches the scaled fight.
    const maxHp = Math.round(def.maxHp * this.hpScale);
    this.enemies.push({
      id: this.enemySeq++,
      def,
      hp: maxHp,
      maxHp,
      bounty: Math.round(def.bounty * this.bountyScale),
      t: 0,
      x: p.x,
      y: p.y,
      alive: true,
      leaked: false,
      slowUntil: 0,
      slowFactor: 1,
      wetUntil: 0,
      stunUntil: 0,
      dotUntil: 0,
      dotDps: 0,
      interruptCd: def.interruptInterval ?? 0,
      hasteMult: 1,
      shield: 0,
      shieldMax: 0,
    });
  }

  // --- Movement / statuses -------------------------------------------------

  private moveEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // Held (barrier / stun) → no advance this frame.
      if (e.stunUntil > this.clock) continue;
      const slow = e.slowUntil > this.clock ? e.slowFactor : 1;
      e.t += e.def.speed * slow * e.hasteMult * dt;
      if (e.t >= 1) {
        const end = this.path.pointAt(1);
        e.x = end.x;
        e.y = end.y;
        e.alive = false;
        e.leaked = true;
        this.waveLeaked = true;
        this.coreHp -= e.def.coreDamage;
        this.cb.onEnemyLeaked?.(e);
      } else {
        const p = this.path.pointAt(e.t);
        e.x = p.x;
        e.y = p.y;
      }
    }
  }

  private tickStatuses(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // Tick DoT, then clear lapsed statuses so a stale magnitude can't bleed into
      // a later, weaker application (see applyHit).
      if (e.dotUntil > this.clock) {
        if (e.dotDps > 0) this.damageEnemy(e, e.dotDps * dt);
      } else if (e.dotDps !== 0) {
        e.dotDps = 0;
      }
      if (e.slowUntil <= this.clock && e.slowFactor !== 1) e.slowFactor = 1;
    }
  }

  /**
   * Support-mob auras (docs/done/support-enemies.md): the "enemies synergize"
   * mirror, recomputed every frame. Resonance Mote hastes the pack (additive %,
   * globally capped — no runaway stack); Coolant Mender repairs wounded *fighters*
   * (never itself or other support mobs, so menders can't form an immortal duet);
   * Aegis Beacon tops up an ally shield that decays once no beacon refreshes it.
   * All effects skip the source itself.
   */
  private tickAuras(dt: number): void {
    let hasteBonus: Map<number, number> | null = null;
    const refreshed = new Set<number>();

    for (const s of this.enemies) {
      if (!s.alive || s.def.auraRadiusFrac === undefined) continue;
      const r2 = (s.def.auraRadiusFrac * this.arenaWidth) ** 2;
      for (const e of this.enemies) {
        if (e === s || !e.alive) continue;
        if (this.dist2(s.x, s.y, e.x, e.y) > r2) continue;
        if (s.def.auraHastePct) {
          hasteBonus ??= new Map();
          hasteBonus.set(e.id, (hasteBonus.get(e.id) ?? 0) + s.def.auraHastePct);
        }
        if (s.def.auraHealPerSec && e.def.archetype !== 'support' && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + s.def.auraHealPerSec * dt);
        }
        if (s.def.allyShieldHp) {
          e.shield = Math.max(e.shield, s.def.allyShieldHp);
          e.shieldMax = Math.max(e.shieldMax, s.def.allyShieldHp);
          refreshed.add(e.id);
        }
      }
    }

    // Apply the (capped) haste and decay any shield no beacon refreshed this frame.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const b = hasteBonus?.get(e.id);
      e.hasteMult = b ? 1 + Math.min(AURA_HASTE_CAP_PCT, b) / 100 : 1;
      if (e.shield > 0 && !refreshed.has(e.id)) {
        e.shield = Math.max(0, e.shield - AURA_SHIELD_DECAY_PER_SEC * dt);
      }
    }
  }

  // --- Firing --------------------------------------------------------------

  private fireTowers(dt: number): void {
    for (const tower of this.towers) {
      // Refresh the aim every frame (before any stun/cooldown early-out) so the
      // turret can visibly track the lead enemy between shots and while jammed.
      const target = this.acquireTarget(tower);
      if (target) {
        tower.aimX = target.x;
        tower.aimY = target.y;
        tower.hasAim = true;
      } else {
        tower.hasAim = false;
      }

      // Interrupt stun (v3 §2.Г): the tower is locked — its cooldown is frozen
      // until the stun lapses, then it resumes from where it was.
      if (tower.disabledUntil > this.clock) continue;

      if (tower.cdLeft > 0) {
        tower.cdLeft -= dt;
        if (tower.cdLeft > 0) continue;
      }
      if (!target) {
        tower.cdLeft = 0; // stay ready; fire the instant a target enters range
        continue;
      }

      // Overload throttles this tower's fire rate in proportion to its own load.
      const mult = towerFireRateMult(this.overload, tower.load);

      const muzzle = this.muzzleOrigin(tower, tower.aimX, tower.aimY);

      if (tower.barrierSec > 0) {
        // Shield: hold the lead enemy still, then a long recharge.
        target.stunUntil = Math.max(target.stunUntil, this.clock + tower.barrierSec);
        this.cb.onBarrier?.(target.x, target.y);
        this.cb.onTowerFired?.(tower.slotIndex, target, muzzle.x, muzzle.y);
        tower.cdLeft = BARRIER_COOLDOWN_SEC / mult;
        tower.cdMax = tower.cdLeft;
        continue;
      }

      if (tower.pierce) {
        this.firePierceLine(tower, target);
        this.cb.onTowerFired?.(tower.slotIndex, target, muzzle.x, muzzle.y);
      } else {
        this.fireProjectile(tower, target);
        this.cb.onTowerFired?.(tower.slotIndex, target, muzzle.x, muzzle.y);
      }
      tower.cdLeft = tower.cooldown / mult;
      tower.cdMax = tower.cdLeft;
    }
  }

  /**
   * Railgun pierce (v3 §6): a straight beam from the turret through its lead
   * target, striking every enemy within {@link railgunBand} of that ray, out to
   * the tower's range (= the signature line length). One beam is drawn for the
   * whole line rather than a spoke to each enemy.
   */
  private firePierceLine(tower: SimTower, lead: SimEnemy): void {
    const ang = Math.atan2(lead.y - tower.y, lead.x - tower.x);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const len = tower.range;
    const band = this.railgunBand;
    const pierced: SimEnemy[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const rx = e.x - tower.x;
      const ry = e.y - tower.y;
      const along = rx * dx + ry * dy; // distance along the beam
      if (along < -band || along > len) continue;
      const perp = Math.abs(rx * dy - ry * dx); // perpendicular distance from the beam
      if (perp > band) continue;
      pierced.push(e);
      this.applyHit(e, tower.damage, tower);
      if (tower.aoeRadius > 0) this.applyAoESplash(e.x, e.y, tower.damage, tower, e);
    }
    // Draw the tracer from the barrel tip (muzzle), not the turret center.
    const muzzle = this.muzzleOrigin(tower, lead.x, lead.y);
    this.cb.onBeam?.(muzzle.x, muzzle.y, tower.x + dx * len, tower.y + dy * len, tower.element, tower.iconKey);
    if (tower.chainAfterPierce > 0) {
      const hit = new Set<SimEnemy>(pierced);
      let from = lead;
      let dmg = tower.damage;
      for (let hop = 0; hop < tower.chainAfterPierce; hop++) {
        const next = this.nearestUnhit(from.x, from.y, hit);
        if (!next) break;
        dmg *= CHAIN_FALLOFF;
        this.applyHit(next, dmg, tower);
        this.cb.onBeam?.(from.x, from.y, next.x, next.y, tower.element, tower.iconKey);
        hit.add(next);
        from = next;
      }
    }
  }

  /**
   * Disruptor interrupts (v3 §2.Г): a saboteur skirting the platform jams the
   * nearest non-immune turret on a timer — glitching its current shot, or (on a
   * crit) stunning it for a beat. Central and Shield-buffed towers are immune.
   */
  private tickInterrupts(dt: number): void {
    if (this.towers.length === 0) return;
    for (const e of this.enemies) {
      if (!e.alive || e.def.archetype !== 'disruptor') continue;
      // Only while it is actually on the road skirting the platform (not the
      // off-screen approach or the instant it breaches).
      if (e.t < 0.05 || e.t > 0.97) continue;
      e.interruptCd -= dt;
      if (e.interruptCd > 0) continue;
      e.interruptCd = e.def.interruptInterval ?? 1.6;

      const tower = this.nearestJammableTower(e.x, e.y);
      if (!tower) continue;
      // Two-layer interrupt (v3 §2.Г): a tower's Shield-fed `defense` first grants a
      // graduated chance to ignore the jam outright (full defense ≥ 1 was already
      // filtered out as interrupt-immune), and additionally softens the crit — so a
      // half-defended tower takes interrupts at ~half rate and stuns less often.
      const resist = 1 - Math.min(1, Math.max(0, tower.defense));
      if (!this.roll((e.def.interruptChance ?? 0.6) * resist, e)) continue; // tower shrugged it off

      if (this.roll((e.def.interruptCrit ?? 0.25) * resist, e)) {
        // Crit → short stun (and reset the in-progress shot).
        tower.disabledUntil = Math.max(tower.disabledUntil, this.clock + INTERRUPT_STUN_SEC);
        tower.cdLeft = tower.cooldown;
        tower.cdMax = tower.cooldown;
        this.cb.onTowerInterrupted?.(tower.slotIndex, 'stun', tower.x, tower.y);
      } else {
        // Glitch → the current shot is scrubbed and recharges.
        tower.cdLeft = tower.cooldown;
        tower.cdMax = tower.cooldown;
        this.cb.onTowerInterrupted?.(tower.slotIndex, 'glitch', tower.x, tower.y);
      }
    }
  }

  /** Nearest non-immune, not-already-stunned tower within jam range of a point. */
  private nearestJammableTower(x: number, y: number): SimTower | null {
    let best: SimTower | null = null;
    let bestD = this.jamRange * this.jamRange;
    for (const t of this.towers) {
      if (t.interruptImmune || t.disabledUntil > this.clock) continue;
      const d = this.dist2(x, y, t.x, t.y);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** The enemy furthest along the ring that is within the tower's range. */
  private acquireTarget(tower: SimTower): SimEnemy | null {
    let best: SimEnemy | null = null;
    const r2 = tower.range * tower.range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (this.dist2(e.x, e.y, tower.x, tower.y) > r2) continue;
      if (!best || e.t > best.t) best = e;
    }
    return best;
  }

  /**
   * Where this tower's shot leaves it (arena coords): offset from the slot center
   * by {@link SimTower.muzzleLen} along the aim direction so a rotating turret
   * fires from its barrel tip, not its center. Static towers (muzzleLen 0) just
   * use the center. `tx/ty` is the point being aimed at.
   */
  private muzzleOrigin(tower: SimTower, tx: number, ty: number): { x: number; y: number } {
    if (tower.muzzleLen <= 0) return { x: tower.x, y: tower.y };
    const a = Math.atan2(ty - tower.y, tx - tower.x);
    return {
      x: tower.x + Math.cos(a) * tower.muzzleLen,
      y: tower.y + Math.sin(a) * tower.muzzleLen,
    };
  }

  private fireProjectile(tower: SimTower, target: SimEnemy): void {
    const style = shotStyle(tower.iconKey, tower.element);
    // Ballistic (Fire/Water) shots are LOBBED to a fixed aim point so the view can
    // arc them (the emitters fire up at an angle). Plasma's shockwave mode (v3 §5)
    // is already lobbed; both detonate at the fire-time spot even if the target moves.
    const ballistic = style.motion === 'ballistic';
    const homing = style.motion === 'homing';
    const slow = tower.slowProjectile;
    const lobbed = slow || ballistic;
    const origin = this.muzzleOrigin(tower, target.x, target.y);

    // Speed: shockwave > ballistic > base; homing rounds start slow and accelerate.
    let speed = this.projectileSpeed;
    if (slow) speed = this.projectileSpeed * PLASMA_SLOW_PROJECTILE_MULT;
    else if (ballistic) speed = this.projectileSpeed * BALLISTIC_SPEED_MULT;
    else if (homing) speed = this.projectileSpeed * HOMING_MAX_MULT; // cap; curSpeed ramps to it

    this.projectiles.push({
      id: this.projSeq++,
      x: origin.x,
      y: origin.y,
      target,
      firePos: lobbed ? { x: target.x, y: target.y } : undefined,
      speed,
      curSpeed: homing ? this.projectileSpeed * HOMING_START_MULT : undefined,
      accel: homing ? this.projectileSpeed * HOMING_ACCEL_MULT : 0,
      arcPeak: ballistic ? BALLISTIC_ARC : 0,
      originX: origin.x,
      originY: origin.y,
      sourceIcon: tower.iconKey,
      damage: tower.damage,
      element: tower.element,
      alive: true,
      aoeRadius: tower.aoeRadius,
      splashFrac: tower.splashFrac,
      freezeRadius: tower.freezeRadius,
      slowFactor: tower.slowFactor,
      slowSec: tower.slowSec,
      wetSec: tower.wetSec,
      dotDps: tower.dotDps,
      dotSec: tower.dotSec,
      stunChance: tower.stunChance,
      stunSec: tower.stunSec,
      vsWetMult: tower.vsWetMult,
      vsSlowWetMult: tower.vsSlowWetMult,
      chainTargets: tower.chainTargets,
      chainAfterPierce: 0,
    });
  }

  private moveProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const homing = !p.firePos;
      // Homing bolts fizzle if their target dies; a shockwave shot flies to its
      // fixed aim point and detonates there regardless.
      if (homing && !p.target.alive) {
        p.alive = false;
        continue;
      }
      const dest = p.firePos ?? p.target;
      // Homing rounds (Tesla) accelerate from a slow start so they always catch up.
      let v = p.speed;
      if (p.accel > 0) {
        p.curSpeed = Math.min((p.curSpeed ?? p.speed) + p.accel * dt, p.speed);
        v = p.curSpeed;
      }
      const step = v * dt;
      const dx = dest.x - p.x;
      const dy = dest.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= this.hitRadius || d <= step) {
        p.x = dest.x;
        p.y = dest.y;
        p.alive = false;
        this.cb.onProjectileHit?.(p.x, p.y, p.element);
        this.resolveProjectileHit(p);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  /** Direct hit + splash + chain for a connecting projectile. */
  private resolveProjectileHit(p: SimProjectile): void {
    const primary = p.target;
    this.applyHit(primary, p.damage, p);

    // Area splash (Plasma III shockwave / Shrapnel / Steam burst).
    if (p.aoeRadius > 0) this.applyAoESplash(p.x, p.y, p.damage, p, primary);

    // Frost freeze radius (v3 §5): slow + Wet wash over every enemy near the
    // impact (status only — no extra damage), widening with the tower's grade.
    if (p.freezeRadius > 0) {
      const fr2 = p.freezeRadius * p.freezeRadius;
      for (const e of this.enemies) {
        if (!e.alive || e === primary) continue;
        if (this.dist2(e.x, e.y, p.x, p.y) > fr2) continue;
        this.applyHit(e, 0, p);
      }
    }

    // Chain lightning (Storm): hop to the nearest fresh targets.
    if (p.chainTargets > 1) {
      const hit = new Set<SimEnemy>([primary]);
      let from = primary;
      let dmg = p.damage;
      for (let hop = 1; hop < p.chainTargets; hop++) {
        const next = this.nearestUnhit(from.x, from.y, hit);
        if (!next) break;
        dmg *= CHAIN_FALLOFF;
        this.applyHit(next, dmg, p);
        this.cb.onBeam?.(from.x, from.y, next.x, next.y, p.element, p.sourceIcon);
        hit.add(next);
        from = next;
      }
    }
  }

  /** Nearest alive enemy within chain reach not already struck this chain. */
  private nearestUnhit(x: number, y: number, exclude: Set<SimEnemy>): SimEnemy | null {
    let best: SimEnemy | null = null;
    let bestD = this.chainRadius * this.chainRadius;
    for (const e of this.enemies) {
      if (!e.alive || exclude.has(e)) continue;
      const d = this.dist2(e.x, e.y, x, y);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Splash damage around a point (Shrapnel / Steam burst / Thermo detonation). */
  private applyAoESplash(
    cx: number,
    cy: number,
    directDmg: number,
    fx: HitEffects & { readonly element: ElementId },
    primary: SimEnemy,
  ): void {
    const r2 = fx.aoeRadius * fx.aoeRadius;
    for (const e of this.enemies) {
      if (!e.alive || e === primary) continue;
      if (this.dist2(e.x, e.y, cx, cy) > r2) continue;
      this.applyHit(e, directDmg * fx.splashFrac, fx);
    }
  }

  /** Apply damage (with Wet bonus) and on-hit statuses from a hit source. */
  private applyHit(e: SimEnemy, baseDamage: number, fx: HitEffects & { readonly element: ElementId }): void {
    if (!e.alive) return;
    const slowed = e.slowUntil > this.clock && e.slowFactor < 1;
    const wet = e.wetUntil > this.clock;
    let dmg = baseDamage;
    if (slowed || wet) dmg *= fx.vsSlowWetMult;
    dmg *= wet ? fx.vsWetMult : 1;
    // Floating damage number (skips status-only applications like the freeze wash).
    if (dmg > 0) this.cb.onEnemyDamaged?.(e, Math.round(dmg), wet && fx.vsWetMult > 1, fx.element);
    this.damageEnemy(e, dmg);
    if (!e.alive) return;

    if (fx.slowFactor > 0) {
      // Combine against the *current* slow (1 if the previous one lapsed) so a
      // stale strong slow never over-slows a later weaker one.
      const cur = e.slowUntil > this.clock ? e.slowFactor : 1;
      e.slowFactor = Math.min(cur, 1 - fx.slowFactor);
      e.slowUntil = Math.max(e.slowUntil, this.clock + fx.slowSec);
    }
    if (fx.wetSec > 0) e.wetUntil = Math.max(e.wetUntil, this.clock + fx.wetSec);
    if (fx.dotDps > 0) {
      const curDot = e.dotUntil > this.clock ? e.dotDps : 0;
      e.dotDps = Math.max(curDot, fx.dotDps);
      e.dotUntil = Math.max(e.dotUntil, this.clock + fx.dotSec);
    }
    if (fx.stunChance > 0 && this.roll(fx.stunChance, e)) {
      e.stunUntil = Math.max(e.stunUntil, this.clock + fx.stunSec);
    }
  }

  /**
   * Deterministic-ish "random" for stun rolls without Math.random (so the sim
   * stays resumable/replayable): hash the enemy id, the clock and the chance.
   */
  private roll(chance: number, e: SimEnemy): boolean {
    if (this.rng) {
      // Seeded: a per-enemy sub-stream that advances per roll → reproducible and
      // FPS-independent (depends on roll count, not on `clock`/frame rate).
      let r = this.enemyRng.get(e.id);
      if (!r) {
        r = this.rng.fork(e.id);
        this.enemyRng.set(e.id, r);
      }
      return r.next() < chance;
    }
    const seed = Math.sin((e.id + 1) * 12.9898 + this.clock * 78.233) * 43758.5453;
    return seed - Math.floor(seed) < chance;
  }

  private damageEnemy(enemy: SimEnemy, amount: number): void {
    if (!enemy.alive || amount <= 0) return;
    // Aegis-Beacon ally shield (docs/done/support-enemies.md) soaks flat damage
    // before HP — an extra pool, not a resist (damage stays flat, no type table).
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, amount);
      enemy.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) return;
    }
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      this.cb.onEnemyKilled?.(enemy);
    }
  }

  private dist2(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  private reap<T extends { alive: boolean }>(list: T[]): void {
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i]!.alive) list.splice(i, 1);
    }
  }
}

// --- Stat resolution --------------------------------------------------------

/** Base (pre-synergy) stats a card resolves to at a grade, for the inspection panel. */
export interface ResolvedTowerStats {
  damage: number;
  cooldown: number;
  /** Attack radius in grid cells (0 = does not attack). */
  rangeCells: number;
  /** Human-readable signature readout (v2 §5). */
  signatureLabel: string;
}

/** Multipliers from a slot's synergy that scale a tower's base stats. */
export interface SynergyMods {
  damageMult: number;
  rangeMult: number;
  tempoMult: number;
  /**
   * > 1 when a Shield neighbor buffs defense. Drives graduated interrupt resistance
   * (the tower's `defense` = defenseMult − 1): one Shield (1.5) → partial resist,
   * two (≥ 2.0) → full immunity. v3 §2.Г.
   */
  defenseMult: number;
  reactions: readonly ReactionId[];
}

/** Resolve an attacking/support card's base stats at `grade` (no synergy applied). */
export function towerStats(def: CardDef, grade: number): ResolvedTowerStats {
  const g = cardGrade(def, grade);
  const cooldown = def.signature === 'barrier' ? BARRIER_COOLDOWN_SEC : (def.cooldown ?? 1);
  return {
    damage: g.damage ?? 0,
    cooldown,
    rangeCells: g.rangeCells ?? 0,
    signatureLabel: signatureLabel(def, grade),
  };
}

/** A short readout of the card's signature parameter at a grade (v2 §5). */
export function signatureLabel(def: CardDef, grade: number): string {
  const g = cardGrade(def, grade);
  let base: string;
  switch (def.signature) {
    case 'projectile_power':
      base = t('sig.power', { n: g.sig });
      break;
    case 'freeze_radius':
      base = t('sig.slowWet', { n: g.sig, s: g.sig2 ?? 0 });
      break;
    case 'chain_targets':
      base = t('sig.chain', { n: g.sig });
      break;
    case 'pierce_length':
      base = t('sig.pierce', { n: g.sig.toFixed(1) });
      break;
    case 'barrier':
      base = t('sig.barrier', { n: g.sig, s: g.sig2 ?? 0 });
      break;
    case 'energy_output':
      base = t('sig.energy', { n: g.sig });
      break;
  }
  if (hasHybridPerk(def, 'steamBurst')) return t('sig.steamSplash', { base });
  if (hasHybridPerk(def, 'wetOnHit')) return t('sig.wetSuffix', { base, s: g.sig2 ?? 0 });
  if (hasHybridPerk(def, 'builtInShrapnel')) return t('sig.shrapnelSuffix', { base });
  if (hasHybridPerk(def, 'bonusVsSlowWet')) {
    const pct = Math.round((HYBRID_SLOW_WET_BONUS - 1) * 100);
    return t('sig.slowWetBonus', { base, pct });
  }
  if (hasHybridPerk(def, 'chainAfterPierce')) return t('sig.arcSuffix', { base, n: g.sig2 ?? 0 });
  return base;
}

/** A card produces a firing tower (attacker, or a barrier-casting Shield). */
export function isTower(def: CardDef, grade: number): boolean {
  const g = cardGrade(def, grade);
  return (def.category === 'attacking' && (g.rangeCells ?? 0) > 0) || def.signature === 'barrier';
}

/**
 * Build the full firing spec for a placed card, folding in its grade table, the
 * signature behavior and any active resonance reactions plus the neighbor-buff
 * multipliers. `cellPx` converts cell radii → arena pixels; `arenaWidth` sizes
 * the splash / shockwave radii.
 */
export function buildTowerSpec(
  def: CardDef,
  grade: number,
  pos: { x: number; y: number },
  cellPx: number,
  arenaWidth: number,
  mods: SynergyMods,
): TowerSpec {
  const g = cardGrade(def, grade);
  const base = towerStats(def, grade);
  const has = (id: ReactionId) => mods.reactions.includes(id);

  // Signature behavior.
  const chainTargets = def.signature === 'chain_targets' ? Math.round(g.sig) : 1;
  const pierce = def.signature === 'pierce_length';
  const barrierSec = def.signature === 'barrier' ? (g.sig2 ?? 0) : 0;

  let aoeFrac = def.signature === 'projectile_power' && g.diagonal ? PLASMA_SHOCKWAVE_FRAC : 0;
  if (has('shrapnel')) aoeFrac = (aoeFrac || PLASMA_SHOCKWAVE_FRAC) * SHRAPNEL_AOE_MULT;
  if (hasHybridPerk(def, 'builtInShrapnel')) {
    aoeFrac = (aoeFrac || PLASMA_SHOCKWAVE_FRAC) * SHRAPNEL_AOE_MULT;
  }
  if (hasHybridPerk(def, 'steamBurst')) {
    aoeFrac = Math.max(aoeFrac, HYBRID_STEAM_BURST_FRAC);
  }
  // Plasma's shockwave mode opens once it gains an area blast (Grade III or the
  // Fire+Physical Shrapnel reaction): the bolt goes slow + non-homing (v3 §5).
  const slowProjectile = def.signature === 'projectile_power' && aoeFrac > 0;

  // Frost's signature freeze *radius* (v3 §5): slow + Wet land in an area that
  // widens with grade. Hybrids that inherit freeze_radius get it too.
  const gi = Math.min(Math.max(grade, 1), 3) - 1;
  const freezeRadius =
    def.signature === 'freeze_radius' ? (FROST_FREEZE_RADIUS_FRAC[gi] ?? 0) * arenaWidth : 0;

  // Slow / Wet from Frost's signature; Steam reaction adds slow + DoT.
  let slowFactor = def.signature === 'freeze_radius' ? g.sig / 100 : 0;
  let slowSec = slowFactor > 0 ? SLOW_REFRESH_SEC : 0;
  let wetSec = def.signature === 'freeze_radius' ? (g.sig2 ?? 0) : 0;
  if (hasHybridPerk(def, 'wetOnHit')) wetSec = g.sig2 ?? 0;
  let dotDps = 0;
  let dotSec = 0;
  if (has('steam')) {
    slowFactor = Math.max(slowFactor, STEAM_SLOW);
    slowSec = Math.max(slowSec, STEAM_DOT_SEC);
    dotDps = STEAM_DOT_DPS;
    dotSec = STEAM_DOT_SEC;
  }

  // Superconductivity: faster fire + chance to stun.
  const tempoMult = mods.tempoMult * (has('superconductivity') ? SUPERCONDUCT_TEMPO_MULT : 1);
  const stunChance = has('superconductivity') ? SUPERCONDUCT_STUN_CHANCE : 0;
  const stunSec = has('superconductivity') ? SUPERCONDUCT_STUN_SEC : 0;

  // Storm doubles damage to Wet targets (intrinsic, §6).
  const vsWetMult = def.element === 'Electricity' ? WET_DAMAGE_MULT : 1;
  const vsSlowWetMult = hasHybridPerk(def, 'bonusVsSlowWet') ? HYBRID_SLOW_WET_BONUS : 1;
  const chainAfterPierce = hasHybridPerk(def, 'chainAfterPierce') ? Math.round(g.sig2 ?? 0) : 0;

  // Interrupt resistance from Shield neighbors (v3 §2.Г), derived from the defense
  // synergy: defenseMult 1.5 (one Shield) → 0.5; 2.0 (two Shields) → 1.0 = full
  // immunity. A partial value just scales the interrupt land/crit chances in the sim.
  const defense = Math.max(0, mods.defenseMult - 1);

  return {
    slotIndex: -1, // set by the caller
    element: def.element,
    iconKey: def.iconKey,
    x: pos.x,
    y: pos.y,
    range: base.rangeCells * mods.rangeMult * cellPx,
    damage: Math.round(base.damage * mods.damageMult),
    cooldown: base.cooldown / Math.max(0.1, tempoMult),
    pierce,
    slowProjectile,
    muzzleLen: towerMuzzleFrac(def.iconKey) * cellPx,
    barrierSec,
    load: cardLoad(def, grade),
    defense,
    // Full Shield defense (≥ 1, i.e. two Shield neighbors) confers outright interrupt
    // immunity (v3 §2.Г); a single Shield only resists. The caller additionally ORs in
    // positional immunity (the contact-free central / road-far slots).
    interruptImmune: defense >= 1,
    aoeRadius: aoeFrac * arenaWidth,
    splashFrac: AOE_SPLASH_FRAC,
    freezeRadius,
    slowFactor,
    slowSec,
    wetSec,
    dotDps,
    dotSec,
    stunChance,
    stunSec,
    vsWetMult,
    vsSlowWetMult,
    chainTargets,
    chainAfterPierce,
  };
}

/**
 * Network overload from the current energy state (v3 §3.А): units of load past
 * the *effective* capacity (the scene folds in Overdrive + wave growth). 0 when
 * the grid is at or under budget.
 */
export function overloadAmount(load: number, capacity: number): number {
  return Math.max(0, load - capacity);
}

/**
 * A single tower's overload penalty (v3 §3.А): −2.5% fire rate per unit of
 * network overload, scaled by the tower's *own* load — so projectile-heavy
 * turrets dim first and light support barely slows. Generators / zero-load cards
 * (load ≤ 0) are immune. Returned as a positive fraction (0 = no penalty).
 */
export function towerOverloadPenalty(overload: number, towerLoad: number): number {
  return OVERLOAD_FIRE_PENALTY_PER_LOAD * overload * Math.max(0, towerLoad);
}

/** That penalty as a fire-rate multiplier, floored so a tower never freezes solid. */
export function towerFireRateMult(overload: number, towerLoad: number): number {
  return Math.max(OVERLOAD_FIRE_FLOOR, 1 - towerOverloadPenalty(overload, towerLoad));
}
