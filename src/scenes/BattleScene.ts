import { Container, type FederatedPointerEvent, Graphics, type PointData, Sprite, type Texture } from 'pixi.js';
import { COLORS, ELEMENTS, ELEMENT_IDS, type ElementId, elementSymbolKey, hex } from '../theme';
import { formatGoldAmount } from '../config/battleRules';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene, type SceneParams } from '../core/scene';
import { tween, Easings, type TweenHandle } from '../core/tween';
import { cardShortName, elementLabel, gradeLabel, t } from '../core/i18n';
import { gameSpeedScale } from '../core/gameSpeed';
import { createBattleState } from '../config/battleState';
import {
  HAND_RESPAWN_SEC,
  HAND_SIZE,
  MOD_EMERGENCY_OVERDRIVE_SEC,
  MOD_FOCUS_DMG_MULT,
  MOD_ISOLATION_CAPACITY,
  OVERDRIVE_SEC,
  overdriveCost,
  fieldBurnCost,
  REROLL_BASE_COST,
  REROLL_STEP,
  rollHandCard,
  sellRefundAmount,
  towerGoldInvested,
} from '../config/battleRules';
import {
  CAPACITY_PER_WAVE,
  CORE_MAX,
  DISRUPTOR_JAM_RANGE_FRAC,
  ENEMY_PATHS,
  OVERDRIVE_CAPACITY_BONUS,
  PERFECT_CLEAR_CRYSTALS,
  WAVE_CLEAR_BONUS,
} from '../config/combatRules';
import { cardLoad, getCard } from '../config/cards';
import { getEnemy } from '../config/enemies';
import { FUSION_CRYSTAL_COST, fusionGoldCost, fusionResult } from '../config/fusion';
import { combatForLevel, type LevelCombat } from '../config/levelCombat';
import { decorForLevel, DECOR_REF_SIZE, DECOR_Z_FRONT } from '../config/levelDecor';
import { DRAW_POOL, MOD_CARD_POOL, MOD_DRAW_CHANCE } from '../config/battleRules';
import type { BattleStateMock, CardDef, HandCard } from '../config/types';
import { towersUnlockedByClearing, unlockedMechanicsForLevel, unlockedTowersForLevel } from '../config/progression';
import * as progress from '../game/progress';
import * as Telemetry from '../telemetry/Telemetry';
import { ArenaPath } from '../game/path';
import {
  BattleSim,
  buildTowerSpec,
  isTower,
  overloadAmount,
  towerOverloadPenalty,
  towerStats,
  type SimEnemy,
  type TowerSpec,
} from '../game/BattleSim';
import { computeSynergy, type SlotSynergy } from '../game/synergy';
import { AnimatedDecor } from '../ui/AnimatedDecor';
import { BattleBanner } from '../ui/BattleBanner';
import { BattleCard } from '../ui/BattleCard';
import { Button } from '../ui/Button';
import { GearButton } from '../ui/GearButton';
import { MuteButton } from '../ui/MuteButton';
import { SettingsPanel } from '../ui/SettingsPanel';
import { TutorialModal } from '../ui/TutorialModal';
import { pendingLessons } from '../config/tutorial';
import { DialogueOverlay } from '../ui/DialogueOverlay';
import { getDialogue, missionBriefId, victoryDialogueId } from '../config/dialogue';
import { LEVEL_ORDER } from '../config/progression';
import { CoreBadge } from '../ui/CoreBadge';
import { EnemySprite } from '../ui/EnemySprite';
import { EnergyGauge } from '../ui/EnergyGauge';
import { HandSlotView } from '../ui/HandSlotView';
import { HeroAvatar } from '../ui/HeroAvatar';
import { ModOverlay } from '../ui/ModOverlay';
import { MoveCostReadout, type CostPart } from '../ui/MoveCostReadout';
import { PlatformGrid } from '../ui/PlatformGrid';
import { ProjectileView } from '../ui/Projectile';
import { shotStyle, muzzleFlashKey } from '../config/projectiles';
import { ReactorZone } from '../ui/ReactorZone';
import { ResourceChip } from '../ui/ResourceChip';
import { SceneBackground } from '../ui/SceneBackground';
import type { SlotView } from '../ui/SlotView';
import { TowerInfoPanel } from '../ui/TowerInfoPanel';
import { hideConfigPicker } from '../ui/adminTools';
import { WaveBadge } from '../ui/WaveBadge';
import { WaveTelegraph } from '../ui/WaveTelegraph';
import { fitSprite, glowCircle, makeText, sliceElementSymbolSheet, type ElementSymbolFrames } from '../ui/helpers';

/**
 * One fixed hand position. Holds a card, or sits empty and recharges (`charge`
 * visual, counting `cooldown` down) until it spawns a fresh card.
 */
interface HandSlot {
  home: PointData;
  card: BattleCard | null;
  charge: HandSlotView;
  /** Seconds until respawn while empty; 0 when filled. */
  cooldown: number;
  /** In-flight return-to-hand animation, if any (so a re-grab can cancel it). */
  returnTween?: TweenHandle;
}

/**
 * Arena-image width fraction between the opposite *outer road edges*. The
 * playfield zooms in until this span fills the screen width, cropping the
 * rocky frame in the image so the road ring sits right at the screen edges.
 */
const ROAD_SPAN = 0.76;
/** Platform plate width as a fraction of the arena image width. */
const PLATFORM_FRAC = 0.5;
/** Pointer travel (screen px) before a card press becomes a drag rather than a tap. */
const DRAG_THRESHOLD_SQ = 12 * 12;

/** Muzzle flash (per-tower FX sprite): seconds held at full alpha, then fade duration. */
const MUZZLE_HOLD = 0.1;
const MUZZLE_FADE = 0.2;

/**
 * Per-tower fire SFX by card id (see docs/planned/tower-sound-design.md). Towers
 * not listed (support / unknown) fall back to the generic `sfx_shoot`.
 */
const TOWER_SHOOT_SFX: Record<string, string> = {
  plasma_shutter: 'sfx_shoot_plasma',
  frost_pulse: 'sfx_shoot_frost',
  storm_coil: 'sfx_shoot_storm',
  railgun: 'sfx_shoot_railgun',
  steam_cannon: 'sfx_shoot_steam',
  cryo_discharge: 'sfx_shoot_cryo',
  ion_volley: 'sfx_shoot_ion',
  thermo_spear: 'sfx_shoot_thermo',
  icebreaker: 'sfx_shoot_icebreaker',
  gauss_coil: 'sfx_shoot_gauss',
};

/**
 * Per-tower impact SFX keyed by the source tower's element (each attacking
 * element maps to exactly one tower). Falls back to the generic `sfx_hit`.
 */
const ELEMENT_HIT_SFX: Partial<Record<ElementId, string>> = {
  Fire: 'sfx_hit_plasma',
  Water: 'sfx_hit_frost',
  Electricity: 'sfx_hit_storm',
  Physical: 'sfx_hit_railgun',
};

/**
 * The main battle screen. All HUD elements from the brief (§5.3) on mock data.
 *
 * The arena (background-with-road + platform + enemies) lives in a single
 * `field` container scaled as one unit, so the road and the units that walk it
 * never scale independently. HUD chrome (top bar, gauge, hand, reactor) is an
 * edge-anchored overlay on top. The Reactor burn-zone only appears while a card
 * is being dragged.
 */
export class BattleScene extends Scene {
  private state: BattleStateMock = createBattleState();

  /** Campaign level being played (drives unlocks + where a clear is recorded). */
  private levelId = 'lvl_1';
  /** Looping animated-WebP decor props; ticked in update(), freed in onExit(). */
  private animatedDecor: AnimatedDecor[] = [];
  /** This level's wave script + difficulty tier (resolved in onEnter). */
  private levelCombat: LevelCombat = combatForLevel('lvl_1');
  /** Tower card ids the player may draw this battle (campaign roster, progression §7). */
  private drawPool: string[] = DRAW_POOL;
  /** Systemic mechanics unlocked so far (gates reroll / fusion, …). */
  private mechanics: Set<string> = new Set();

  private marginBg!: SceneBackground; // dimmed backdrop that fills wide-screen margins
  private scrim = new Graphics();
  private field = new Container(); // the locked playfield (arena + platform + enemies)
  private fieldMask = new Graphics(); // clips the zoomed field to the play area
  private fieldFrame = new Graphics(); // viewport vignette + edge drawn over the field
  private roadLayer = new Graphics(); // the active march route, drawn from the path polyline
  private telegraph?: WaveTelegraph; // pre-wave source marker (enemy badge + arrow, on the field)
  private telegraphPulse = 0; // accumulator for the telegraph's pulse animation
  private telegraphWaveShown = -2; // upcoming-wave index whose enemy icon is currently in the badge
  private enemyLayer = new Container();
  private fxLayer = new Container(); // projectiles + impact/muzzle bursts, above enemies
  private hudLayer = new Container();
  private handLayer = new Container();
  /** Coins / crystals streaming to the HUD + the wave-clear plaque (screen space, above the HUD). */
  private rewardLayer = new Container();
  private dragLayer = new Container();

  private arenaW = 1;
  private arenaH = 1;

  private grid!: PlatformGrid;
  private reactor!: ReactorZone;
  private reactorTween?: TweenHandle;
  /** Platform-wide holo shown while dragging a modernization card (§5). */
  private modOverlay!: ModOverlay;
  /**
   * Active Elemental Focus (modernization §4): the element whose towers get
   * +{@link MOD_FOCUS_DMG_MULT} damage until the wave ends; null when none. Baked
   * into the tower specs by {@link syncTowers}, cleared in {@link onWaveBegan}.
   */
  private focusElement: ElementId | null = null;
  /** On-field caption showing the active Focus element (hidden when none). */
  private focusLabel = makeText('', 'label', { fontSize: 30, fill: hex(COLORS.dropValid) });
  private gauge!: EnergyGauge;
  private waveBadge!: WaveBadge;
  private coreBadge!: CoreBadge;
  private goldChip!: ResourceChip;
  private crystalChip!: ResourceChip;
  /** Displayed (animated) chip values — they chase the true state so the counter
   *  ticks up as coins/crystals land rather than snapping (tasks §3/§4). */
  private goldDisplayed = 0;
  private crystalDisplayed = 0;
  /** Rolling counter so stacked floating damage numbers fan out instead of overlapping. */
  private dmgSeq = 0;
  private avatar!: HeroAvatar;
  private avatarR = 72;
  private backBtn!: Button;
  private rerollBtn!: Button;
  private gearBtn!: GearButton;
  private muteBtn!: MuteButton;
  private settings: SettingsPanel | null = null;
  /** Onboarding modal, alive only while pending lessons are shown (defers wave start). */
  private tutorial: TutorialModal | null = null;
  /** Visual-novel dialogue overlay (mission brief / victory beat), when one is playing. */
  private dialogue: DialogueOverlay | null = null;
  /** 1-based number of the wave in progress; drives the §3.В wave-capacity growth. */
  private currentWave = 1;
  /** Hand rerolls used in the current wave; resets each wave (§8.Б cost escalation). */
  private rerollsThisWave = 0;
  /** Cards burned in the Reactor this battle; drives the escalating burn cost (§3.Г). */
  private burnsThisBattle = 0;
  /** Fusions crafted this battle (telemetry summary on level_end). */
  private fusionsThisBattle = 0;
  /** Wall-clock of this battle in sim seconds (telemetry durationSec). */
  private battleElapsed = 0;
  /** Was the energy grid overloaded last refresh? (edge-trigger energy_overload). */
  private wasOverloaded = false;
  /** Last reported set of active resonance reaction ids (edge-trigger resonance_change). */
  private lastResonanceKey = '';
  /** Per-wave combat counters — flushed as wave_combat_summary, reset each wave. */
  private waveKills: Record<string, number> = {};
  private waveLeaks: Record<string, number> = {};
  private waveDmgByElement: Record<string, number> = {};
  private waveShotsByCard: Record<string, number> = {};
  private waveInterrupts = 0;
  private resonanceLabel = makeText('', 'label', { fontSize: 26, fill: hex(COLORS.energyOverdrive) });
  /** Resolved positional synergy per slot (v2 model), recomputed on every change. */
  private synergy: (SlotSynergy | null)[] = [];
  private hint = makeText(t('hud.dragHint'), 'micro', { fontSize: 20 });
  private waveToast = makeText('', 'title', { fontSize: 80, fill: hex(COLORS.white) });

  private hand: HandSlot[] = [];

  // --- Combat simulation + its sprite mirrors ------------------------------
  private sim!: BattleSim;
  private path!: ArenaPath;
  private enemyViews = new Map<number, EnemySprite>();
  /** Last HP seen per enemy id, to trigger a hit-flash when it drops. */
  private enemyHpSeen = new Map<number, number>();
  private projViews = new Map<number, ProjectileView>();
  /** Last RENDER position per projectile id (incl. arc lift), for velocity-angle rotation. */
  private projPrev = new Map<number, { x: number; y: number }>();
  /** Live VFX particles (muzzle sparks / impact shrapnel), ticked manually for gravity. */
  private fxParticles: {
    node: Container;
    vx: number;
    vy: number;
    spin: number;
    life: number;
    ttl: number;
    grav: number;
  }[] = [];
  private enemySize = 1;
  private banner?: BattleBanner;
  /** Range footprint shown under the dragged card before it is placed. */
  private rangePreview = new Graphics();
  /** Attack-range circle drawn while a placed tower is inspected (tap-to-inspect). */
  private inspectRange = new Graphics();
  /** Slot index currently inspected, or null. */
  private inspectedIndex: number | null = null;
  /** Top plaque describing the inspected tower. */
  private infoPanel!: TowerInfoPanel;
  /** Info-panel geometry, recomputed each layout so re-show lands correctly. */
  private infoPanelWidth = 760;
  private infoPanelPos: PointData = { x: 0, y: 0 };
  /** Signed cost of the pending drag action, shown in the sand under the base. */
  private moveCost!: MoveCostReadout;
  private moveCostPos: PointData = { x: 0, y: 0 };

  /**
   * Active Overdrive stacks — one per burned card, each holding its remaining
   * seconds. They stack (§3.Г): the effective capacity bonus is
   * `stacks.length * OVERDRIVE_CAPACITY_BONUS`, and each expires on its own timer.
   */
  private overdriveStacks: number[] = [];
  /** Monotonic counter for unique spawned-card instance ids. */
  private instanceSeq = 0;

  // Drag state.
  private dragging: BattleCard | null = null;
  private dragOffset: PointData = { x: 0, y: 0 };
  /** Latest pointer position in drag-layer space, so the lift tween can keep the
   *  card glued to a stationary finger while the grab offset animates. */
  private dragPointerLocal: PointData = { x: 0, y: 0 };
  /** Quick pickup interpolation: shrinks the card + slides it so the center of its
   *  bottom third settles under the pointer. Stopped/replaced on each new lift. */
  private dragLiftTween?: TweenHandle;
  /**
   * When the dragged card is a tower lifted *off the platform* (field-to-field
   * merge, v2 §1.5), the slot index it came from; null for a normal hand-card drag.
   */
  private fieldDragFrom: number | null = null;
  /** Card pressed but not yet dragged — promoted to a drag once the pointer moves
   *  past a threshold, or treated as a tap (show info plaque) if released first. */
  private pressCard: BattleCard | null = null;
  private pressStart: PointData = { x: 0, y: 0 };
  /** Occupied slot pressed but not yet lifted (tap = inspect, drag = field merge). */
  private pressSlot: SlotView | null = null;
  /** Hand card whose description plaque is currently shown (tap-to-inspect). */
  private inspectedCard: BattleCard | null = null;
  /** Hand card currently highlighted as a fusion target under the dragged card (§6.5). */
  private fusionTarget: BattleCard | null = null;
  /** Slot currently showing a build preview (ghost) under the dragged card. */
  private previewSlot: SlotView | null = null;
  /** Whether the dragged card is faded out (because a slot preview is showing). */
  private cardGhosted = false;
  private cardFadeTween?: TweenHandle;

  /** All scene-local tweens, stopped on exit so none outlive the scene. */
  private tweens: TweenHandle[] = [];

  private track(h: TweenHandle): TweenHandle {
    this.tweens.push(h);
    return h;
  }

  override onEnter(params?: SceneParams): void {
    hideConfigPicker();
    this.levelId = typeof params?.levelId === 'string' ? params.levelId : 'lvl_1';
    // Per-level combat: this level's own wave script + difficulty tier (levelCombat.ts).
    this.levelCombat = combatForLevel(this.levelId);
    // Campaign gate (progression §7): the roster is *fixed per level* (by its
    // place in the ladder), not by global progress or Admin — so level 1 always
    // comes up with only its starting towers. It filters the seeded board + draw pool.
    const unlocked = unlockedTowersForLevel(this.levelId);
    this.mechanics = unlockedMechanicsForLevel(this.levelId);
    this.drawPool = DRAW_POOL.filter((id) => unlocked.has(id));
    this.services.audio.playMusic('music_battle');
    this.state = createBattleState(unlocked, this.levelId);
    this.burnsThisBattle = 0; // burn price escalates per battle, fresh each entry (§3.Г)
    this.fusionsThisBattle = 0;
    this.battleElapsed = 0;
    this.wasOverloaded = false;
    this.lastResonanceKey = '';
    this.resetWaveCounters();
    console.log(`[Battle] level ${this.levelId} — towers: ${[...unlocked].join(', ')}`);
    // Telemetry: a level attempt begins. Context (level/wave) is stamped on later events.
    Telemetry.setContext({ level: this.levelId, wave: 1 });
    Telemetry.track('level_start', {
      towers: [...unlocked],
      mechanics: [...this.mechanics],
    });
    const { assets } = this.services;

    // Neutral full-bleed backdrop — a quiet steel/stone wall that fills the
    // whole canvas *around* the arena, so the surrounding margins never compete
    // with the play field (the busy bg_level canyon used to fill the margins too).
    this.marginBg = new SceneBackground(assets.get('bg_arena'));

    // --- Locked playfield: arena image (level map with the road) + platform +
    //     enemies in one transform, contain-fit and centered on the neutral
    //     backdrop above. ---
    // Per-level arena: the road painted into `bg_<levelId>` matches this level's
    // enemy path shape (see assetManifest). Falls back to the generic ring
    // `bg_level` via ASSET_FALLBACKS when a level has no dedicated background.
    const arenaTex = assets.get(`bg_${this.levelId}`);
    this.arenaW = arenaTex.width || 1024;
    this.arenaH = arenaTex.height || 1024;
    const arena = new Sprite(arenaTex);
    arena.anchor.set(0);
    arena.width = this.arenaW;
    arena.height = this.arenaH;
    // A tap on empty field (anywhere not a tower) dismisses the current selection.
    arena.eventMode = 'static';
    arena.on('pointertap', () => { if (!this.dragging) this.clearInspect(); });
    this.field.addChild(arena);
    // The active march route, drawn over the arena art from the path polyline so
    // it always matches where enemies actually walk (per-level direction).
    this.field.addChild(this.roadLayer);

    this.grid = new PlatformGrid(assets, 720);
    this.grid.applyState(this.state);
    this.grid.position.set(this.arenaW * 0.5, this.arenaH * 0.5);
    this.grid.setScaleSize(this.arenaW * PLATFORM_FRAC);
    this.field.addChild(this.grid);
    this.wireSlots();

    this.resonanceLabel.anchor.set(0.5);
    this.resonanceLabel.position.set(
      this.arenaW * 0.5,
      this.arenaH * 0.5 - this.arenaW * PLATFORM_FRAC * 0.5 - 30,
    );
    this.field.addChild(this.resonanceLabel);

    // Active Elemental Focus caption, just below the platform (hidden when none).
    this.focusElement = null;
    this.focusLabel.anchor.set(0.5);
    this.focusLabel.position.set(
      this.arenaW * 0.5,
      this.arenaH * 0.5 + this.arenaW * PLATFORM_FRAC * 0.5 + 26,
    );
    this.focusLabel.alpha = 0;
    this.field.addChild(this.focusLabel);

    // Platform-wide holo for modernization-card drags (hidden until one is dragged).
    this.modOverlay = new ModOverlay(this.arenaW * PLATFORM_FRAC * 1.06);
    this.modOverlay.position.set(this.arenaW * 0.5, this.arenaH * 0.5);

    this.enemySize = this.arenaW * 0.12;
    this.rangePreview.visible = false;
    this.inspectRange.visible = false;
    // Y-sort enemies by their board Y each frame (zIndex set in syncEnemies).
    this.enemyLayer.sortableChildren = true;
    this.field.addChild(this.rangePreview, this.inspectRange, this.modOverlay, this.enemyLayer, this.fxLayer);

    // Decorative props (parked vans «буханка», future scenery): per-level list
    // from levelDecor — tune in LEVEL_DECOR. Coordinates/scale are authored at
    // DECOR_REF_SIZE and re-scaled to this arena's actual texture size so they
    // follow the level texture's scale. They live in the enemy layer so each
    // prop's `z` sorts it against enemies (board-Y zIndex) — default in front,
    // DECOR_Z_BACK to sit behind them.
    const decorScaleX = this.arenaW / DECOR_REF_SIZE;
    const decorScaleY = this.arenaH / DECOR_REF_SIZE;
    this.animatedDecor.length = 0;
    for (const obj of decorForLevel(this.levelId)) {
      let prop: Container;
      if (obj.animated) {
        // Animated WebP (e.g. a parked character): decode frames and loop them.
        // The container centres its own frame and draws its optional shadow.
        const anim = new AnimatedDecor({ shadow: obj.shadow });
        void anim.load(obj.texture);
        this.animatedDecor.push(anim);
        prop = anim;
      } else {
        const sprite = new Sprite(assets.get(obj.texture));
        sprite.anchor.set(0.5);
        prop = sprite;
      }
      prop.scale.set(obj.scale * decorScaleX);
      prop.position.set(obj.x * decorScaleX, obj.y * decorScaleY);
      prop.zIndex = obj.z ?? DECOR_Z_FRONT;
      this.enemyLayer.addChild(prop);
    }

    this.buildHud();
    this.buildHand();
    this.refreshEnergy(); // seed load + grade-driven capacity into the gauge

    // --- Combat: the ring path + headless simulation that drives waves, tower
    //     fire and the core's integrity. The scene only mirrors it to sprites. --
    this.path = new ArenaPath(ENEMY_PATHS[this.levelCombat.pathId ?? 'bottom'], this.arenaW, this.arenaH);
    this.drawRoad();
    this.buildTelegraph();
    this.sim = new BattleSim({
      path: this.path,
      waves: this.levelCombat.waves,
      hpScale: this.levelCombat.hpScale,
      bountyScale: this.levelCombat.bountyScale,
      arenaWidth: this.arenaW,
      coreMax: CORE_MAX,
      callbacks: {
        onEnemyKilled: (e) => {
          this.services.audio.playSfx('sfx_enemy_die');
          this.onEnemyKilled(e);
        },
        onEnemyLeaked: (e) => {
          this.services.audio.playSfx('sfx_leak');
          this.onEnemyLeaked(e);
        },
        onEnemyDamaged: (e, amount, crit, element) => {
          this.services.audio.playSfx(crit ? 'sfx_crit' : (ELEMENT_HIT_SFX[element] ?? 'sfx_hit'));
          this.waveDmgByElement[element] = (this.waveDmgByElement[element] ?? 0) + amount;
          this.floatDamage(e.x, e.y, amount, crit);
        },
        onTowerInterrupted: (slot, kind, x, y) => {
          this.services.audio.playSfx(kind === 'stun' ? 'sfx_stun' : 'sfx_disrupt');
          this.onTowerInterrupted(slot, kind, x, y);
        },
        onTowerFired: (slotIndex, _target, originX, originY) =>
          this.onTowerFired(slotIndex, originX, originY),
        onProjectileHit: (x, y, element) => this.impact(x, y, element),
        onBeam: (x1, y1, x2, y2, element, iconKey) => this.beam(x1, y1, x2, y2, element, iconKey),
        onBarrier: (x, y) => {
          this.services.audio.playSfx('sfx_barrier');
          this.burst(x, y, COLORS.brassLight, this.arenaW * 0.05);
        },
        onWaveStart: (n) => {
          this.services.audio.playSfx('sfx_wave_start');
          this.onWaveBegan(n);
        },
        onWaveCleared: (n, perfect) => {
          this.services.audio.playSfx('sfx_wave_clear');
          this.onWaveCleared(n, perfect);
        },
        onVictory: () => {
          this.services.audio.playSfx('sfx_victory');
          this.handleVictory();
        },
        onDefeat: () => {
          this.services.audio.playSfx('sfx_defeat');
          this.showBanner('defeat');
        },
      },
    });
    this.refreshSynergy();
    this.syncTowers();

    this.addChild(
      this.marginBg,
      this.scrim,
      this.field,
      this.fieldFrame,
      this.fieldMask,
      this.hudLayer,
      this.handLayer,
      this.rewardLayer,
      this.waveToast, // above the wave-cleared dim (rewardLayer scrim) so the countdown stays legible
      this.dragLayer,
    );
    // Clip the zoomed playfield to its viewport (rect set in layout()).
    this.field.mask = this.fieldMask;
    // Reactor overlays the field but sits below the dragged card.
    this.hudLayer.addChild(this.reactor);

    // Story → onboarding → waves. The mission brief (level chief ↔ heroes) plays
    // over the freshly-revealed arena first; then the tutorial; then combat. The
    // sim only starts at the end of the chain (unstarted sim simply doesn't advance).
    this.startMissionBrief();
  }

  /**
   * Show the level's mission-brief dialogue (config/dialogue.ts) over the arena,
   * then chain into the tutorial. First entry only (Admin replays it); levels
   * with no brief drop straight to the tutorial.
   */
  private startMissionBrief(): void {
    const id = missionBriefId(this.levelId);
    const script = id ? getDialogue(id) : undefined;
    if (!id || !script || !progress.shouldPlayStory(id)) {
      this.startBattleOrTutorial();
      return;
    }
    this.dialogue = new DialogueOverlay(
      script,
      this.services.assets,
      this.services.audio,
      () => {
        progress.markStorySeen(id);
        this.closeDialogue();
        this.startBattleOrTutorial();
      },
      { dimAlpha: 0.5 },
    );
    this.addChild(this.dialogue); // top-most, above the drag layer
    this.dialogue.layout(this.services.getLayout());
  }

  /**
   * Show the pending tutorial lessons for this level (if any), deferring the
   * first wave until the player closes the modal; otherwise start combat now.
   */
  private startBattleOrTutorial(): void {
    const lessons = pendingLessons(this.levelId, progress.seenTutorials(), progress.isAdmin());
    if (lessons.length === 0) {
      this.sim.start();
      return;
    }
    this.tutorial = new TutorialModal(lessons, this.services.assets, this.services.audio, () => {
      progress.markTutorialsSeen(lessons.map((l) => l.id));
      this.closeTutorial();
      this.sim.start();
    });
    this.addChild(this.tutorial); // top-most, above the drag layer (like settings)
    this.tutorial.layout(this.services.getLayout());
  }

  private closeTutorial(): void {
    this.tutorial?.destroy({ children: true });
    this.tutorial = null;
  }

  private closeDialogue(): void {
    this.dialogue?.destroy({ children: true });
    this.dialogue = null;
  }

  private buildHud(): void {
    const { assets } = this.services;
    const s = this.state;

    this.waveBadge = new WaveBadge(1, this.levelCombat.waves.length);
    this.coreBadge = new CoreBadge(CORE_MAX, CORE_MAX);
    this.goldChip = new ResourceChip(assets.get('icon_gold'), s.gold, COLORS.gold);
    this.crystalChip = new ResourceChip(assets.get('icon_crystal'), s.crystals, COLORS.crystal);
    this.goldDisplayed = s.gold;
    this.crystalDisplayed = s.crystals;
    this.avatar = new HeroAvatar(
      assets.get('hero_avatar'),
      this.avatarR,
      assets.has('frame_avatar') ? assets.get('frame_avatar') : undefined,
    );

    this.gauge = new EnergyGauge(760, 70);
    this.gauge.setState({
      load: s.energyLoad,
      capacity: s.energyCapacity,
      max: s.energyMax,
      overdrive: s.overdrive,
    });

    this.reactor = new ReactorZone(assets, 196, 300);
    this.reactor.visible = false; // only shown while dragging a card
    this.reactor.alpha = 0;

    this.backBtn = new Button({
      label: t('common.map'),
      width: 150,
      height: 64,
      preset: 'label',
      labelColor: hex(COLORS.textBright),
      onClick: () => {
        this.services.audio.playSfx('sfx_click');
        this.services.navigate('worldmap');
      },
    });

    this.gearBtn = new GearButton(64, () => this.openSettings());
    this.muteBtn = new MuteButton(this.services.audio, 64);

    this.rerollBtn = new Button({
      label: t('battle.reroll', { cost: REROLL_BASE_COST }),
      width: 230,
      height: 64,
      preset: 'label',
      labelColor: hex(COLORS.crystal),
      onClick: () => this.doReroll(),
    });

    this.hint.anchor.set(0.5);
    this.hint.alpha = 0.7;

    this.moveCost = new MoveCostReadout();

    this.waveToast.anchor.set(0.5);
    this.waveToast.alpha = 0;

    this.infoPanel = new TowerInfoPanel();
    this.infoPanel.setSymbolTextures(this.elementSymbols());

    this.hudLayer.addChild(
      this.waveBadge,
      this.coreBadge,
      this.goldChip,
      this.crystalChip,
      this.avatar,
      this.gauge,
      this.backBtn,
      this.gearBtn,
      this.muteBtn,
      this.rerollBtn,
      this.hint,
      this.moveCost,
      this.infoPanel,
    );
    this.refreshRerollButton();
  }

  private buildHand(): void {
    // Fixed positions: seed the first ones from the mock hand, the rest start
    // empty and recharging (so the spawn loop is visible from the first frame).
    for (let i = 0; i < HAND_SIZE; i++) {
      const hc = this.state.hand[i];
      let card: BattleCard | null = null;
      if (hc) {
        const def = getCard(hc.cardId);
        card = this.makeCard(def, hc.grade);
        this.wireCard(card);
      }
      const cw = card?.cardW ?? 212;
      const ch = card?.cardH ?? 300;
      const charge = new HandSlotView(cw, ch);
      charge.visible = card === null;
      this.handLayer.addChild(charge);
      if (card) this.handLayer.addChild(card);
      this.hand.push({ home: { x: 0, y: 0 }, card, charge, cooldown: card ? 0 : HAND_RESPAWN_SEC });
    }
    this.refreshHandAffordability();
  }

  /** Build a hand / drag-avatar card with the standard cost-chip icons. */
  private makeCard(def: CardDef, grade: number): BattleCard {
    return new BattleCard(def, grade, this.services.assets.get(def.iconKey), {
      energyIcon: this.services.assets.get('icon_energy'),
      goldIcon: this.services.assets.get('icon_gold'),
      crystalIcon: this.services.assets.get('icon_crystal'),
      symbols: this.elementSymbols(),
      symbolFrames: this.symbolFrames(),
    });
  }

  /** Element-symbol textures (`sym_<element>`), built once and reused. */
  private symbolCache?: Partial<Record<ElementId, Texture>>;
  private elementSymbols(): Partial<Record<ElementId, Texture>> {
    if (!this.symbolCache) {
      const rec: Partial<Record<ElementId, Texture>> = {};
      for (const e of ELEMENT_IDS) rec[e] = this.services.assets.get(elementSymbolKey(e));
      this.symbolCache = rec;
    }
    return this.symbolCache;
  }

  /** Off/on influence-dot symbols sliced from `Symbols.png` once (undefined if absent). */
  private symbolFrameCache?: ElementSymbolFrames;
  private symbolFrames(): ElementSymbolFrames | undefined {
    if (!this.symbolFrameCache && this.services.assets.has('Symbols')) {
      this.symbolFrameCache = sliceElementSymbolSheet(this.services.assets.get('Symbols'));
    }
    return this.symbolFrameCache;
  }

  /** Wire press/drag handlers on a hand card (shared by initial deal and respawn).
   *  A press that stays put is a tap (show the info plaque); a press that travels
   *  far enough is promoted to a drag (place / burn). */
  private wireCard(card: BattleCard): void {
    card.eventMode = 'static';
    card.cursor = 'grab';
    card.on('pointerdown', (e: FederatedPointerEvent) => this.onCardDown(card, e));
    card.on('globalpointermove', (e: FederatedPointerEvent) => this.onCardMove(e));
    card.on('pointerup', (e: FederatedPointerEvent) => this.onCardUp(e));
    card.on('pointerupoutside', (e: FederatedPointerEvent) => this.onCardUp(e));
  }

  private onCardDown(card: BattleCard, e: FederatedPointerEvent): void {
    if (this.dragging || this.banner) return;
    this.pressCard = card;
    this.pressStart = { x: e.global.x, y: e.global.y };
  }

  private onCardMove(e: FederatedPointerEvent): void {
    if (this.dragging) {
      this.onDragMove(e);
      return;
    }
    const card = this.pressCard;
    if (!card) return;
    // Locked (unaffordable) cards never start a drag — only a tap survives.
    if (!card.affordable) return;
    const dx = e.global.x - this.pressStart.x;
    const dy = e.global.y - this.pressStart.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
    this.pressCard = null;
    this.startDrag(card, e);
    this.onDragMove(e);
  }

  private onCardUp(e: FederatedPointerEvent): void {
    if (this.dragging) {
      this.endDrag(e);
      this.pressCard = null;
      return;
    }
    // Released without travelling = a tap: toggle the card's description plaque.
    const card = this.pressCard;
    this.pressCard = null;
    if (card) this.toggleCardInfo(card);
  }

  /** Show (or dismiss) the description plaque for a tapped hand card. */
  private toggleCardInfo(card: BattleCard): void {
    if (this.inspectedCard === card) {
      this.clearInspect();
      return;
    }
    this.clearInspect();
    this.inspectedCard = card;
    card.setSelected(true);
    this.infoPanel.setWidth(this.infoPanelWidth);
    this.infoPanel.clearSell();
    this.infoPanel.show(card.def, card.grade, towerStats(card.def, card.grade));
    this.infoPanel.position.set(this.infoPanelPos.x, this.infoPanelPos.y);
  }

  /**
   * Wire press/drag/tap on every platform slot. A press that stays put is a tap
   * (inspect a placed tower, or dismiss); a press on an *occupied* slot that
   * travels far enough lifts that tower off the platform for a field-to-field
   * merge (v2 §1.5). Empty slots can only be tapped.
   */
  private wireSlots(): void {
    for (const slot of this.grid.slots) {
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.on('pointerdown', (e: FederatedPointerEvent) => this.onSlotDown(slot, e));
      slot.on('globalpointermove', (e: FederatedPointerEvent) => this.onSlotMove(e));
      slot.on('pointerup', (e: FederatedPointerEvent) => this.onSlotUp(slot, e));
      slot.on('pointerupoutside', (e: FederatedPointerEvent) => this.onSlotUp(slot, e));
    }
  }

  private onSlotDown(slot: SlotView, e: FederatedPointerEvent): void {
    if (this.dragging || this.banner) return;
    this.pressSlot = slot;
    this.pressStart = { x: e.global.x, y: e.global.y };
  }

  private onSlotMove(e: FederatedPointerEvent): void {
    // While a field tower is in flight, the slots drive the shared drag move (the
    // avatar card is non-interactive); a hand-card drag is driven by the card itself.
    if (this.dragging) {
      if (this.fieldDragFrom !== null) this.onDragMove(e);
      return;
    }
    const slot = this.pressSlot;
    if (!slot || !slot.isOccupied) return; // only occupied slots can be lifted
    const dx = e.global.x - this.pressStart.x;
    const dy = e.global.y - this.pressStart.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
    this.pressSlot = null;
    this.startFieldDrag(slot, e);
    this.onDragMove(e);
  }

  private onSlotUp(slot: SlotView, e: FederatedPointerEvent): void {
    if (this.dragging) {
      this.endDrag(e);
      this.pressSlot = null;
      return;
    }
    // Released without travelling = a tap. Only the originally-pressed slot acts
    // (sibling slots also receive pointerupoutside).
    const pressed = this.pressSlot;
    this.pressSlot = null;
    if (!pressed || pressed !== slot) return;
    if (slot.isOccupied) this.toggleInspect(slot.index);
    else this.clearInspect();
  }

  // --- Tap-to-inspect a placed tower ---------------------------------------

  private toggleInspect(index: number): void {
    if (this.inspectedIndex === index) this.clearInspect();
    else this.inspect(index);
  }

  private inspect(index: number): void {
    const placed = this.state.slots[index];
    if (!placed) {
      this.clearInspect();
      return;
    }
    const def = getCard(placed.cardId);
    if (this.inspectedIndex !== null && this.inspectedIndex !== index) {
      this.grid.slots[this.inspectedIndex]?.setSelected(false);
    }
    this.inspectedIndex = index;
    this.grid.slots[index]?.setSelected(true); // reveal this tower's net-effect badge
    this.grid.inspect(index); // neighbor cells, arrows, effect badges
    this.drawInspectRange(index, def, placed.grade); // attack radius over the road
    this.infoPanel.setWidth(this.infoPanelWidth);
    this.infoPanel.clearTowerActions();
    this.infoPanel.show(def, placed.grade, towerStats(def, placed.grade), this.synergy[index] ?? null);
    this.infoPanel.setOverload(this.towerOverloadPct(index));
    if (progress.isSellEnabled()) {
      const invested = towerGoldInvested(placed.cardId, placed.grade, placed.goldInvested);
      const refund = sellRefundAmount(invested);
      this.infoPanel.setSell(refund, () => this.sellTower(index));
    }
    this.infoPanel.position.set(this.infoPanelPos.x, this.infoPanelPos.y);
  }

  /**
   * The live overload fire-rate penalty (percent) for the tower in `index`, for
   * the inspection readout. Attacking towers only (matching the on-grid badge);
   * 0 when not overloaded or the battle isn't running.
   */
  private towerOverloadPct(index: number): number {
    const placed = this.state.slots[index];
    if (!placed || this.sim.status !== 'running') return 0;
    const def = getCard(placed.cardId);
    if (def.category !== 'attacking') return 0;
    const overload = overloadAmount(this.state.energyLoad, this.effectiveCapacity);
    return Math.round(towerOverloadPenalty(overload, cardLoad(def, placed.grade)) * 100);
  }

  private clearInspect(): void {
    if (this.inspectedIndex === null && this.inspectedCard === null) return;
    if (this.inspectedIndex !== null) {
      this.grid.slots[this.inspectedIndex]?.setSelected(false); // hide the net-effect badge
      this.inspectedIndex = null;
      this.grid.clearInspect();
      this.inspectRange.clear();
      this.inspectRange.visible = false;
    }
    if (this.inspectedCard && !this.inspectedCard.destroyed) this.inspectedCard.setSelected(false);
    this.inspectedCard = null;
    this.infoPanel.hide();
  }

  /** Sell a placed tower: partial gold refund, free slot, instant load drop. */
  private sellTower(index: number): void {
    if (!progress.isSellEnabled()) return;
    const placed = this.state.slots[index];
    if (!placed) return;
    const def = getCard(placed.cardId);
    const invested = towerGoldInvested(placed.cardId, placed.grade, placed.goldInvested);
    const refund = sellRefundAmount(invested);
    this.state.slots[index] = null;
    this.addReward(refund, 'sell');
    this.refreshEnergy();
    this.grid.applyState(this.state);
    this.refreshSynergy();
    this.syncTowers();
    Telemetry.track('sell', { cardId: def.id, grade: placed.grade, refund, slot: index });
    this.services.audio.playSfx('sfx_click');
    this.clearInspect();
  }

  /**
   * Burn a placed tower in the Reactor (admin test): drag field → Reactor, 2× hand-burn
   * gold, same Overdrive payoff, frees the slot.
   */
  private burnTowerField(index: number, avatar?: BattleCard): void {
    if (!progress.isBurnFieldEnabled()) return;
    const placed = this.state.slots[index];
    if (!placed) return;
    const cost = fieldBurnCost(this.burnsThisBattle);
    if (this.state.gold < cost) return;
    const def = getCard(placed.cardId);
    this.services.audio.playSfx('impact_01');
    this.spendGold(cost, 'burn_field');
    this.burnsThisBattle++;
    this.overdriveStacks.push(OVERDRIVE_SEC);
    this.state.slots[index] = null;
    this.refreshEnergy();
    this.grid.applyState(this.state);
    this.refreshSynergy();
    this.syncTowers();
    Telemetry.track('burn_field', {
      cardId: def.id,
      grade: placed.grade,
      costGold: cost,
      burnsThisBattle: this.burnsThisBattle,
      slot: index,
      capacityAfter: this.effectiveCapacity,
    });
    this.flash(this.reactor, COLORS.reactor);
    if (avatar && !avatar.destroyed) this.animateBurn(avatar);
    else this.clearInspect();
  }

  /** Draw the inspected tower's attack/barrier radius over the road. */
  private drawInspectRange(index: number, def: CardDef, grade: number): void {
    this.inspectRange.clear();
    const baseRange = towerStats(def, grade).rangeCells;
    if (baseRange <= 0) {
      this.inspectRange.visible = false;
      return;
    }
    const rMult = this.synergy[index]?.rangeMult ?? 1;
    const r = baseRange * rMult * this.grid.cellWorldSize;
    const skin = ELEMENTS[def.element];
    const p = this.grid.slotScenePos(index);
    this.inspectRange.position.set(p.x, p.y);
    this.inspectRange.circle(0, 0, r).fill({ color: skin.glow, alpha: 0.1 });
    this.inspectRange.circle(0, 0, r).stroke({ width: 4, color: skin.glow, alpha: 0.85 });
    this.inspectRange.visible = true;
  }

  // --- Drag & drop ---------------------------------------------------------

  /**
   * Target on-screen scale for a lifted card: shrink it to roughly one platform
   * cell wide (≈1.5× smaller than in hand) so it stops covering the slot it is
   * about to drop on — the player can read the cell + build-preview underneath.
   * The card lives in the (unscaled) drag layer, while the cell's on-screen size
   * is the grid cell scaled by the field zoom, so divide by the card's own width.
   */
  private pickupScale(card: BattleCard): number {
    const cellOnScreen = this.grid.cellWorldSize * this.field.scale.x;
    if (!(cellOnScreen > 0)) return 0.7; // pre-layout fallback
    return Math.min(0.9, Math.max(0.5, cellOnScreen / card.cardW));
  }

  /**
   * Move a just-grabbed card onto the drag layer and play the pickup lift: a quick
   * interpolation that shrinks it to ≈one cell ({@link pickupScale}) and slides it
   * so its **center** settles under the pointer — slot snapping is resolved from the
   * pointer position ({@link onDragMove} → `slotAtGlobal`), so centering the card on
   * the finger keeps the held card aligned with the slot it will drop on. The tween
   * drives `card.position` itself (from the last pointer sample) so the card tracks
   * even a stationary finger; {@link onDragMove} takes over the instant it moves.
   */
  private liftCard(card: BattleCard, grabGlobal: PointData, e: FederatedPointerEvent): void {
    const local = this.dragLayer.toLocal(grabGlobal);
    this.dragLayer.addChild(card);
    card.position.copyFrom(local);

    const toScale = this.pickupScale(card);
    const pointerLocal = this.dragLayer.toLocal(e.global);
    this.dragPointerLocal = { x: pointerLocal.x, y: pointerLocal.y };
    // Start at the scaled grab point (the spot the player pressed), animate to a
    // zero offset so the card center lands exactly under the pointer.
    const startOff = { x: (local.x - pointerLocal.x) * toScale, y: (local.y - pointerLocal.y) * toScale };
    const targetOff = { x: 0, y: 0 };
    this.dragOffset = { x: startOff.x, y: startOff.y };

    const fromScale = card.scale.x;
    this.dragLiftTween?.stop();
    this.dragLiftTween = this.track(
      tween({
        duration: 0.12,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (card.destroyed) return;
          card.scale.set(fromScale + (toScale - fromScale) * t);
          this.dragOffset.x = startOff.x + (targetOff.x - startOff.x) * t;
          this.dragOffset.y = startOff.y + (targetOff.y - startOff.y) * t;
          card.position.set(this.dragPointerLocal.x + this.dragOffset.x, this.dragPointerLocal.y + this.dragOffset.y);
        },
      }),
    );
    card.alpha = 0.97;
  }

  /** Gold price of the next Reactor burn this battle (base + step per burn, §3.Г). */
  private burnCost(): number {
    return overdriveCost(this.burnsThisBattle);
  }

  /** Gold cost shown on the Reactor for the current drag (hand vs field tower). */
  private reactorBurnCost(fieldDrag: boolean): number {
    return fieldDrag && progress.isBurnFieldEnabled()
      ? fieldBurnCost(this.burnsThisBattle)
      : this.burnCost();
  }

  private showReactor(burnGold = this.burnCost()): void {
    this.reactorTween?.stop();
    this.reactor.visible = true;
    this.reactor.setCost(burnGold, this.state.gold >= burnGold);
    this.reactorTween = this.track(
      tween({ duration: 0.18, onUpdate: (t) => { if (!this.reactor.destroyed) this.reactor.alpha = t; } }),
    );
  }

  private hideReactor(): void {
    this.reactorTween?.stop();
    this.reactor.setHighlight('none');
    this.reactorTween = this.track(
      tween({
        duration: 0.16,
        onUpdate: (t) => { if (!this.reactor.destroyed) this.reactor.alpha = 1 - t; },
        onComplete: () => { if (!this.reactor.destroyed) this.reactor.visible = false; },
      }),
    );
  }

  private startDrag(card: BattleCard, e: FederatedPointerEvent): void {
    if (this.dragging || !card.affordable) return;
    this.services.audio.playSfx('sfx_pickup');
    Telemetry.track('card_pickup', { cardId: card.def.id, grade: card.grade, source: 'hand' });
    this.clearInspect(); // inspection and dragging are mutually exclusive modes
    const entry = this.hand.find((h) => h.card === card);
    entry?.returnTween?.stop();
    if (entry) entry.returnTween = undefined;

    this.dragging = card;
    card.cursor = 'grabbing';

    this.liftCard(card, card.getGlobalPosition(), e);
    this.previewSlot = null;
    this.cardGhosted = false;

    // Modernization cards apply to the *whole* platform: holo overlay, no slot /
    // Reactor targets (§5). Build cards light the slots + the Reactor burn zone.
    if (card.def.category === 'modernization') {
      card.alpha = 0.55; // see the holo + element discs through the dragged card
      this.showModOverlay(card.def);
    } else {
      this.showReactor();
      this.grid.showDropTargets(true);
      this.reactor.setHighlight('valid');
    }
    this.hint.alpha = 0.95;
  }

  /**
   * Lift a placed tower off the platform for a field-to-field merge (v2 §1.5). A
   * full-size card avatar (purely visual; the slot handlers drive the drag) flies
   * with the pointer; only matching same-grade towers light up as merge targets.
   * The source tower stays in place until a successful drop — a cancel just glides
   * the avatar back.
   */
  private startFieldDrag(slot: SlotView, e: FederatedPointerEvent): void {
    if (this.dragging || this.banner) return;
    const placed = this.state.slots[slot.index];
    if (!placed) return;
    this.clearInspect(); // inspection and dragging are mutually exclusive modes

    const def = getCard(placed.cardId);
    Telemetry.track('card_pickup', { cardId: placed.cardId, grade: placed.grade, source: 'field' });
    const avatar = this.makeCard(def, placed.grade);
    avatar.eventMode = 'none'; // visual only; slot/card move+up handlers drive it
    this.dragging = avatar;
    this.fieldDragFrom = slot.index;

    this.liftCard(avatar, slot.getGlobalPosition(), e);
    this.previewSlot = null;
    this.cardGhosted = false;

    this.grid.showMergeTargets(def.id, placed.grade, slot.index);
    if (progress.isBurnFieldEnabled()) {
      this.showReactor(fieldBurnCost(this.burnsThisBattle));
      this.reactor.setHighlight('valid');
    }
    this.hint.alpha = 0.95;
  }

  private onDragMove(e: FederatedPointerEvent): void {
    const card = this.dragging;
    if (!card) return;
    const p = this.dragLayer.toLocal(e.global);
    // Keep the latest pointer for the lift tween (which drives position while the
    // grab offset is still animating to the bottom-third anchor).
    this.dragPointerLocal = { x: p.x, y: p.y };
    card.position.set(p.x + this.dragOffset.x, p.y + this.dragOffset.y);

    // Modernization cards have their own (platform-wide) drag feedback.
    if (card.def.category === 'modernization') {
      this.onModDragMove(card, e);
      return;
    }

    const fieldDrag = this.fieldDragFrom !== null;
    const fieldBurn = fieldDrag && progress.isBurnFieldEnabled();
    const overReactor =
      this.reactor.visible && this.reactor.containsGlobal(e.global) && (!fieldDrag || fieldBurn);
    const hit = overReactor ? null : this.grid.slotAtGlobal(e.global);
    // A field-drag can never target its own origin slot.
    const slot = hit && hit.index !== this.fieldDragFrom ? hit : null;
    // A field-drag has no empty-slot drop (no relocation) — only merges.
    const emptySlot = !fieldDrag && slot && !slot.isOccupied ? slot : null;
    const mergeSlot =
      slot && slot.isOccupied && this.canMerge(card.def.id, card.grade, slot.index) ? slot : null;
    const targetSlot = emptySlot ?? mergeSlot;
    // The grade the preview should reflect: a merge bumps it one up.
    const previewGrade = mergeSlot ? this.state.slots[mergeSlot.index]!.grade + 1 : card.grade;

    // Reactor hover charges the gauge (previewing the burn payoff); otherwise
    // the reactor sits as a plain valid target.
    if (!fieldDrag || fieldBurn) {
      if (fieldBurn) {
        const cost = fieldBurnCost(this.burnsThisBattle);
        this.reactor.setCost(cost, this.state.gold >= cost);
      }
      this.reactor.setHighlight(overReactor ? 'hover' : 'valid');
      this.gauge.setCharging(overReactor);
    }

    // Over a target slot: show the tower's attack-range footprint + the buffs it
    // would feed its neighbors. An empty slot also gets a translucent build ghost
    // (a merge keeps the existing tower art, so no ghost there); a merge target
    // additionally shows a "MERGE → Lvn" plaque.
    if (targetSlot !== this.previewSlot) {
      this.previewSlot?.clearGhost();
      this.previewSlot = targetSlot;
      if (emptySlot) emptySlot.showGhost(this.services.assets.get(card.def.iconKey), card.def.element);
      if (!targetSlot) this.grid.clearInspect();
    }
    if (targetSlot) {
      this.grid.previewBuffs(targetSlot.index, card.def, previewGrade, mergeSlot ? previewGrade : undefined);
      this.showRangePreview(targetSlot, card.def, previewGrade);
    } else {
      this.hideRangePreview();
    }

    // Live gauge preview (§9): show the would-be network load so an impending
    // yellow / overload reads before the drop (over the Reactor it's a capacity
    // boost instead, already telegraphed via setCharging).
    if (overReactor || !targetSlot) {
      this.gauge.setPreviewLoad(null);
    } else if (emptySlot) {
      this.gauge.setPreviewLoad(this.state.energyLoad + cardLoad(card.def, card.grade));
    } else if (mergeSlot) {
      const dE = fieldDrag
        ? cardLoad(card.def, previewGrade) - 2 * cardLoad(card.def, card.grade)
        : cardLoad(card.def, previewGrade) - cardLoad(card.def, card.grade);
      this.gauge.setPreviewLoad(Math.max(0, this.state.energyLoad + dE));
    }

    // Would this placement / merge close a resonance (§9)? Evaluated on a
    // hypothetical board so the player sees it before committing.
    let resonates = false;
    if (targetSlot) {
      const temp = this.state.slots.slice();
      if (fieldDrag && this.fieldDragFrom !== null) temp[this.fieldDragFrom] = null;
      temp[targetSlot.index] = { cardId: card.def.id, grade: previewGrade };
      resonates = computeSynergy(temp)[targetSlot.index]?.resonant ?? false;
    }

    // Highlight the drop targets. Field-drag lights only matching towers; a hand
    // card lights empty slots (hover/valid) plus any merge target.
    if (fieldDrag) {
      this.grid.showMergeTargets(card.def.id, card.grade, this.fieldDragFrom, mergeSlot);
    } else if (mergeSlot) {
      this.grid.setMergeTarget(mergeSlot);
    } else {
      this.grid.setHover(emptySlot, true);
    }

    // Hand-to-hand fusion (§6.5): hovering a *different* hand card with a recipe,
    // while not over the Reactor or a grid slot. Highlight the target card.
    let fuse: { target: BattleCard; hybridId: string } | null = null;
    if (this.mechanics.has('fusion') && !fieldDrag && !overReactor && !targetSlot) {
      const other = this.handCardAtGlobal(e.global, card)?.card;
      if (other) {
        const hid = fusionResult(card.def.id, other.def.id);
        if (hid) fuse = { target: other, hybridId: hid };
      }
    }
    this.setFusionTarget(fuse?.target ?? null);

    // Cost of the pending action, signed, in the sand under the base (§9). No
    // target → fall back to the generic drag hint.
    const parts = fuse
      ? this.fusionCostParts(card, fuse.target, fuse.hybridId)
      : this.moveCostParts(card, fieldDrag, overReactor, emptySlot, mergeSlot, previewGrade);
    if (parts && resonates) parts.push({ text: t('battle.resonance'), color: COLORS.synergy });
    if (parts) {
      this.moveCost.show(parts);
      this.moveCost.position.set(this.moveCostPos.x, this.moveCostPos.y);
      this.hint.alpha = 0;
    } else {
      this.moveCost.hide();
      this.hint.alpha = 0.95;
    }

    // Fade the dragged card out over an empty slot (the ghost reads); keep it
    // visible over a merge slot so the player sees what is being fed in.
    this.setCardGhosted(emptySlot !== null);
  }

  /**
   * Compose the signed cost chips for the action currently under the pointer, or
   * null when the drag isn't over any valid target. Energy is the *net* shift to
   * the grid's load (a merge of higher grades can free energy), so placing reads
   * `+n` and merging may read `0`/`-n`; gold is the price (red if unaffordable).
   */
  private moveCostParts(
    card: BattleCard,
    fieldDrag: boolean,
    overReactor: boolean,
    emptySlot: SlotView | null,
    mergeSlot: SlotView | null,
    previewGrade: number,
  ): CostPart[] | null {
    const energyIcon = this.services.assets.get('icon_energy');
    const goldIcon = this.services.assets.get('icon_gold');

    if (overReactor) {
      return [
        { text: 'BURN', color: COLORS.energyOverdrive },
        { icon: energyIcon, text: `+${OVERDRIVE_CAPACITY_BONUS} CAP ${OVERDRIVE_SEC}s`, color: COLORS.energyOverdrive },
        this.goldPart(goldIcon, this.reactorBurnCost(fieldDrag)),
      ];
    }
    if (emptySlot) {
      return [this.energyPart(energyIcon, cardLoad(card.def, card.grade)), this.goldPart(goldIcon, card.def.costGold)];
    }
    if (mergeSlot) {
      // Net load shift: a hand merge grows the target one grade; a field merge
      // fuses two grade-g towers into one grade-(g+1), freeing a slot. With load
      // doubling per grade (§3.А) a field merge of consumers is energy-neutral (0).
      const dE = fieldDrag
        ? cardLoad(card.def, previewGrade) - 2 * cardLoad(card.def, card.grade)
        : cardLoad(card.def, previewGrade) - cardLoad(card.def, card.grade);
      return [
        { text: `→ ${gradeLabel(previewGrade)}`, color: COLORS.energyOverdrive },
        this.energyPart(energyIcon, dE),
        this.goldPart(goldIcon, card.def.costGold),
      ];
    }
    return null;
  }

  /** A signed energy chip: `+n` (more load → warn), `-n` (frees → ok), `0` (dim). */
  private energyPart(icon: Texture, delta: number): CostPart {
    const color = delta > 0 ? COLORS.energyWarn : delta < 0 ? COLORS.energyOk : COLORS.textDim;
    return { icon, text: `${delta > 0 ? '+' : ''}${delta}`, color };
  }

  /** A gold-cost chip, red when the player can't currently afford it. */
  private goldPart(icon: Texture, cost: number): CostPart {
    const gold = Number.isFinite(cost) ? Math.max(0, Math.round(cost)) : 0;
    return { icon, text: `-${formatGoldAmount(gold)}`, color: this.state.gold >= gold ? COLORS.gold : COLORS.energyDanger };
  }

  /**
   * Can a card of `cardId` at `grade` merge onto the tower at `index`? Strict
   * "2048" rule (v2 §4): same type, **same grade**, and not yet maxed. So I+I→II
   * and II+II→III, but I never lifts a II.
   */
  private canMerge(cardId: string, grade: number, index: number): boolean {
    const placed = this.state.slots[index];
    return !!placed && placed.cardId === cardId && placed.grade === grade && placed.grade < 3;
  }

  /** Fast fade of the dragged card while a slot build-preview is showing. */
  private setCardGhosted(on: boolean): void {
    if (this.cardGhosted === on) return;
    this.cardGhosted = on;
    const card = this.dragging;
    if (!card) return;
    const from = card.alpha;
    // Fade the card down to 30% over a slot (not fully out) so the build-preview
    // reads while the lifted card stays visible — no jarring disappear/reappear
    // flicker as the pointer snaps between slots.
    const to = on ? 0.3 : 0.97;
    this.cardFadeTween?.stop();
    this.cardFadeTween = this.track(
      tween({ duration: 0.1, onUpdate: (t) => { if (!card.destroyed) card.alpha = from + (to - from) * t; } }),
    );
  }

  private endDrag(e: FederatedPointerEvent): void {
    const card = this.dragging;
    if (!card) return;

    // Modernization cards resolve against the platform holo, not the slots / Reactor.
    if (card.def.category === 'modernization') {
      this.endModDrag(card, e);
      return;
    }

    const fromIndex = this.fieldDragFrom;
    this.dragging = null;
    this.fieldDragFrom = null;
    card.cursor = 'grab';

    // Tear down the drag-time visuals shared by every outcome.
    this.dragLiftTween?.stop(); // stop the pickup lift before place/return takes over
    this.cardFadeTween?.stop();
    this.previewSlot?.clearGhost();
    this.previewSlot = null;
    this.cardGhosted = false;
    this.gauge.setCharging(false);
    this.gauge.setPreviewLoad(null); // drop the §9 drag load preview
    this.setFusionTarget(null);
    this.grid.clearHighlights();
    this.grid.clearInspect(); // drop any drag-time buff preview overlay
    this.hideRangePreview();
    this.moveCost.hide();
    this.hint.alpha = 0.7;

    const slot = this.grid.slotAtGlobal(e.global);

    // Field drag: burn on Reactor (2× gold) or merge onto a matching tower.
    if (fromIndex !== null) {
      const fieldBurn = progress.isBurnFieldEnabled();
      if (fieldBurn && this.reactor.visible && this.reactor.containsGlobal(e.global)) {
        this.hideReactor();
        const cost = fieldBurnCost(this.burnsThisBattle);
        if (this.state.gold >= cost) this.burnTowerField(fromIndex, card);
        else this.returnFieldTower(card, fromIndex);
        return;
      }
      if (fieldBurn) this.hideReactor();
      if (slot && slot.index !== fromIndex && this.canMerge(card.def.id, card.grade, slot.index)) {
        this.mergeFieldTower(fromIndex, slot.index, card);
      } else {
        Telemetry.track('card_drop_invalid', { cardId: card.def.id, source: 'field' });
        this.returnFieldTower(card, fromIndex);
      }
      return;
    }

    // Hand card: burn on the Reactor (grants Overdrive) — only if the player can
    // afford the escalating burn price (§3.Г); otherwise it glides back home.
    if (this.reactor.visible && this.reactor.containsGlobal(e.global)) {
      this.hideReactor();
      if (this.state.gold >= this.burnCost()) this.burnCard(card);
      else this.returnCardHome(card);
      return;
    }
    this.hideReactor();

    // ...place on a free slot, or merge onto a matching same-grade tower.
    if (slot && !slot.isOccupied) {
      this.placeCard(card, slot);
      return;
    }
    if (slot && this.canMerge(card.def.id, card.grade, slot.index)) {
      this.mergeCard(card, slot);
      return;
    }

    // ...or fuse onto a different hand card that has a recipe (v2 §6.5).
    if (!slot && this.mechanics.has('fusion')) {
      const other = this.handCardAtGlobal(e.global, card)?.card;
      if (other) {
        const hid = fusionResult(card.def.id, other.def.id);
        if (hid && this.canAffordFusion(card, other)) {
          this.fuseCards(card, other, hid);
          return;
        }
      }
    }
    Telemetry.track('card_drop_invalid', { cardId: card.def.id, source: 'hand' });
    this.returnCardHome(card);
  }

  // --- Place / burn / spawn ------------------------------------------------

  /** Commit a card to a slot: pay its gold, update state, render and animate it in. */
  private placeCard(card: BattleCard, slot: SlotView): void {
    const def = card.def;
    // Safety net: the card should already be locked when unaffordable, but never
    // place one the player can't pay for.
    if (this.state.gold < def.costGold) {
      this.returnCardHome(card);
      return;
    }
    this.state.slots[slot.index] = { cardId: def.id, grade: card.grade, goldInvested: def.costGold };
    this.spendGold(def.costGold, 'place');
    this.refreshEnergy(); // load grows by this card's base step
    this.grid.applyState(this.state); // renders the tower + redraws broadcast beams
    this.refreshSynergy(); // recompute neighbor buffs / resonance
    this.syncTowers(); // the new tower joins the firing line
    Telemetry.track('place', {
      cardId: def.id,
      grade: card.grade,
      slot: slot.index,
      costGold: def.costGold,
      energyAfter: this.state.energyLoad,
    });

    this.services.audio.playSfx('sfx_place');
    this.flash(slot, COLORS.dropValid);
    this.freeHandCard(card);
    this.animatePlace(card, slot);
  }

  /**
   * Merge a hand card onto a matching tower (v2 §4): the tower grades up in place
   * (wider reach, stronger buff, next signature tier, +1 synergy slot) for the
   * card's gold. The strict "2048" rule ({@link canMerge}) means the card and the
   * tower must share a grade, so a hand card (always Grade I) only ever lifts a
   * Grade I tower to II — reaching III needs a field-to-field merge of two IIs.
   * Load grows with the new grade (offset by the §3.В capacity growth).
   */
  private mergeCard(card: BattleCard, slot: SlotView): void {
    const def = card.def;
    const placed = this.state.slots[slot.index];
    if (!placed || this.state.gold < def.costGold) {
      this.returnCardHome(card);
      return;
    }
    const newGrade = Math.min(3, placed.grade + 1);
    const prevInvested = towerGoldInvested(placed.cardId, placed.grade, placed.goldInvested);
    this.state.slots[slot.index] = {
      cardId: placed.cardId,
      grade: newGrade,
      goldInvested: prevInvested + def.costGold,
    };
    this.spendGold(def.costGold, 'merge');
    this.refreshEnergy(); // higher grade draws more load; capacity also grows (§3.В)
    this.grid.applyState(this.state);
    this.refreshSynergy();
    this.syncTowers();
    Telemetry.track('merge_hand', {
      cardId: placed.cardId,
      fromGrade: placed.grade,
      toGrade: newGrade,
      slot: slot.index,
      costGold: def.costGold,
    });

    this.services.audio.playSfx('sfx_merge');
    this.mergeBurst(slot, newGrade);
    this.freeHandCard(card);
    this.animatePlace(card, slot);
  }

  /**
   * Merge one platform tower into another of the same type + grade (v2 §1.5):
   * the dragged tower is consumed, the target grades up in place. Costs the card's
   * gold (like any merge); load and capacity both shift to match. Unaffordable →
   * the tower glides back home.
   */
  private mergeFieldTower(fromIndex: number, toIndex: number, avatar: BattleCard): void {
    const target = this.state.slots[toIndex];
    const source = this.state.slots[fromIndex];
    if (!target || !source) {
      this.returnFieldTower(avatar, fromIndex);
      return;
    }
    const cost = getCard(target.cardId).costGold;
    if (this.state.gold < cost) {
      this.returnFieldTower(avatar, fromIndex);
      return;
    }
    const newGrade = Math.min(3, target.grade + 1);
    const invested =
      towerGoldInvested(source.cardId, source.grade, source.goldInvested) +
      towerGoldInvested(target.cardId, target.grade, target.goldInvested) +
      cost;
    this.state.slots[toIndex] = { cardId: target.cardId, grade: newGrade, goldInvested: invested };
    this.state.slots[fromIndex] = null; // the consumed tower leaves the platform
    this.spendGold(cost, 'merge');
    this.refreshEnergy();
    this.grid.applyState(this.state);
    this.refreshSynergy();
    this.syncTowers();
    Telemetry.track('merge_field', {
      cardId: target.cardId,
      fromGrade: target.grade,
      toGrade: newGrade,
      fromSlot: fromIndex,
      toSlot: toIndex,
      costGold: cost,
    });

    this.services.audio.playSfx('sfx_merge');
    const targetSlot = this.grid.slots[toIndex];
    if (targetSlot) this.mergeBurst(targetSlot, newGrade);
    if (targetSlot) this.animatePlace(avatar, targetSlot);
    else avatar.destroy();
  }

  /** Cancelled field-drag: glide the lifted tower back into its origin slot. */
  private returnFieldTower(avatar: BattleCard, fromIndex: number): void {
    const slot = this.grid.slots[fromIndex];
    if (!slot) {
      avatar.destroy();
      return;
    }
    const start = { x: avatar.x, y: avatar.y };
    const fromScale = avatar.scale.x;
    const fromAlpha = avatar.alpha;
    this.track(
      tween({
        duration: 0.22,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (avatar.destroyed) return;
          const tgt = this.dragLayer.toLocal(slot.getGlobalPosition());
          avatar.position.set(start.x + (tgt.x - start.x) * t, start.y + (tgt.y - start.y) * t);
          avatar.scale.set(fromScale + (0.3 - fromScale) * t);
          avatar.alpha = fromAlpha * (1 - t);
        },
        onComplete: () => { if (!avatar.destroyed) avatar.destroy(); },
      }),
    );
  }

  /** A gold grade-up flourish on a just-merged slot: an expanding ring + rising "Lvn". */
  private mergeBurst(slot: SlotView, grade: number): void {
    const b = slot.getLocalBounds();
    const ring = new Graphics();
    ring.roundRect(b.x, b.y, b.width, b.height, 18).stroke({ width: 10, color: COLORS.energyOverdrive });
    slot.addChild(ring);
    const label = makeText(gradeLabel(grade), 'title', { fontSize: 40, fill: hex(COLORS.energyOverdrive) });
    label.anchor.set(0.5);
    slot.addChild(label);
    this.track(
      tween({
        duration: 0.6,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (!ring.destroyed) {
            ring.alpha = 1 - t;
            ring.scale.set(1 + 0.3 * t);
          }
          if (!label.destroyed) {
            label.alpha = 1 - t;
            label.position.set(0, -slot.cellSize * 0.18 - 30 * t);
            label.scale.set(0.8 + 0.5 * t);
          }
        },
        onComplete: () => {
          if (!ring.destroyed) ring.destroy();
          if (!label.destroyed) label.destroy();
        },
      }),
    );
  }

  /**
   * Burn a card in the Reactor: pay the escalating gold price (§3.Г), add a
   * stacking Overdrive window, animate it in. Each burn this battle makes the
   * next one dearer.
   */
  private burnCard(card: BattleCard): void {
    const cost = this.burnCost();
    this.services.audio.playSfx('impact_01');
    this.spendGold(cost, 'burn');
    this.burnsThisBattle++;
    this.overdriveStacks.push(OVERDRIVE_SEC);
    this.refreshEnergy();
    Telemetry.track('burn', {
      cardId: card.def.id,
      costGold: cost,
      burnsThisBattle: this.burnsThisBattle,
      capacityAfter: this.effectiveCapacity,
    });
    this.flash(this.reactor, COLORS.reactor);
    this.freeHandCard(card);
    this.animateBurn(card);
  }

  // --- Modernization cards (global platform upgrades, §4/§5) ---------------

  /** Reveal the platform holo for the dragged modernization card. */
  private showModOverlay(def: CardDef): void {
    this.modOverlay.show(def.mod!, this.modTitle(def), def.mod === 'focus');
    this.modOverlay.setAffordable(this.canAffordCard(def));
  }

  /** Caption for the holo: the effect the release will apply. */
  private modTitle(def: CardDef): string {
    switch (def.mod) {
      case 'isolation':
        return `+${MOD_ISOLATION_CAPACITY} BASE CAPACITY`;
      case 'overdrive':
        return `OVERDRIVE ${MOD_EMERGENCY_OVERDRIVE_SEC}s`;
      case 'focus':
        return `FOCUS  +${Math.round((MOD_FOCUS_DMG_MULT - 1) * 100)}% DMG`;
      default:
        return '';
    }
  }

  /** Drag feedback for a modernization card: affordability tint, Focus picker, cost. */
  private onModDragMove(card: BattleCard, e: FederatedPointerEvent): void {
    const def = card.def;
    this.modOverlay.setAffordable(this.canAffordCard(def));
    const el = def.mod === 'focus' ? this.modOverlay.elementAtGlobal(e.global) : null;
    if (def.mod === 'focus') this.modOverlay.highlightElement(el);
    this.moveCost.show(this.modCostParts(def, el));
    this.moveCost.position.set(this.moveCostPos.x, this.moveCostPos.y);
    this.hint.alpha = 0;
  }

  /**
   * Resolve a modernization drop: apply the upgrade to the whole platform when the
   * release lands over it (and is affordable) — Focus additionally needs an element
   * disc under the pointer (§5). Anything else glides the card back home.
   */
  private endModDrag(card: BattleCard, e: FederatedPointerEvent): void {
    this.dragging = null;
    card.cursor = 'grab';
    this.dragLiftTween?.stop(); // stop the pickup lift before return/apply takes over
    // Hit-test while the overlay is still live, then tear it down.
    const el = card.def.mod === 'focus' ? this.modOverlay.elementAtGlobal(e.global) : null;
    const overPlatform = this.grid.containsGlobal(e.global) || this.modOverlay.containsGlobal(e.global);
    this.modOverlay.hide();
    this.moveCost.hide();
    this.hint.alpha = 0.7;

    if (!this.canAffordCard(card.def)) {
      this.returnCardHome(card);
      return;
    }
    switch (card.def.mod) {
      case 'isolation':
        if (overPlatform) this.applyIsolation(card);
        else this.returnCardHome(card);
        break;
      case 'overdrive':
        if (overPlatform) this.applyEmergencyOverdrive(card);
        else this.returnCardHome(card);
        break;
      case 'focus':
        if (el) this.applyFocus(card, el);
        else this.returnCardHome(card);
        break;
      default:
        this.returnCardHome(card);
    }
  }

  /** Cost chips for the modernization action under the pointer (§5). */
  private modCostParts(def: CardDef, el: ElementId | null): CostPart[] {
    const energyIcon = this.services.assets.get('icon_energy');
    const goldIcon = this.services.assets.get('icon_gold');
    const crystalIcon = this.services.assets.get('icon_crystal');
    switch (def.mod) {
      case 'isolation':
        return [
          { text: t('mod.isolation'), color: COLORS.crystal },
          { icon: energyIcon, text: t('mod.capBonus', { n: MOD_ISOLATION_CAPACITY }), color: COLORS.energyOk },
          this.goldPart(goldIcon, def.costGold),
        ];
      case 'overdrive':
        return [
          { text: t('mod.overdrive'), color: COLORS.energyOverdrive },
          {
            icon: energyIcon,
            text: t('mod.capBonusTimed', { n: OVERDRIVE_CAPACITY_BONUS, sec: MOD_EMERGENCY_OVERDRIVE_SEC }),
            color: COLORS.energyOverdrive,
          },
          this.crystalPart(crystalIcon, def.costCrystals ?? 0),
        ];
      case 'focus': {
        const label = el ? elementLabel(el) : t('battle.pickElement');
        const color = el ? ELEMENTS[el].glow : COLORS.textDim;
        return [
          { text: t('battle.focusChip', { element: label }), color },
          { text: t('battle.dmgPct', { pct: Math.round((MOD_FOCUS_DMG_MULT - 1) * 100) }), color: COLORS.dropValid },
          this.goldPart(goldIcon, def.costGold),
        ];
      }
      default:
        return [];
    }
  }

  /** A crystal-cost chip, red when the player can't currently afford it. */
  private crystalPart(icon: Texture, cost: number): CostPart {
    return { icon, text: `-${cost}`, color: this.state.crystals >= cost ? COLORS.crystal : COLORS.energyDanger };
  }

  /** Isolation Circuit (§4): permanently bump the network's base capacity. */
  private applyIsolation(card: BattleCard): void {
    this.services.audio.playSfx('sfx_upgrade');
    this.spendGold(card.def.costGold, 'modernization');
    this.state.energyCapacity += MOD_ISOLATION_CAPACITY;
    this.refreshEnergy();
    Telemetry.track('modernization', { mod: 'isolation', costGold: card.def.costGold });
    this.flash(this.gauge, COLORS.crystal);
    this.freeHandCard(card);
    this.animateModApply(card);
  }

  /** Elemental Focus (§4): +DMG to all towers of `el` until the wave ends. */
  private applyFocus(card: BattleCard, el: ElementId): void {
    this.services.audio.playSfx('sfx_place');
    this.spendGold(card.def.costGold, 'modernization');
    Telemetry.track('modernization', { mod: 'focus', costGold: card.def.costGold, element: el });
    this.focusElement = el;
    this.syncTowers(); // re-bake tower damage with the focus multiplier
    this.updateFocusLabel();
    this.freeHandCard(card);
    this.animateModApply(card);
  }

  /**
   * Emergency Overdrive (§4): the same capacity-boost window as a Reactor burn, but
   * shorter, paid in crystals, with no card burned (so {@link burnsThisBattle} — the
   * burn-cost escalator — is left untouched).
   */
  private applyEmergencyOverdrive(card: BattleCard): void {
    this.services.audio.playSfx('sfx_burn');
    this.spendCrystals(card.def.costCrystals ?? 0, 'modernization');
    this.overdriveStacks.push(MOD_EMERGENCY_OVERDRIVE_SEC);
    this.refreshEnergy();
    Telemetry.track('modernization', { mod: 'overdrive', costCrystals: card.def.costCrystals ?? 0 });
    this.flash(this.gauge, COLORS.energyOverdrive);
    this.freeHandCard(card);
    this.animateModApply(card);
  }

  /** Fly an applied modernization card into the platform, shrink and fade out. */
  private animateModApply(card: BattleCard): void {
    const start = { x: card.x, y: card.y };
    const fromScale = card.scale.x;
    const fromAlpha = card.alpha;
    this.track(
      tween({
        duration: 0.3,
        easing: Easings.inOutSine,
        onUpdate: (t) => {
          if (card.destroyed) return;
          const tgt = this.dragLayer.toLocal(this.grid.getGlobalPosition());
          card.position.set(start.x + (tgt.x - start.x) * t, start.y + (tgt.y - start.y) * t);
          card.scale.set(fromScale + (0.3 - fromScale) * t);
          card.alpha = fromAlpha * (1 - t);
        },
        onComplete: () => { if (!card.destroyed) card.destroy(); },
      }),
    );
  }

  /** Reflect the active Elemental Focus on the field caption (hidden when none). */
  private updateFocusLabel(): void {
    if (this.focusElement) {
      const skin = ELEMENTS[this.focusElement];
      this.focusLabel.text = t('battle.focusLabel', {
        element: elementLabel(this.focusElement),
        pct: Math.round((MOD_FOCUS_DMG_MULT - 1) * 100),
      });
      this.focusLabel.style.fill = hex(skin.glow);
      this.focusLabel.alpha = 1;
    } else {
      this.focusLabel.alpha = 0;
    }
  }

  // --- Fusion in hand (v2 §6.5) --------------------------------------------

  /** The hand slot whose card sits under `global` (skipping `exclude` / the dragged card). */
  private handCardAtGlobal(global: PointData, exclude: BattleCard | null): HandSlot | null {
    const p = this.handLayer.toLocal(global);
    for (const slot of this.hand) {
      const c = slot.card;
      if (!c || c === exclude || c === this.dragging || c.destroyed) continue;
      if (Math.abs(p.x - slot.home.x) <= c.cardW / 2 && Math.abs(p.y - slot.home.y) <= c.cardH / 2) return slot;
    }
    return null;
  }

  /** Can the player pay for a fusion of these two cards (scalable gold + 1 crystal)? */
  private canAffordFusion(a: BattleCard, b: BattleCard): boolean {
    return this.state.gold >= fusionGoldCost(a.grade, b.grade) && this.state.crystals >= FUSION_CRYSTAL_COST;
  }

  /** Cost chips for a pending fusion: the hybrid name, scalable gold, flat 1 crystal. */
  private fusionCostParts(a: BattleCard, b: BattleCard, hybridId: string): CostPart[] {
    const goldIcon = this.services.assets.get('icon_gold');
    const crystalIcon = this.services.assets.get('icon_crystal');
    return [
      { text: `FUSE → ${getCard(hybridId).shortName}`, color: COLORS.crystal },
      this.goldPart(goldIcon, fusionGoldCost(a.grade, b.grade)),
      {
        icon: crystalIcon,
        text: `-${FUSION_CRYSTAL_COST}`,
        color: this.state.crystals >= FUSION_CRYSTAL_COST ? COLORS.crystal : COLORS.energyDanger,
      },
    ];
  }

  /** Toggle the bold "ready to combine" frame on the hand card under the dragged card. */
  private setFusionTarget(target: BattleCard | null): void {
    if (this.fusionTarget === target) return;
    if (this.fusionTarget && !this.fusionTarget.destroyed) this.fusionTarget.setMergeReady(false);
    this.fusionTarget = target;
    if (target && !target.destroyed) target.setMergeReady(true);
  }

  /**
   * Fuse two different hand cards into a hybrid (v2 §6.5). The dragged source's
   * hand position recharges; the target slot becomes the hybrid (Grade I) for the
   * player to deploy. Costs scalable gold + a flat crystal.
   */
  private fuseCards(dragged: BattleCard, target: BattleCard, hybridId: string): void {
    const goldCost = fusionGoldCost(dragged.grade, target.grade);
    this.services.audio.playSfx('sfx_fusion');
    this.spendGold(goldCost, 'fusion');
    this.spendCrystals(FUSION_CRYSTAL_COST, 'fusion');
    this.fusionsThisBattle++;
    Telemetry.track('fusion', {
      aId: dragged.def.id,
      bId: target.def.id,
      hybridId,
      costGold: goldCost,
      costCrystals: FUSION_CRYSTAL_COST,
    });
    this.setFusionTarget(null);

    // The dragged source is consumed → its hand position recharges.
    this.freeHandCard(dragged);

    // The target slot becomes the crafted hybrid card.
    const entry = this.hand.find((h) => h.card === target);
    if (!entry) {
      this.animateFuse(dragged, { x: dragged.x, y: dragged.y });
      return;
    }
    const def = getCard(hybridId);
    const hybrid = this.makeCard(def, 1);
    this.wireCard(hybrid);
    entry.returnTween?.stop();
    entry.returnTween = undefined;
    if (!target.destroyed) target.destroy();
    entry.card = hybrid;
    entry.cooldown = 0;
    entry.charge.visible = false;
    hybrid.position.copyFrom(entry.home);
    hybrid.setAffordable(this.state.gold >= def.costGold);
    this.handLayer.addChild(hybrid);

    // Fly the consumed source into the slot, then pop the new hybrid in.
    this.animateFuse(dragged, entry.home);
    this.animateSpawn(hybrid);
  }

  /** Fly a consumed fusion source into `dest` (hand-space), shrink/fade, destroy. */
  private animateFuse(card: BattleCard, dest: PointData): void {
    const start = { x: card.x, y: card.y };
    const fromScale = card.scale.x;
    const fromAlpha = card.alpha;
    this.track(
      tween({
        duration: 0.28,
        easing: Easings.inOutSine,
        onUpdate: (t) => {
          if (card.destroyed) return;
          const tgt = this.dragLayer.toLocal(this.handLayer.toGlobal(dest));
          card.position.set(start.x + (tgt.x - start.x) * t, start.y + (tgt.y - start.y) * t);
          card.scale.set(fromScale + (0.3 - fromScale) * t);
          card.alpha = fromAlpha * (1 - t);
        },
        onComplete: () => { if (!card.destroyed) card.destroy(); },
      }),
    );
  }

  /**
   * Recompute network load + capacity from the current platform and push it to
   * the gauge. Load = Σ `cardLoad(def, grade)` (consumers double per grade so a
   * merge is energy-neutral, §3.А; generators give back more). Capacity is the
   * wave-driven {@link effectiveCapacity}; the gauge track grows with it so the
   * bar visibly lengthens as the platform strengthens (§9). Call after every
   * placement / merge / burn / Overdrive change or wave start.
   */
  private refreshEnergy(): void {
    let load = 0;
    for (const placed of this.state.slots) {
      if (placed) load += cardLoad(getCard(placed.cardId), placed.grade);
    }
    this.state.energyLoad = Math.max(0, load);
    this.state.overdrive = this.overdriveStacks.length > 0;
    const capacity = this.effectiveCapacity;
    const max = Math.max(this.state.energyMax, Math.ceil(capacity) + 5, Math.ceil(this.state.energyLoad) + 2);
    this.gauge.setState({ load: this.state.energyLoad, capacity, max, overdrive: this.state.overdrive });
    // Edge-trigger telemetry only when the overload state flips (not every refresh).
    const overloaded = this.state.energyLoad > capacity;
    if (overloaded !== this.wasOverloaded) {
      this.wasOverloaded = overloaded;
      // Stinger on the flip: grid tips into overload vs. recovers to effective.
      this.services.audio.playSfx(overloaded ? 'power_down_01' : 'power_up_01');
      Telemetry.track('energy_overload', {
        on: overloaded,
        load: this.state.energyLoad,
        capacity,
        overload: Math.max(0, this.state.energyLoad - capacity),
      });
    }
  }

  /**
   * Effective network capacity (v2 §3.В): base capacity + wave-driven growth
   * (+CAPACITY_PER_WAVE per wave elapsed, uncapped) + any active Overdrive burn
   * stacks. Deliberately NOT tied to grade — stacking towers never prints energy.
   */
  private get effectiveCapacity(): number {
    const waveBonus = (this.currentWave - 1) * CAPACITY_PER_WAVE;
    return this.state.energyCapacity + waveBonus + this.overdriveStacks.length * OVERDRIVE_CAPACITY_BONUS;
  }

  /** Mark the hand position that held `card` as empty and start its recharge. */
  private freeHandCard(card: BattleCard): void {
    const slot = this.hand.find((h) => h.card === card);
    if (!slot) return;
    slot.returnTween?.stop();
    slot.returnTween = undefined;
    slot.card = null;
    slot.cooldown = HAND_RESPAWN_SEC;
    slot.charge.setProgress(0);
    slot.charge.visible = true;
  }

  /** Recharge finished: deal a fresh card into an empty hand position. */
  private spawnIntoSlot(slot: HandSlot): void {
    const hc = this.rollBattleHandCard();
    const def = getCard(hc.cardId);
    Telemetry.track('hand_draw', {
      cardId: hc.cardId,
      grade: hc.grade,
      isMod: def.category === 'modernization',
    });
    const card = this.makeCard(def, hc.grade);
    this.wireCard(card);
    slot.card = card;
    slot.cooldown = 0;
    slot.charge.visible = false;
    card.position.copyFrom(slot.home);
    card.setAffordable(this.canAffordCard(def));
    this.handLayer.addChild(card);
    this.animateSpawn(card);
  }

  /**
   * Roll a fresh hand card for this battle. When the `mod_cards` mechanic is
   * unlocked, a small {@link MOD_DRAW_CHANCE} share of draws yields a modernization
   * card (§3, kept rare so it doesn't crowd the tower roster); otherwise it draws a
   * tower from the campaign roster ({@link drawPool}).
   */
  private rollBattleHandCard(): HandCard {
    if (this.mechanics.has('mod_cards') && MOD_CARD_POOL.length > 0 && Math.random() < MOD_DRAW_CHANCE) {
      const id = MOD_CARD_POOL[Math.floor(Math.random() * MOD_CARD_POOL.length)]!;
      return { instanceId: `spawn-${this.instanceSeq++}`, cardId: id, grade: 1 };
    }
    return rollHandCard(this.instanceSeq++, this.drawPool);
  }

  /** Whether the player can currently pay for a card (crystal price for crystal cards). */
  private canAffordCard(def: CardDef): boolean {
    if ((def.costCrystals ?? 0) > 0) return this.state.crystals >= def.costCrystals!;
    return this.state.gold >= def.costGold;
  }

  /** Fly the dragged card into its slot, shrink and fade, then destroy it. */
  private animatePlace(card: BattleCard, slot: SlotView): void {
    const start = { x: card.x, y: card.y };
    const fromScale = card.scale.x;
    const fromAlpha = card.alpha;
    this.track(
      tween({
        duration: 0.24,
        easing: Easings.inOutSine,
        onUpdate: (t) => {
          if (card.destroyed) return;
          const tgt = this.dragLayer.toLocal(slot.getGlobalPosition());
          card.position.set(start.x + (tgt.x - start.x) * t, start.y + (tgt.y - start.y) * t);
          card.scale.set(fromScale + (0.42 - fromScale) * t);
          card.alpha = fromAlpha * (1 - t);
        },
        onComplete: () => { if (!card.destroyed) card.destroy(); },
      }),
    );
  }

  /** Suck the burned card into the Reactor: shrink, spin slightly, fade out. */
  private animateBurn(card: BattleCard): void {
    const start = { x: card.x, y: card.y };
    const fromScale = card.scale.x;
    const fromAlpha = card.alpha;
    this.track(
      tween({
        duration: 0.3,
        easing: Easings.inOutSine,
        onUpdate: (t) => {
          if (card.destroyed) return;
          const tgt = this.dragLayer.toLocal(this.reactor.getGlobalPosition());
          card.position.set(start.x + (tgt.x - start.x) * t, start.y + (tgt.y - start.y) * t);
          card.scale.set(fromScale + (0.18 - fromScale) * t);
          card.rotation = t * 0.6;
          card.alpha = fromAlpha * (1 - t);
        },
        onComplete: () => { if (!card.destroyed) card.destroy(); },
      }),
    );
  }

  /** Pop a freshly spawned card into the hand (scale + fade in). */
  private animateSpawn(card: BattleCard): void {
    card.alpha = 0;
    card.scale.set(0.6);
    this.track(
      tween({
        duration: 0.3,
        easing: Easings.outBack,
        onUpdate: (t) => {
          if (card.destroyed) return;
          card.scale.set(0.6 + 0.4 * t);
          card.alpha = Math.min(1, t * 1.4);
        },
        onComplete: () => {
          if (card.destroyed) return;
          card.scale.set(1);
          card.alpha = 1;
        },
      }),
    );
  }

  private returnCardHome(card: BattleCard): void {
    const entry = this.hand.find((h) => h.card === card);
    if (!entry) return;
    const from = { x: card.x, y: card.y };
    const fromScale = card.scale.x;
    const fromAlpha = card.alpha;
    entry.returnTween?.stop();
    entry.returnTween = this.track(
      tween({
        duration: 0.26,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (card.destroyed) return;
          const tgt = this.dragLayer.toLocal(this.handLayer.toGlobal(entry.home));
          card.position.set(from.x + (tgt.x - from.x) * t, from.y + (tgt.y - from.y) * t);
          card.scale.set(fromScale + (1 - fromScale) * t);
          card.alpha = fromAlpha + (1 - fromAlpha) * t;
        },
        onComplete: () => {
          entry.returnTween = undefined;
          if (card.destroyed || this.handLayer.destroyed) return;
          this.handLayer.addChild(card);
          card.position.copyFrom(entry.home);
          card.scale.set(1);
          card.alpha = 1;
        },
      }),
    );
  }

  private flash(target: Container, color: number): void {
    const ring = new Graphics();
    const b = target.getLocalBounds();
    ring.roundRect(b.x, b.y, b.width, b.height, 18).stroke({ width: 8, color });
    target.addChild(ring);
    this.track(
      tween({
        duration: 0.5,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (ring.destroyed) return;
          ring.alpha = 1 - t;
          ring.scale.set(1 + 0.12 * t);
        },
        onComplete: () => { if (!ring.destroyed) ring.destroy(); },
      }),
    );
  }

  // --- Combat: simulation <-> sprites --------------------------------------

  /**
   * Rebuild the sim's firing towers from placement + synergy: each attacking card
   * (and the barrier-casting Shield) becomes a tower whose stats are scaled by its
   * neighbor buffs and whose behavior folds in its signature + active reactions.
   */
  private syncTowers(): void {
    const specs: TowerSpec[] = [];
    // A slot a Disruptor can never reach (the road never comes within jam range)
    // is intrinsically interrupt-immune (§2.Г). Derived from the *active* path so
    // it stays correct under any march direction — on the all-around ring this is
    // just the contact-free center slot, but a directional route can leave other
    // far-from-the-road slots safe too.
    const jamReach = DISRUPTOR_JAM_RANGE_FRAC * this.arenaW;
    this.state.slots.forEach((placed, i) => {
      if (!placed) return;
      const def = getCard(placed.cardId);
      if (!isTower(def, placed.grade)) return;
      const syn = this.synergy[i];
      const p = this.grid.slotScenePos(i);
      const spec = buildTowerSpec(def, placed.grade, p, this.grid.cellWorldSize, this.arenaW, {
        damageMult: syn?.damageMult ?? 1,
        rangeMult: syn?.rangeMult ?? 1,
        tempoMult: syn?.tempoMult ?? 1,
        defenseMult: syn?.defenseMult ?? 1,
        reactions: syn?.reactions ?? [],
      });
      const roadFar = this.path.nearestDistance(p.x, p.y) >= jamReach;
      // Elemental Focus (§4): +DMG to every tower of the focused element, folded
      // into the spec's damage like the synergy mults are (cleared each wave).
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

  /** Recompute positional synergy and reflect resonance in the banner. */
  private refreshSynergy(): void {
    this.synergy = computeSynergy(this.state.slots);
    const count = this.synergy.filter((s) => s?.resonant).length;
    this.resonanceLabel.text =
      count > 1 ? t('battle.resonanceX', { count }) : count === 1 ? t('battle.resonance') : '';
    this.resonanceLabel.alpha = count > 0 ? 1 : 0;
    // Edge-trigger: report the set of active resonance reactions when it changes —
    // captures which resonances players actually build (dead-content analysis).
    const active = [...new Set(this.synergy.flatMap((s) => s?.reactions ?? []))].sort();
    const key = active.join(',');
    if (key !== this.lastResonanceKey) {
      this.lastResonanceKey = key;
      Telemetry.track('resonance_change', { reactions: active, slots: count });
    }
  }

  /**
   * A wave began (v2 §3.В + §8.Б): track the wave number (capacity grows
   * +CAPACITY_PER_WAVE) and reset the per-wave Reroll cost back to its base.
   */
  private onWaveBegan(n: number): void {
    this.waveBadge.setWave(n, this.sim.totalWaves);
    this.currentWave = n;
    this.rerollsThisWave = 0;
    this.resetWaveCounters();
    Telemetry.setContext({ wave: n });
    Telemetry.track('wave_start', { wave: n, budget: this.waveBudget(n) });
    // Elemental Focus lasts only the wave it was played (§4): drop it on wave start.
    if (this.focusElement) {
      this.focusElement = null;
      this.updateFocusLabel();
      this.syncTowers();
    }
    this.refreshEnergy(); // capacity rose by CAPACITY_PER_WAVE this wave
    this.refreshRerollButton();
  }

  /**
   * A wave was cleared (§4): grant the gold bounty (pulsing the chip) and, on a
   * Perfect Clear, the crystal reward — then play the "WAVE REPELLED" plaque with
   * the animated seconds→crystals conversion that streams into the crystal chip.
   */
  private onWaveCleared(n: number, perfect: boolean): void {
    // Flush the per-wave combat aggregate before the rewards mutate state.
    Telemetry.track('wave_combat_summary', {
      wave: n,
      perfect,
      kills: { ...this.waveKills },
      leaks: { ...this.waveLeaks },
      damageByElement: { ...this.waveDmgByElement },
      shotsByCard: { ...this.waveShotsByCard },
      interrupts: this.waveInterrupts,
    });
    Telemetry.track('wave_cleared', { wave: n, perfect });
    this.addReward(WAVE_CLEAR_BONUS, 'wave_clear');
    this.goldChip.pulse();
    const crystals = perfect ? PERFECT_CLEAR_CRYSTALS : 0;
    if (crystals > 0) this.addCrystals(crystals, 'perfect_clear');
    this.playWaveClearedSequence(n, perfect, crystals);
  }

  /** Reset the per-wave combat accumulators. */
  private resetWaveCounters(): void {
    this.waveKills = {};
    this.waveLeaks = {};
    this.waveDmgByElement = {};
    this.waveShotsByCard = {};
    this.waveInterrupts = 0;
  }

  /** Enemy composition of wave `n` (1-based) as { enemyId: count } for wave_start. */
  private waveBudget(n: number): Record<string, number> {
    const wave = this.levelCombat.waves[n - 1];
    const budget: Record<string, number> = {};
    if (wave) {
      for (const g of wave.groups) budget[g.enemyId] = (budget[g.enemyId] ?? 0) + g.count;
    }
    return budget;
  }

  /** Grant crystals (Perfect Clear / elite drop) and refresh wallet-gated UI. */
  private addCrystals(n: number, reason: string): void {
    if (!n) return;
    this.state.crystals += n;
    this.emitEcon('faucet', 'crystals', n, reason);
    this.refreshRerollButton();
    this.refreshHandAffordability(); // crystal-priced cards may now be affordable
  }

  /** Spend crystals (Reroll / fusion / Emergency Overdrive) and refresh wallet-gated UI. */
  private spendCrystals(n: number, reason: string): void {
    this.state.crystals = Math.max(0, this.state.crystals - n);
    this.emitEcon('sink', 'crystals', n, reason);
    this.refreshRerollButton();
    this.refreshHandAffordability(); // a crystal-priced card may now be locked
  }

  /** Single funnel for the currency ledger → telemetry (faucets + sinks, §6). */
  private emitEcon(
    kind: 'faucet' | 'sink',
    currency: 'gold' | 'crystals',
    amount: number,
    reason: string,
  ): void {
    Telemetry.track('econ', {
      kind,
      currency,
      amount,
      reason,
      balanceAfter: currency === 'gold' ? this.state.gold : this.state.crystals,
    });
  }

  /** Crystal cost of the next hand Reroll this wave (v2 §8.Б: base, +step each use). */
  private rerollCost(): number {
    return REROLL_BASE_COST + this.rerollsThisWave * REROLL_STEP;
  }

  /** Update the Reroll caption (live cost) and enable it only when affordable.
   *  Reroll is a campaign unlock (progression §3.Б, lvl 2) — hidden until then. */
  private refreshRerollButton(): void {
    if (!this.mechanics.has('reroll')) {
      this.rerollBtn.visible = false;
      return;
    }
    this.rerollBtn.visible = true;
    const cost = this.rerollCost();
    this.rerollBtn.setLabel(t('battle.reroll', { cost }));
    this.rerollBtn.setEnabled(this.state.crystals >= cost && !this.banner);
  }

  /**
   * Reroll the whole hand for Crystals (v2 §8.Б / §1.4): replace all three hand
   * cards with fresh rolls. Cost climbs per use within a wave and resets each
   * wave. No-op while dragging, on the end banner, or when unaffordable.
   */
  private doReroll(): void {
    if (this.dragging || this.banner) return;
    const cost = this.rerollCost();
    if (this.state.crystals < cost) return;
    this.services.audio.playSfx('sfx_reroll');
    this.spendCrystals(cost, 'reroll');
    this.rerollsThisWave++;
    Telemetry.track('reroll', { costCrystals: cost, rerollsThisWave: this.rerollsThisWave });
    this.clearInspect();
    for (const slot of this.hand) {
      slot.returnTween?.stop();
      slot.returnTween = undefined;
      if (slot.card && !slot.card.destroyed) slot.card.destroy();
      slot.card = null;
      slot.cooldown = 0;
      slot.charge.visible = false;
      this.spawnIntoSlot(slot);
    }
    this.refreshRerollButton();
  }

  /** A brief line FX for chain-lightning hops and Railgun pierce beams. */
  private beam(x1: number, y1: number, x2: number, y2: number, element: ElementId, iconKey?: string): void {
    const color = ELEMENTS[element].glow;
    const g = new Graphics();
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: this.arenaW * 0.011, color, alpha: 0.9 });
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: this.arenaW * 0.004, color: COLORS.white, alpha: 0.9 });
    this.fxLayer.addChild(g);
    this.track(
      tween({
        duration: 0.2,
        easing: Easings.outCubic,
        onUpdate: (t) => { if (!g.destroyed) g.alpha = 1 - t; },
        onComplete: () => { if (!g.destroyed) g.destroy(); },
      }),
    );
    // A fast tracer slug shoots from the muzzle to the far end, leaving a fading
    // trail — the "projectile" of an instant pierce/chain beam (Railgun et al.).
    const style = shotStyle(iconKey ?? '', element);
    const tex = this.services.assets.has(style.shot) ? this.services.assets.get(style.shot) : null;
    if (tex) {
      const slug = new ProjectileView(tex, element, this.arenaW * 0.014, {
        trail: true,
        baseAngle: style.baseAngle,
      });
      slug.setAngle(Math.atan2(y2 - y1, x2 - x1));
      slug.setPos(x1, y1);
      this.fxLayer.addChild(slug);
      this.track(
        tween({
          duration: 0.13,
          easing: Easings.linear,
          onUpdate: (t) => {
            if (slug.destroyed) return;
            slug.setPos(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
            slug.setAngle(Math.atan2(y2 - y1, x2 - x1));
          },
          onComplete: () => { if (!slug.destroyed) slug.destroy(); },
        }),
      );
    }
  }

  /**
   * Award gold (on a kill or a wave clear) and refresh the hand locks. The chip
   * *display* isn't set here — it chases `state.gold` each frame ({@link chaseChips})
   * so the counter visibly ticks up as the coins land (task §3).
   */
  private addReward(gold: number, reason: string): void {
    if (!gold) return;
    this.state.gold += gold;
    this.emitEcon('faucet', 'gold', gold, reason);
    this.refreshHandAffordability();
  }

  /** Spend gold (placing a card) and refresh the hand locks (display chases). */
  private spendGold(gold: number, reason: string): void {
    this.state.gold = Math.max(0, this.state.gold - gold);
    this.emitEcon('sink', 'gold', gold, reason);
    this.refreshHandAffordability();
  }

  /** Lock every hand card the player can no longer afford (and unlock the rest). */
  private refreshHandAffordability(): void {
    for (const slot of this.hand) {
      if (slot.card) slot.card.setAffordable(this.canAffordCard(slot.card.def));
    }
  }

  /** Draw the attack/barrier-range footprint of the held card centered on a slot. */
  private showRangePreview(slot: SlotView, def: CardDef, grade: number): void {
    this.rangePreview.clear();
    const baseRange = towerStats(def, grade).rangeCells;
    if (baseRange <= 0) {
      this.rangePreview.visible = false;
      return;
    }
    const r = baseRange * this.grid.cellWorldSize;
    const skin = ELEMENTS[def.element];
    const p = this.grid.slotScenePos(slot.index);
    this.rangePreview.position.set(p.x, p.y);
    this.rangePreview.circle(0, 0, r).fill({ color: skin.glow, alpha: 0.12 });
    this.rangePreview.circle(0, 0, r).stroke({ width: 4, color: skin.glow, alpha: 0.8 });
    this.rangePreview.visible = true;
  }

  private hideRangePreview(): void {
    this.rangePreview.clear();
    this.rangePreview.visible = false;
  }

  /** Create/update an EnemySprite per live sim enemy; bob + HP bar + hit flash. */
  private syncEnemies(dt: number): void {
    const { assets } = this.services;
    const now = this.sim.now;
    for (const e of this.sim.enemies) {
      let view = this.enemyViews.get(e.id);
      if (!view) {
        // Support mobs telegraph their buff reach with an element-tinted aura ring.
        const aura =
          e.def.archetype === 'support' && e.def.auraRadiusFrac
            ? { color: ELEMENTS[e.def.element].glow, radiusPx: e.def.auraRadiusFrac * this.arenaW }
            : undefined;
        const fx = {
          burn: assets.has('fx_burn') ? assets.get('fx_burn') : undefined,
          frost: assets.has('fx_frost') ? assets.get('fx_frost') : undefined,
        };
        view = new EnemySprite(assets.get(e.def.iconKey), this.enemySize, e.id * 0.7, aura, fx);
        this.enemyViews.set(e.id, view);
        this.enemyHpSeen.set(e.id, e.hp);
        this.enemyLayer.addChild(view);
      }
      const prev = this.enemyHpSeen.get(e.id);
      if (prev !== undefined && e.hp < prev) view.playHit();
      this.enemyHpSeen.set(e.id, e.hp);
      view.position.set(e.x, e.y);
      // Y-sort (lower on the board draws over those further up) + a gentle perspective
      // scale (closer = bigger) for the slightly tilted arena.
      view.zIndex = e.y;
      const depth = Math.min(1, Math.max(0, e.y / this.arenaH));
      view.scale.set(0.9 + 0.18 * depth);
      // Face the way it's marching (art faces left; flip when heading right).
      // On (near-)vertical legs there's no horizontal heading, so face the arena
      // center — the enemy looks "inward" toward the platform instead of keeping
      // a stale left/right carried over from a previous horizontal leg.
      const heading = this.path.headingAt(e.t);
      const faceDx =
        Math.abs(heading.x) >= Math.abs(heading.y) ? heading.x : this.arenaW * 0.5 - e.x;
      view.setFacing(faceDx);
      // Status overlays/wash from the sim's live deadlines.
      view.setStatus({
        burning: e.dotUntil > now && e.dotDps > 0,
        wet: e.wetUntil > now,
        chilled: (e.slowUntil > now && e.slowFactor < 1) || e.stunUntil > now,
      });
      view.setHpFrac(e.hp / e.maxHp);
      view.setShield(e.shield, e.shieldMax);
      view.tick(dt);
    }
  }

  /** Create/update a bolt per live projectile; drop the view once it is gone.
   *  Impact flashes are driven by the sim's onProjectileHit (real hits only), so
   *  a bolt that fizzles on an already-dead target leaves no phantom burst. */
  private syncProjectiles(): void {
    const radius = this.arenaW * 0.016;
    const { assets } = this.services;
    const live = new Set<number>();
    for (const p of this.sim.projectiles) {
      live.add(p.id);
      let view = this.projViews.get(p.id);
      if (!view) {
        const style = shotStyle(p.sourceIcon, p.element);
        const tex = assets.has(style.shot) ? assets.get(style.shot) : null;
        view = new ProjectileView(tex, p.element, radius, {
          trail: style.motion === 'homing',
          baseAngle: style.baseAngle,
        });
        this.projViews.set(p.id, view);
        this.fxLayer.addChild(view);
      }
      // Ballistic shots lift on a cosmetic parabola over the ground line (the sim's
      // p.x/p.y — and thus the impact/splash point — stay on the ground).
      let ry = p.y;
      if (p.arcPeak > 0 && p.firePos) {
        const total = Math.hypot(p.firePos.x - p.originX, p.firePos.y - p.originY);
        const trav = Math.hypot(p.x - p.originX, p.y - p.originY);
        const f = total > 0 ? Math.min(1, trav / total) : 1;
        ry = p.y - this.arenaW * p.arcPeak * Math.sin(Math.PI * f);
      }
      view.setPos(p.x, ry);
      const prev = this.projPrev.get(p.id);
      if (prev && (p.x !== prev.x || ry !== prev.y)) {
        view.setAngle(Math.atan2(ry - prev.y, p.x - prev.x));
      }
      this.projPrev.set(p.id, { x: p.x, y: ry });
    }
    for (const [id, view] of this.projViews) {
      if (live.has(id)) continue;
      view.destroy();
      this.projViews.delete(id);
      this.projPrev.delete(id);
    }
  }

  /**
   * Mirror each tower's firing cooldown into its corner dial, drive its net-effect
   * badge (v3 §9) and pulse the synergy dots.
   */
  private syncCooldowns(dt: number): void {
    const overload =
      this.sim.status === 'running'
        ? overloadAmount(this.state.energyLoad, this.effectiveCapacity)
        : 0;
    for (let i = 0; i < this.grid.slots.length; i++) {
      const slot = this.grid.slots[i];
      if (!slot || !slot.isOccupied) continue;
      const frac = this.sim.cooldownFrac(i);
      // Aim the turret at its lead enemy (sim coords == scene coords); null keeps
      // the last facing. tickAim then steps it there one octant at a time.
      const aim = this.sim.towerAim(i);
      if (aim) {
        const p = this.grid.slotScenePos(i);
        slot.setAim(Math.atan2(aim.y - p.y, aim.x - p.x));
      } else {
        slot.setAim(null);
      }
      slot.tickAim(dt);
      // Gate the (next) sim shot on the head having finished turning onto the target:
      // a rotating turret holds fire until it's lined up so bolts don't leave a
      // mid-rotation barrel. Static towers report true and are never gated.
      this.sim.setTowerAimReady(i, slot.isAimed());
      // Feed the sim the tower's muzzle point for its CURRENT facing frame, so shots
      // and the muzzle flash leave it (next sim.update reads it): rotating turrets'
      // per-octant anchor, or a static tower's fixed point (e.g. frost_pulse top-center).
      // null for towers with no anchor entry → sim uses its radial fallback.
      this.sim.setTowerMuzzle(i, this.grid.muzzleScenePos(i));
      this.syncTowerBadge(slot, i, overload, frac);
      slot.tickDots(dt);
    }
  }

  /**
   * Drive a tower's net-effect badge (v3 §9): collapse the neighbor buffs and
   * penalties it receives plus its own overload penalty into one signed % — so a
   * resonating tower under mild overload reads "+15%", not a misleading "−15%".
   * The color encodes *composition*: green = only bonuses, red = only penalties,
   * yellow = both (a fixable drop). Shown only on firing towers (the support
   * batteries that aren't slowed by overload don't carry it).
   */
  private syncTowerBadge(slot: SlotView, index: number, overload: number, frac: number): void {
    const placed = this.state.slots[index];
    const def = placed ? getCard(placed.cardId) : null;
    // Only attacking towers — their damage/tempo/range the buffs actually scale,
    // and they carry overload + resonance. Support batteries/barriers don't (and
    // get no charge bar either — `state < 0` hides it).
    if (!placed || !def || def.category !== 'attacking') {
      slot.setEffect(0, false, false);
      slot.setCharge(frac, -1);
      return;
    }
    const syn = this.synergy[index];
    let bonusPct = 0;
    let penaltyPct = 0;
    for (const b of syn?.incoming ?? []) {
      // Armor buffs are a no-op in the sim (towers take no damage), so they'd
      // only inflate the badge — count just the combat-affecting modifiers.
      if (b.stat === 'defense') continue;
      if (b.value > 0) bonusPct += b.value;
      else if (b.value < 0) penaltyPct += -b.value;
    }
    penaltyPct += Math.round(towerOverloadPenalty(overload, cardLoad(def, placed.grade)) * 100);

    const hasBonus = bonusPct > 0 || (syn?.reactions.length ?? 0) > 0;
    const hasPenalty = penaltyPct > 0;
    // Efficiency state shared by the badge color and the charge-bar color:
    // 0 normal · 1 bonus · 2 penalty · 3 both.
    const state = !hasBonus && !hasPenalty ? 0 : hasBonus && hasPenalty ? 3 : hasPenalty ? 2 : 1;
    slot.setEffect(bonusPct - penaltyPct, hasBonus, hasPenalty);
    slot.setCharge(frac, state);
  }

  /** Announce the pre-wave / intermission countdown; fade out once spawning. */
  private updateWaveToast(dt: number): void {
    let target = 0;
    if (this.sim.status === 'running' && this.sim.wavePhase === 'countdown') {
      const secs = Math.max(0, Math.ceil(this.sim.countdown));
      this.waveToast.text = t('battle.waveToast', { n: this.sim.nextWaveNumber, secs });
      target = 0.95;
    }
    this.waveToast.alpha += (target - this.waveToast.alpha) * Math.min(1, dt * 8);
  }

  /** Draw the active march route over the arena art (worn trench + warm inlay). */
  private drawRoad(): void {
    // The march route is now baked into each per-level arena art (`bg_lvl_*`),
    // so the procedural road polyline is hidden — only clear the layer. The path
    // itself stays live (sim movement, telegraph, Disruptor reach all read it).
    this.roadLayer.clear();
  }

  /** Park the pre-wave pin at the entry, spike pointing back at the off-screen source. */
  private buildTelegraph(): void {
    const pts = this.path.points;
    const entry = pts[1] ?? pts[0]!; // where the wave enters view
    const src = pts[0] ?? entry; // off-screen spawn the wave comes IN from
    // Head sits at the entry (nudged toward the platform so the pin reads inside the
    // frame); the spike then points outward, back toward the off-screen source.
    const mx = entry.x + (this.arenaW * 0.5 - entry.x) * 0.16;
    const my = entry.y + (this.arenaH * 0.5 - entry.y) * 0.16;
    this.telegraph = new WaveTelegraph(this.arenaW * 0.16);
    this.telegraph.position.set(mx, my);
    this.telegraph.setHeading(Math.atan2(src.y - entry.y, src.x - entry.x));
    this.telegraph.alpha = 0;
    this.telegraphWaveShown = -2;
    this.field.addChild(this.telegraph);
  }

  /** Fade/pulse the source marker during the pre-wave countdown; show the next enemy. */
  private updateTelegraph(dt: number): void {
    if (!this.telegraph) return;
    const active = this.sim.status === 'running' && this.sim.wavePhase === 'countdown';
    if (active) {
      const upcoming = this.sim.nextWaveNumber - 1; // 0-based index of the wave about to start
      if (upcoming !== this.telegraphWaveShown) {
        this.telegraphWaveShown = upcoming;
        this.telegraph.setEnemyIcon(this.upcomingLeadEnemyTexture(upcoming));
      }
      this.telegraphPulse += dt;
      this.telegraph.scale.set(1 + 0.1 * Math.sin(this.telegraphPulse * 5));
    }
    this.telegraph.alpha += ((active ? 0.95 : 0) - this.telegraph.alpha) * Math.min(1, dt * 8);
  }

  /** Texture of the lead enemy of wave `idx` (0-based), or null if none/out of range. */
  private upcomingLeadEnemyTexture(idx: number): Texture | null {
    const enemyId = this.levelCombat.waves[idx]?.groups[0]?.enemyId;
    if (!enemyId) return null;
    try {
      return this.services.assets.get(getEnemy(enemyId).iconKey);
    } catch {
      return null;
    }
  }

  /** A short element-colored energy burst (muzzle flash / projectile impact). */
  private burst(x: number, y: number, color: number, size: number): void {
    const g = glowCircle(size, color, 0.85);
    g.position.set(x, y);
    this.fxLayer.addChild(g);
    this.track(
      tween({
        duration: 0.22,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (g.destroyed) return;
          g.scale.set(0.6 + 0.8 * t);
          g.alpha = 1 - t;
        },
        onComplete: () => { if (!g.destroyed) g.destroy(); },
      }),
    );
  }

  /**
   * Impact VFX (onProjectileHit): an element-colored glow bloom, a fx_impact flash
   * sprite, and a radial spray of shrapnel shards that arc out under gravity.
   */
  private impact(x: number, y: number, element: ElementId): void {
    const color = ELEMENTS[element].glow;
    this.burst(x, y, color, this.arenaW * 0.03);
    this.spawnFxSprite('fx_impact', x, y, color, this.arenaW * 0.09, 0.3);
    this.spawnShards(x, y, color, 9, this.arenaW * 0.5);
  }

  /** A one-shot tinted VFX sprite that blooms (scale + fade) and self-destructs. */
  private spawnFxSprite(
    key: string,
    x: number,
    y: number,
    tint: number,
    size: number,
    dur: number,
    angle = 0,
  ): void {
    if (!this.services.assets.has(key)) return;
    const s = new Sprite(this.services.assets.get(key));
    fitSprite(s, size, size);
    const base = s.scale.x;
    s.tint = tint;
    s.rotation = angle;
    s.position.set(x, y);
    this.fxLayer.addChild(s);
    this.track(
      tween({
        duration: dur,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (s.destroyed) return;
          s.alpha = 1 - t;
          s.scale.set(base * (0.7 + 0.6 * t));
        },
        onComplete: () => { if (!s.destroyed) s.destroy(); },
      }),
    );
  }

  /**
   * Per-tower muzzle flash: an additive-blended FX sprite (its art is already
   * bright/colored, so no tint) that pops at full alpha, holds {@link MUZZLE_HOLD}
   * seconds, then fades over {@link MUZZLE_FADE}. Used by onTowerFired for the four
   * attacking elements; static fall-through stays on the generic fx_muzzle.
   */
  private spawnMuzzleFlash(key: string, x: number, y: number, size: number): void {
    if (!this.services.assets.has(key)) return;
    const s = new Sprite(this.services.assets.get(key));
    fitSprite(s, size, size);
    s.position.set(x, y);
    s.blendMode = 'add';
    this.fxLayer.addChild(s);
    const total = MUZZLE_HOLD + MUZZLE_FADE;
    this.track(
      tween({
        duration: total,
        easing: Easings.linear,
        onUpdate: (_eased, raw) => {
          if (s.destroyed) return;
          const elapsed = raw * total;
          s.alpha = elapsed <= MUZZLE_HOLD ? 1 : Math.max(0, 1 - (elapsed - MUZZLE_HOLD) / MUZZLE_FADE);
        },
        onComplete: () => { if (!s.destroyed) s.destroy(); },
      }),
    );
  }

  /** Radial shrapnel burst: small spinning shards thrown outward, falling under gravity. */
  private spawnShards(x: number, y: number, color: number, count: number, speed: number): void {
    const r = this.arenaW * 0.006;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.5 + Math.random());
      const g = new Graphics();
      g.poly([-r, 0, r * 0.6, -r * 0.8, r, r * 0.5]).fill({ color });
      g.position.set(x, y);
      g.rotation = a;
      this.fxLayer.addChild(g);
      this.fxParticles.push({
        node: g,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - speed * 0.2, // slight upward bias before gravity pulls down
        spin: (Math.random() - 0.5) * 12,
        life: 0.45,
        ttl: 0.45,
        grav: this.arenaW * 1.1,
      });
    }
  }

  /** A forward cone of bright sparks (muzzle flash) around `angle`. */
  private spawnSparks(
    x: number,
    y: number,
    color: number,
    count: number,
    speed: number,
    angle: number,
    spread: number,
  ): void {
    const r = this.arenaW * 0.004;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread * 2;
      const sp = speed * (0.5 + Math.random());
      const g = new Graphics();
      g.circle(0, 0, r * 1.8).fill({ color, alpha: 0.5 });
      g.circle(0, 0, r).fill({ color: COLORS.white });
      g.position.set(x, y);
      this.fxLayer.addChild(g);
      this.fxParticles.push({
        node: g,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        spin: 0,
        life: 0.28,
        ttl: 0.28,
        grav: 0,
      });
    }
  }

  /** Advance VFX particles (position, gravity, spin, fade); reap the dead. Called each frame. */
  private tickParticles(dt: number): void {
    if (this.fxParticles.length === 0) return;
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i]!;
      p.life -= dt;
      if (p.life <= 0 || p.node.destroyed) {
        if (!p.node.destroyed) p.node.destroy();
        this.fxParticles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.node.x += p.vx * dt;
      p.node.y += p.vy * dt;
      p.node.rotation += p.spin * dt;
      const f = p.life / p.ttl;
      p.node.alpha = Math.min(1, f * 1.6);
      p.node.scale.set(0.4 + 0.6 * f);
    }
  }

  private onTowerFired(slotIndex: number, originX: number, originY: number): void {
    const placed = this.state.slots[slotIndex];
    if (!placed) return;
    this.waveShotsByCard[placed.cardId] = (this.waveShotsByCard[placed.cardId] ?? 0) + 1;
    const def = getCard(placed.cardId);
    this.services.audio.playSfx(TOWER_SHOOT_SFX[placed.cardId] ?? 'sfx_shoot');
    // The muzzle flash blooms at the gun tip the sim fired from (sim coords ==
    // scene coords), so it lines up with the bolt leaving a rotating turret.
    const color = ELEMENTS[def.element].glow;
    this.burst(originX, originY, color, this.arenaW * 0.022);
    // Per-element muzzle flash on actual shots (additive FX-pack art); the Shield's
    // barrier pulse and anything without art fall back to the generic fx_muzzle.
    const muzzleKey = def.category === 'attacking' ? muzzleFlashKey(def.element) : undefined;
    if (muzzleKey && this.services.assets.has(muzzleKey)) {
      this.spawnMuzzleFlash(muzzleKey, originX, originY, this.arenaW * 0.17);
    } else {
      this.spawnFxSprite('fx_muzzle', originX, originY, 0xffffff, this.arenaW * 0.055, 0.16);
    }
    // Spark cone in the firing direction (toward the lead enemy the sim aimed at).
    const aim = this.sim.towerAim(slotIndex);
    if (aim) {
      const ang = Math.atan2(aim.y - originY, aim.x - originX);
      this.spawnSparks(originX, originY, color, 5, this.arenaW * 0.5, ang, 0.5);
    }
  }

  private onEnemyKilled(e: SimEnemy): void {
    this.waveKills[e.def.id] = (this.waveKills[e.def.id] ?? 0) + 1;
    this.addReward(e.bounty, 'kill_bounty');
    this.spawnGoldCoins(e.x, e.y, e.bounty); // coins burst, then stream to the gold chip (§3)
    // Elite crystal drop (v3 §8.В): a second crystal source besides Perfect Clear.
    // The chip display chases state.crystals each frame, so it ticks up on its own.
    const crystals = e.def.crystalBounty ?? 0;
    if (crystals > 0) {
      this.addCrystals(crystals, 'elite_drop');
      this.crystalChip.pulse();
      this.services.audio.playOneOf(['sfx_crystal1', 'sfx_crystal2', 'sfx_crystal3']);
    }
    const view = this.detachEnemyView(e.id);
    if (!view) return;
    this.burst(view.x, view.y, ELEMENTS[e.def.element].glow, this.arenaW * 0.045);
    this.animateEnemyDeath(view);
  }

  private onEnemyLeaked(e: SimEnemy): void {
    this.coreBadge.setValue(this.sim.coreHp);
    this.flash(this.coreBadge, COLORS.energyDanger);
    this.waveLeaks[e.def.id] = (this.waveLeaks[e.def.id] ?? 0) + 1;
    // Individual leaks are low-frequency and high-signal (core damage) → emit each.
    Telemetry.track('enemy_leaked', {
      enemyId: e.def.id,
      coreDamage: e.def.coreDamage,
      coreHp: this.sim.coreHp,
    });
    const view = this.detachEnemyView(e.id);
    if (view) this.animateEnemyLeak(view);
  }

  /** Remove the sprite for `id` from the live maps and hand it back for an exit anim. */
  private detachEnemyView(id: number): EnemySprite | undefined {
    const view = this.enemyViews.get(id);
    this.enemyViews.delete(id);
    this.enemyHpSeen.delete(id);
    return view;
  }

  private animateEnemyDeath(view: EnemySprite): void {
    this.track(
      tween({
        duration: 0.34,
        easing: Easings.outCubic,
        onUpdate: (t) => {
          if (view.destroyed) return;
          view.scale.set(1 + 0.5 * t);
          view.rotation = t * 0.5;
          view.alpha = 1 - t;
        },
        onComplete: () => { if (!view.destroyed) view.destroy(); },
      }),
    );
  }

  private animateEnemyLeak(view: EnemySprite): void {
    this.track(
      tween({
        duration: 0.3,
        easing: Easings.inOutCubic,
        onUpdate: (t) => {
          if (view.destroyed) return;
          view.scale.set(1 - 0.6 * t);
          view.alpha = 1 - t;
        },
        onComplete: () => { if (!view.destroyed) view.destroy(); },
      }),
    );
  }

  // --- Floating numbers / coins / wave-clear sequence (tasks §2 / §3 / §4) ---

  /**
   * A rising damage number over a struck enemy (task §2). Lives in the field's fx
   * layer (arena coords) so it scales with the zoomed playfield; a Wet x2 "crit"
   * reads bigger and gold. A deterministic x-jitter keeps stacked hits legible.
   */
  private floatDamage(x: number, y: number, amount: number, crit: boolean): void {
    if (amount <= 0) return;
    const jitter = ((this.dmgSeq++ % 5) - 2) * this.arenaW * 0.012;
    const size = (crit ? 0.072 : 0.05) * this.arenaW;
    const t = makeText(crit ? `${amount}!` : `${amount}`, 'value', {
      fontSize: size,
      fill: hex(crit ? COLORS.energyOverdrive : COLORS.white),
      stroke: { color: hex(COLORS.black), width: Math.max(2, size * 0.16), alpha: 0.9 },
    });
    t.anchor.set(0.5);
    const sx = x + jitter;
    const startY = y - this.arenaW * 0.045;
    t.position.set(sx, startY);
    this.fxLayer.addChild(t);
    const rise = this.arenaW * (crit ? 0.12 : 0.08);
    this.track(
      tween({
        duration: crit ? 0.85 : 0.62,
        easing: Easings.outCubic,
        onUpdate: (p) => {
          if (t.destroyed) return;
          t.position.set(sx, startY - rise * p);
          t.alpha = p < 0.22 ? p / 0.22 : 1 - (p - 0.22) / 0.78;
          if (crit) t.scale.set(1 + 0.3 * Math.sin(Math.min(1, p * 3) * Math.PI));
        },
        onComplete: () => { if (!t.destroyed) t.destroy(); },
      }),
    );
  }

  /** Convert a sim/arena point to scene space (where the reward layer + HUD live). */
  private fieldToScene(x: number, y: number): PointData {
    return { x: this.field.x + x * this.field.scale.x, y: this.field.y + y * this.field.scale.y };
  }

  /** Center of a HUD chip in scene / reward-layer space. */
  private chipCenter(chip: ResourceChip): PointData {
    return { x: chip.x + chip.chipW / 2, y: chip.y + chip.chipH / 2 };
  }

  /**
   * Coins burst from a dead enemy and, after a ~200ms beat, stream to the gold
   * chip; each landing pulses it while the counter ticks up (task §3).
   */
  private spawnGoldCoins(arenaX: number, arenaY: number, amount: number): void {
    if (amount <= 0) return;
    // Coins are sized ~1/3 of the enemy's on-screen size and spawn just under it.
    const enemyScreen = this.enemySize * this.field.scale.x;
    const from = this.fieldToScene(arenaX, arenaY);
    from.y += enemyScreen * 0.28;
    const count = Math.min(7, Math.max(3, Math.round(amount / 2)));
    this.streamReward(from, this.goldChip, this.services.assets.get('icon_gold'), count, {
      size: enemyScreen * 0.33,
      flyDelay: 0.4,
      grow: true,
      sound: ['sfx_gold1', 'sfx_gold2', 'sfx_gold3'],
    });
  }

  /**
   * Fly `count` reward tokens from `from` (scene space) into a HUD chip: each pops
   * out small with a little scatter, holds, then arcs into the chip — coins *grow*
   * on the way (quadratic) so they read as they approach the counter — and pulses
   * it on arrival. Shared by kill-gold coins (§3) and wave-clear crystals (§4).
   * `opts.size` is the rest size (scene px); the chip target is recomputed each
   * frame so tokens still home if the HUD relays out mid-flight.
   */
  private streamReward(
    from: PointData,
    chip: ResourceChip,
    tex: Texture,
    count: number,
    opts: { size: number; flyDelay: number; grow?: boolean; sound?: string[] },
  ): void {
    const { size, flyDelay } = opts;
    const grow = opts.grow ?? false;
    const sound = opts.sound;
    const baseScale = size / (tex.width || size);
    for (let i = 0; i < count; i++) {
      const coin = new Sprite(tex);
      coin.anchor.set(0.5);
      coin.scale.set(baseScale * 0.3);
      coin.position.set(from.x, from.y);
      coin.alpha = 0;
      this.rewardLayer.addChild(coin);
      const ang = (i / count) * Math.PI * 2 + i * 1.3;
      const spread = size * (0.5 + (i % 3) * 0.35);
      const scatterX = from.x + Math.cos(ang) * spread;
      const scatterY = from.y + Math.sin(ang) * spread;

      // Pop in + scatter, up to rest size.
      this.track(
        tween({
          duration: 0.18,
          easing: Easings.outBack,
          onUpdate: (p) => {
            if (coin.destroyed) return;
            coin.alpha = Math.min(1, p * 1.6);
            coin.position.set(from.x + (scatterX - from.x) * p, from.y + (scatterY - from.y) * p);
            coin.scale.set(baseScale * (0.3 + 0.7 * p));
          },
        }),
      );
      // Hold, then stream into the chip; coins swell on the way via a quadratic ramp.
      this.track(
        tween({
          duration: 0.5,
          delay: flyDelay + i * 0.05,
          easing: Easings.inOutSine,
          onUpdate: (p) => {
            if (coin.destroyed) return;
            const tgt = this.chipCenter(chip);
            coin.position.set(scatterX + (tgt.x - scatterX) * p, scatterY + (tgt.y - scatterY) * p);
            const swell = grow ? 1 + 0.9 * (p * p) : 1 - 0.25 * p;
            coin.scale.set(baseScale * swell);
            coin.alpha = p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;
          },
          onComplete: () => {
            if (!coin.destroyed) coin.destroy();
            if (!chip.destroyed) chip.pulse();
            // One chime per token as it lands — a rising-ish cascade via small
            // per-token pitch variation; throttled so a mass payout never floods.
            if (sound) {
              this.services.audio.playOneOf(sound, {
                rate: 0.94 + (i / Math.max(1, count)) * 0.18,
                throttleMs: 22,
                group: 'reward',
              });
            }
          },
        }),
      );
    }
  }

  /**
   * A Disruptor jammed a tower (§2.Г): a glitchy burst + a floating tag at the
   * turret, plus a slot flash. A crit "STUN" reads heavier than a glancing "JAMMED".
   */
  private onTowerInterrupted(slotIndex: number, kind: 'glitch' | 'stun', x: number, y: number): void {
    this.waveInterrupts++;
    const color = kind === 'stun' ? COLORS.energyDanger : ELEMENTS.Electricity.glow;
    this.burst(x, y, color, this.arenaW * (kind === 'stun' ? 0.06 : 0.04));
    const label = makeText(kind === 'stun' ? t('fx.stun') : t('fx.jammed'), 'label', {
      fontSize: this.arenaW * 0.038,
      fill: hex(color),
    });
    label.anchor.set(0.5);
    const startY = y - this.arenaW * 0.05;
    label.position.set(x, startY);
    this.fxLayer.addChild(label);
    this.track(
      tween({
        duration: 0.7,
        easing: Easings.outCubic,
        onUpdate: (p) => {
          if (label.destroyed) return;
          label.position.set(x, startY - this.arenaW * 0.05 * p);
          label.alpha = 1 - p;
        },
        onComplete: () => { if (!label.destroyed) label.destroy(); },
      }),
    );
    const slot = this.grid.slots[slotIndex];
    if (slot) this.flash(slot, color);
  }

  /**
   * Wave-clear celebration (task §4): a "WAVE REPELLED" plaque, then — on a Perfect
   * Clear — the survived seconds animate-recompute into crystals ("Ns → N gems")
   * which stream into the crystal chip and pulse it.
   */
  private playWaveClearedSequence(n: number, _perfect: boolean, crystals: number): void {
    const { safe, full } = this.services.getLayout();
    const cx = safe.x + safe.width / 2;
    const cy = safe.y + safe.height * 0.32; // raised so the banner clears the crystal readout
    const DIM = 0.5; // background darkening while the bonus message is up

    // Dim the field behind the message.
    const scrim = new Graphics();
    scrim.rect(full.x, full.y, full.width, full.height).fill({ color: COLORS.black, alpha: 1 });
    scrim.alpha = 0;
    this.rewardLayer.addChild(scrim);

    const root = new Container();
    root.position.set(cx, cy);
    root.alpha = 0;
    this.rewardLayer.addChild(root);

    const title = makeText(t('banner.waveRepelled'), 'display', { fontSize: 64, fill: hex(COLORS.energyOk) });
    title.anchor.set(0.5);
    const sub = makeText(t('banner.waveCleared', { n }), 'label', { fontSize: 28, fill: hex(COLORS.textBright) });
    sub.anchor.set(0.5);
    sub.position.set(0, 56);
    root.addChild(title, sub);

    // Fade the plaque + dim out together, then destroy.
    const fadeOut = (delay: number) =>
      this.track(
        tween({
          duration: 0.45,
          delay,
          easing: Easings.inOutSine,
          onUpdate: (p) => {
            if (!root.destroyed) root.alpha = 1 - p;
            if (!scrim.destroyed) scrim.alpha = DIM * (1 - p);
          },
          onComplete: () => {
            if (!root.destroyed) root.destroy();
            if (!scrim.destroyed) scrim.destroy();
          },
        }),
      );

    // Pop the banner + dim in.
    this.track(
      tween({
        duration: 0.4,
        easing: Easings.outBack,
        onUpdate: (p) => {
          if (!root.destroyed) {
            root.alpha = Math.min(1, p * 1.6);
            title.scale.set(0.6 + 0.4 * p);
          }
          if (!scrim.destroyed) scrim.alpha = DIM * Math.min(1, p);
        },
      }),
    );

    if (crystals <= 0) {
      fadeOut(1.1);
      return;
    }

    // Crystal readout, well below the banner so they never overlap.
    const ROW_Y = 196;
    const reason = makeText(t('banner.perfectClear'), 'label', { fontSize: 26, fill: hex(COLORS.crystal) });
    reason.anchor.set(0.5);
    reason.position.set(0, 134);
    reason.alpha = 0;
    const amount = makeText('0s', 'display', { fontSize: 56, fill: hex(COLORS.crystal) });
    amount.anchor.set(0.5);
    amount.position.set(0, ROW_Y);
    amount.alpha = 0;
    const gem = new Sprite(this.services.assets.get('icon_crystal'));
    fitSprite(gem, 56, 56);
    const gemBase = gem.scale.x;
    gem.alpha = 0;
    gem.position.set(0, ROW_Y);
    // Pulsing glow behind the crystals, shown while they hold before flying.
    const glow = glowCircle(72, COLORS.crystal, 0.6);
    glow.position.set(0, ROW_Y);
    glow.alpha = 0;
    root.addChild(glow, reason, amount, gem);

    // Phase 1: count "0s" → "Ns" (the survived time crystallizing).
    this.track(
      tween({
        duration: 0.7,
        delay: 0.5,
        easing: Easings.outCubic,
        onUpdate: (p) => {
          if (root.destroyed) return;
          reason.alpha = Math.min(1, p * 2);
          amount.alpha = 1;
          amount.text = `${Math.round(crystals * p)}s`;
          amount.position.set(0, ROW_Y);
        },
        onComplete: () => {
          if (root.destroyed) return;
          // Phase 2: morph "Ns" → "N" + a crystal icon sliding in beside it.
          amount.text = `${crystals}`;
          amount.position.set(-amount.width * 0.45, ROW_Y);
          this.track(
            tween({
              duration: 0.3,
              easing: Easings.outBack,
              onUpdate: (p) => {
                if (gem.destroyed) return;
                gem.alpha = p;
                gem.scale.set(gemBase * (0.4 + 0.8 * p));
                gem.position.set(amount.x + amount.width / 2 + 34, ROW_Y);
              },
              onComplete: () => {
                if (gem.destroyed) return;
                const gemX = gem.x;
                glow.position.set(gemX, ROW_Y);
                // Phase 3: pulse the glow for a beat, *then* stream the crystals.
                this.track(
                  tween({
                    duration: 0.75,
                    easing: Easings.linear,
                    onUpdate: (p) => {
                      if (glow.destroyed) return;
                      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 4);
                      glow.alpha = 0.35 + 0.45 * pulse;
                      glow.scale.set(0.85 + 0.3 * pulse);
                    },
                    onComplete: () => {
                      const fromScene = { x: cx + gemX, y: cy + ROW_Y };
                      this.streamReward(
                        fromScene,
                        this.crystalChip,
                        this.services.assets.get('icon_crystal'),
                        Math.min(7, crystals),
                        { size: 42, flyDelay: 0.06, grow: true, sound: ['sfx_crystal1', 'sfx_crystal2', 'sfx_crystal3'] },
                      );
                      this.track(
                        tween({
                          duration: 0.3,
                          onUpdate: (p) => { if (!glow.destroyed) glow.alpha = 0.8 * (1 - p); },
                        }),
                      );
                      fadeOut(0.5);
                    },
                  }),
                );
              },
            }),
          );
        },
      }),
    );
  }

  /** Tick the displayed chip values toward the true state so the counters animate (not snap). */
  private chaseChips(dt: number): void {
    this.goldDisplayed = this.chaseValue(this.goldDisplayed, this.state.gold, dt, this.goldChip);
    this.crystalDisplayed = this.chaseValue(this.crystalDisplayed, this.state.crystals, dt, this.crystalChip);
  }

  private chaseValue(displayed: number, target: number, dt: number, chip: ResourceChip): number {
    if (displayed === target) return displayed;
    const diff = target - displayed;
    const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * dt * 5));
    let next = displayed + step;
    if ((diff > 0 && next > target) || (diff < 0 && next < target)) next = target;
    chip.setValue(next);
    return next;
  }

  /**
   * Victory flow: play the level's victory dialogue (config/dialogue.ts) over the
   * cleared board, then present the result. Clearing the *last* campaign level
   * rolls the finale cutscene instead of the result banner. First clear only for
   * the dialogue (Admin replays it); the finale plays on first clear or in Admin.
   */
  private handleVictory(): void {
    const isFinal = LEVEL_ORDER[LEVEL_ORDER.length - 1] === this.levelId;
    const firstClear = !progress.isCleared(this.levelId);
    const vId = victoryDialogueId(this.levelId);
    const vScript = vId ? getDialogue(vId) : undefined;

    const proceed = (): void => {
      if (isFinal && (firstClear || progress.isAdmin())) {
        // Record the clear (unlock + stars) before leaving for the finale, since
        // we bypass the banner that normally records it.
        progress.recordClear(this.levelId, this.sim.coreHp, CORE_MAX);
        Telemetry.track('level_end', { outcome: 'victory', endedAt: { wave: this.sim.waveNumber }, finale: true });
        this.services.navigate('cutscene', { id: 'finale', next: { route: 'menu' } });
        return;
      }
      this.showBanner('victory');
    };

    if (vId && vScript && progress.shouldPlayStory(vId)) {
      this.dialogue = new DialogueOverlay(
        vScript,
        this.services.assets,
        this.services.audio,
        () => {
          progress.markStorySeen(vId);
          this.closeDialogue();
          proceed();
        },
        { dimAlpha: 0.55 },
      );
      this.addChild(this.dialogue);
      this.dialogue.layout(this.services.getLayout());
      return;
    }
    proceed();
  }

  private showBanner(kind: 'victory' | 'defeat'): void {
    if (this.banner) return;
    let opts;
    let levelEndStars = 0; // captured for telemetry below (0 on defeat)
    if (kind === 'victory') {
      // Record the clear: unlocks the next level + grants this level's stars (§4).
      // The returned star count is the single source — it also drives the banner's
      // star row, so what's saved and what's shown can never diverge.
      // Capture first-clear *before* recording: only a genuinely new clear should
      // tout "Tech unlocked" (replays already own the tower).
      const firstClear = !progress.isCleared(this.levelId);
      const stars = progress.recordClear(this.levelId, this.sim.coreHp, CORE_MAX);
      levelEndStars = stars;
      const unlockedCards = firstClear
        ? towersUnlockedByClearing(this.levelId).map((id) => {
            const def = getCard(id);
            return {
              name: cardShortName(def.id, def.shortName),
              element: def.element,
              icon: this.services.assets.get(def.iconKey),
            };
          })
        : [];
      opts = {
        title: t('banner.victory'),
        subtitle: t('banner.coreSummary', { hp: this.sim.coreHp, max: CORE_MAX }),
        accent: COLORS.energyOk,
        // 1–3★ shown as a star row (icon_star sprite) — see BattleBanner.
        stars,
        starTexture: this.services.assets.get('icon_star'),
        // Cards this clear opens up on the next level → "TECH UNLOCKED" reveal.
        unlockedCards,
        buttons: [
          { label: t('common.worldMap'), primary: true, onClick: () => this.services.navigate('worldmap') },
        ],
      };
    } else {
      opts = {
        title: t('banner.defeat'),
        subtitle: t('banner.defeatSub'),
        accent: COLORS.energyDanger,
        buttons: [
          { label: t('common.retry'), primary: true, onClick: () => this.services.navigate('battle', { levelId: this.levelId }) },
          { label: t('common.map'), onClick: () => this.services.navigate('worldmap') },
        ],
      };
    }
    this.banner = new BattleBanner(opts);
    this.banner.alpha = 0;
    this.addChild(this.banner);
    this.refreshRerollButton(); // grey out Reroll once the battle is over
    // Telemetry: level attempt ended — drives win-rate, "where runs die", and pacing.
    Telemetry.track('level_end', {
      outcome: kind,
      stars: levelEndStars,
      coreHp: this.sim.coreHp,
      coreMax: CORE_MAX,
      endedAt: { wave: this.sim.waveNumber },
      durationSec: Math.round(this.battleElapsed * 10) / 10,
      rerolls: this.rerollsThisWave,
      burns: this.burnsThisBattle,
      fusions: this.fusionsThisBattle,
    });
    this.layoutBanner(this.services.getLayout());
    this.track(
      tween({
        duration: 0.4,
        onUpdate: (t) => { if (this.banner && !this.banner.destroyed) this.banner.alpha = t; },
      }),
    );
  }

  private layoutBanner(info: LayoutInfo): void {
    if (!this.banner) return;
    const { full, safe } = info;
    this.banner.setScreen(full.x, full.y, full.width, full.height);
    this.banner.setCenter(safe.x + safe.width / 2, safe.y + safe.height / 2);
  }

  // --- Layout --------------------------------------------------------------

  override layout(info: LayoutInfo): void {
    const { safe } = info;
    const cx = safe.x + safe.width / 2;
    const pad = 18;

    // Neutral backdrop fills the whole canvas; a light scrim just deepens it a
    // touch (the backdrop is already quiet, so no heavy dimming is needed).
    this.marginBg.fit(info);
    const f = info.full;
    this.scrim.clear();
    this.scrim.rect(f.x, f.y, f.width, f.height).fill({ color: COLORS.bgDeep, alpha: 0.22 });

    // --- Top bar: MAP + WAVE (left); gold + crystals + avatar (right) -------
    const topY = safe.y + pad;
    this.backBtn.position.set(safe.x + pad + 75, topY + 32);
    // Gear sits just under the MAP button, left column.
    this.gearBtn.position.set(safe.x + pad + 75, topY + 64 + 12 + 32);
    this.settings?.layout(info);
    this.tutorial?.layout(info);
    this.dialogue?.layout(info);
    this.waveBadge.position.set(safe.x + pad + 160, topY);
    this.coreBadge.position.set(safe.x + pad + 160, topY + this.waveBadge.badgeH + 8);

    // Global mute toggle sits in the top-right corner, above the avatar — mirrors
    // the MAP→gear stack on the left. The avatar drops below it to make room.
    const muteD = 64;
    const avatarCX = safe.x + safe.width - pad - this.avatarR;
    this.muteBtn.position.set(avatarCX, topY + muteD / 2);
    const avatarCY = topY + muteD + 10 + this.avatarR;
    this.avatar.position.set(avatarCX, avatarCY);

    const chipY = avatarCY - this.goldChip.chipH / 2;
    const rowRight = avatarCX - this.avatarR - 16;
    this.crystalChip.position.set(rowRight - this.crystalChip.chipW, chipY);
    this.goldChip.position.set(rowRight - this.crystalChip.chipW - 12 - this.goldChip.chipW, chipY);

    // --- Bottom: hand, then gauge above it ----------------------------------
    const sized = this.hand.find((h) => h.card)?.card;
    const cardH = sized?.cardH ?? 300;
    const cardW = sized?.cardW ?? 212;
    const bottomPad = 22;
    const handCY = safe.y + safe.height - bottomPad - cardH / 2;
    const handGap = 22;
    const totalW = this.hand.length * cardW + (this.hand.length - 1) * handGap;
    let hx = cx - totalW / 2 + cardW / 2;
    for (const slot of this.hand) {
      slot.home = { x: hx, y: handCY };
      slot.charge.position.set(hx, handCY);
      if (slot.card && slot.card !== this.dragging && slot.card.parent === this.handLayer) {
        slot.card.position.set(hx, handCY);
      }
      hx += cardW + handGap;
    }

    const gaugeW = Math.min(safe.width - pad * 2, 920);
    const gaugeH = 70;
    this.gauge.setBarSize(gaugeW, gaugeH);
    const gaugeY = handCY - cardH / 2 - 16 - gaugeH;
    this.gauge.position.set(cx - gaugeW / 2, gaugeY);

    // --- Playfield: zoom the arena so the road ring reaches the screen edges
    //     (the rocky frame baked into the image is cropped off), centered
    //     horizontally. Arena + platform + enemies scale as one locked unit. --
    const leftStackBottom = topY + this.waveBadge.badgeH + 8 + this.coreBadge.badgeH;
    const fieldTop = Math.max(leftStackBottom, avatarCY + this.avatarR) + 14;
    const fieldBottom = gaugeY - 14;
    this.waveToast.position.set(cx, fieldTop + 60);

    // Tower-inspection plaque: top-center, just inside the field viewport.
    this.infoPanelWidth = Math.min(safe.width - pad * 2, 780);
    this.infoPanelPos = { x: cx - this.infoPanelWidth / 2, y: fieldTop + 8 };
    this.infoPanel.setWidth(this.infoPanelWidth);
    this.infoPanel.position.set(this.infoPanelPos.x, this.infoPanelPos.y);
    const availW = safe.width;
    const availH = Math.max(50, fieldBottom - fieldTop);
    const contain = Math.min(availW / this.arenaW, availH / this.arenaH);
    // Fill the width up to the road ring; only ever zoom *in* past contain-fit.
    const fillW = availW / (ROAD_SPAN * this.arenaW);
    // …but never let the platform outgrow the vertical play area (short screens).
    const platformMax = (availH * 0.94) / (this.arenaW * PLATFORM_FRAC);
    const scale = Math.min(Math.max(contain, fillW), platformMax);
    this.field.scale.set(scale);
    const fieldCY = (fieldTop + fieldBottom) / 2;
    this.field.position.set(cx - this.arenaW * 0.5 * scale, fieldCY - this.arenaH * 0.5 * scale);

    // Clip the zoomed field to the game-frame viewport: full width in portrait
    // (so the road bleeds to the true screen edges), and just the centered
    // portrait column in wide mode (so the arena never spills onto the decor).
    const viewX = 0;
    const viewW = info.width;
    this.fieldMask.clear();
    this.fieldMask.roundRect(viewX, fieldTop, viewW, availH, 10).fill({ color: COLORS.white });

    // Frame the viewport: a soft inner vignette + a thin brass edge, so the
    // full-bleed arena reads as an inset window rather than a pasted image.
    this.fieldFrame.clear();
    const vbands = 6;
    for (let i = 0; i < vbands; i++) {
      const inset = i * 5;
      this.fieldFrame
        .roundRect(viewX + inset, fieldTop + inset, viewW - inset * 2, availH - inset * 2, 10)
        .stroke({ width: 6, color: COLORS.black, alpha: 0.06 });
    }
    this.fieldFrame
      .roundRect(viewX + 2, fieldTop + 2, viewW - 4, availH - 4, 10)
      .stroke({ width: 3, color: COLORS.brass, alpha: 0.35 });

    // Reactor: right edge, dropped down to sit just above the energy gauge.
    this.reactor.position.set(
      safe.x + safe.width - pad - this.reactor.zoneW / 2,
      gaugeY - 14 - this.reactor.zoneH / 2,
    );

    // Reroll button: left edge, just above the gauge (mirrors the Reactor side).
    this.rerollBtn.position.set(safe.x + pad + 115, gaugeY - 46);

    this.hint.position.set(cx, gaugeY - 24);

    // Move-cost readout: in the sand near the bottom of the playfield, above the gauge.
    this.moveCostPos = { x: cx, y: fieldBottom - 44 };
    this.moveCost.position.set(this.moveCostPos.x, this.moveCostPos.y);

    // Keep the end-of-battle overlay covering the screen and centered on resize.
    this.layoutBanner(info);
  }

  override update(dt: number): void {
    this.gauge.tick(dt);
    this.tutorial?.tick(dt); // idle float + scripted demo animation while open
    this.dialogue?.tick(dt); // typewriter + portrait life while a story beat plays
    for (const d of this.animatedDecor) d.advance(dt); // ambient looping props (real time)

    // Drive the combat simulation, then mirror it into sprites. Overload from
    // too much energy load slows each tower's fire rate in proportion to its own
    // load (Overdrive lifts the capacity that feeds this).
    if (this.sim.status === 'running') {
      this.sim.overload = overloadAmount(this.state.energyLoad, this.effectiveCapacity);
      this.battleElapsed += dt; // telemetry durationSec (real wall-clock, unscaled)
    }
    // Global gameplay tempo (settings): scale the sim and its coupled visuals —
    // enemy movement, projectile flight, turret rotation, fire cooldowns and every
    // buff/debuff duration all advance off this `g`. UI chrome below keeps raw `dt`.
    const g = dt * gameSpeedScale();
    this.sim.update(g);
    this.syncEnemies(g);
    this.syncProjectiles();
    this.tickParticles(g);
    this.syncCooldowns(g);
    this.updateWaveToast(dt);
    this.updateTelegraph(dt);
    this.modOverlay.tick(dt); // pulse the platform holo while a modernization card is dragged
    this.chaseChips(dt); // gold/crystal counters ease toward their true totals (§3/§4)

    // Keep the inspected tower's overload readout in step with load/capacity.
    if (this.inspectedIndex !== null) this.infoPanel.setOverload(this.towerOverloadPct(this.inspectedIndex));
    this.infoPanel.tick(dt);

    // Overdrive countdown: tick each burn stack; resync capacity when one expires.
    // Scaled by game tempo so the buff lasts the same span of battle time.
    if (this.overdriveStacks.length > 0) {
      const before = this.overdriveStacks.length;
      for (let i = this.overdriveStacks.length - 1; i >= 0; i--) {
        this.overdriveStacks[i]! -= g;
        if (this.overdriveStacks[i]! <= 0) this.overdriveStacks.splice(i, 1);
      }
      if (this.overdriveStacks.length !== before) this.refreshEnergy();
    }

    // Hand recharge: empty positions count down, then spawn a fresh card.
    for (const slot of this.hand) {
      if (slot.card) continue;
      slot.cooldown -= g;
      slot.charge.setProgress(1 - Math.max(0, slot.cooldown) / HAND_RESPAWN_SEC);
      if (slot.cooldown <= 0) this.spawnIntoSlot(slot);
    }

    // Drop finished tween handles so the list can't grow with combat activity
    // (every shot/impact/death adds one); onExit still stops whatever remains.
    if (this.tweens.length > 48) this.tweens = this.tweens.filter((t) => !t.done);
  }

  /** Open the modal audio-settings overlay (gear button), once. */
  private openSettings(): void {
    if (this.settings) return;
    this.services.audio.playSfx('sfx_click');
    this.settings = new SettingsPanel(this.services.audio, () => this.closeSettings());
    this.addChild(this.settings); // top-most, above the drag layer
    this.settings.layout(this.services.getLayout());
  }

  private closeSettings(): void {
    this.settings?.destroy({ children: true });
    this.settings = null;
    // The panel can flip mute too — resync the corner toggle's glyph.
    this.muteBtn.refresh();
  }

  override onExit(): void {
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
    this.closeSettings();
    this.closeTutorial();
    this.rewardLayer.removeChildren().forEach((c) => c.destroy());
    for (const p of this.fxParticles) if (!p.node.destroyed) p.node.destroy();
    this.fxParticles.length = 0;
    this.enemyViews.clear();
    this.enemyHpSeen.clear();
    this.projViews.clear();
    this.projPrev.clear();
    // Decor sprites (and their frame textures) are freed by the scene's
    // destroy({children:true}) right after onExit — just drop our references.
    this.animatedDecor.length = 0;
  }
}
