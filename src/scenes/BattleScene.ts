import { Container, type FederatedPointerEvent, Graphics, type PointData, Sprite, type Texture } from 'pixi.js';
import { COLORS, ELEMENTS, ELEMENT_IDS, type ElementId, elementSymbolKey, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene, type SceneParams } from '../core/scene';
import { tween, Easings, type TweenHandle } from '../core/tween';
import { createBattleState } from '../config/battleState';
import {
  HAND_RESPAWN_SEC,
  HAND_SIZE,
  MOD_EMERGENCY_OVERDRIVE_SEC,
  MOD_FOCUS_DMG_MULT,
  MOD_ISOLATION_CAPACITY,
  OVERDRIVE_SEC,
  overdriveCost,
  REROLL_BASE_COST,
  REROLL_STEP,
  rollHandCard,
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
import { DRAW_POOL, MOD_CARD_POOL, MOD_DRAW_CHANCE } from '../config/battleRules';
import type { BattleStateMock, CardDef, HandCard } from '../config/types';
import { towersUnlockedByClearing, unlockedMechanicsForLevel, unlockedTowersForLevel } from '../config/progression';
import * as progress from '../game/progress';
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
import { BattleBanner } from '../ui/BattleBanner';
import { BattleCard } from '../ui/BattleCard';
import { Button } from '../ui/Button';
import { GearButton } from '../ui/GearButton';
import { MuteButton } from '../ui/MuteButton';
import { SettingsPanel } from '../ui/SettingsPanel';
import { CoreBadge } from '../ui/CoreBadge';
import { EnemySprite } from '../ui/EnemySprite';
import { EnergyGauge } from '../ui/EnergyGauge';
import { HandSlotView } from '../ui/HandSlotView';
import { HeroAvatar } from '../ui/HeroAvatar';
import { ModOverlay } from '../ui/ModOverlay';
import { MoveCostReadout, type CostPart } from '../ui/MoveCostReadout';
import { PlatformGrid } from '../ui/PlatformGrid';
import { ProjectileView } from '../ui/Projectile';
import { ReactorZone } from '../ui/ReactorZone';
import { ResourceChip } from '../ui/ResourceChip';
import { SceneBackground } from '../ui/SceneBackground';
import type { SlotView } from '../ui/SlotView';
import { TowerInfoPanel } from '../ui/TowerInfoPanel';
import { WaveBadge } from '../ui/WaveBadge';
import { WaveTelegraph } from '../ui/WaveTelegraph';
import { fitSprite, glowCircle, makeText } from '../ui/helpers';

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

/**
 * Per-tower fire SFX by card id (see docs/planned/tower-sound-design.md). Towers
 * not listed (support / unknown) fall back to the generic `sfx_shoot`.
 */
const TOWER_SHOOT_SFX: Record<string, string> = {
  plasma_shutter: 'sfx_shoot_plasma',
  frost_pulse: 'sfx_shoot_frost',
  storm_coil: 'sfx_shoot_storm',
  railgun: 'sfx_shoot_railgun',
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
  /** 1-based number of the wave in progress; drives the §3.В wave-capacity growth. */
  private currentWave = 1;
  /** Hand rerolls used in the current wave; resets each wave (§8.Б cost escalation). */
  private rerollsThisWave = 0;
  /** Cards burned in the Reactor this battle; drives the escalating burn cost (§3.Г). */
  private burnsThisBattle = 0;
  private resonanceLabel = makeText('', 'label', { fontSize: 26, fill: hex(COLORS.energyOverdrive) });
  /** Resolved positional synergy per slot (v2 model), recomputed on every change. */
  private synergy: (SlotSynergy | null)[] = [];
  private hint = makeText('Drag a card onto a slot or the Reactor', 'micro', { fontSize: 20 });
  private waveToast = makeText('', 'title', { fontSize: 80, fill: hex(COLORS.white) });

  private hand: HandSlot[] = [];

  // --- Combat simulation + its sprite mirrors ------------------------------
  private sim!: BattleSim;
  private path!: ArenaPath;
  private enemyViews = new Map<number, EnemySprite>();
  /** Last HP seen per enemy id, to trigger a hit-flash when it drops. */
  private enemyHpSeen = new Map<number, number>();
  private projViews = new Map<number, ProjectileView>();
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
    this.state = createBattleState(unlocked);
    this.burnsThisBattle = 0; // burn price escalates per battle, fresh each entry (§3.Г)
    console.log(`[Battle] level ${this.levelId} — towers: ${[...unlocked].join(', ')}`);
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
    this.field.addChild(this.rangePreview, this.inspectRange, this.modOverlay, this.enemyLayer, this.fxLayer);

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
          this.floatDamage(e.x, e.y, amount, crit);
        },
        onTowerInterrupted: (slot, kind, x, y) => {
          this.services.audio.playSfx(kind === 'stun' ? 'sfx_stun' : 'sfx_disrupt');
          this.onTowerInterrupted(slot, kind, x, y);
        },
        onTowerFired: (slotIndex) => this.onTowerFired(slotIndex),
        onProjectileHit: (x, y, element) => this.burst(x, y, ELEMENTS[element].glow, this.arenaW * 0.03),
        onBeam: (x1, y1, x2, y2, element) => this.beam(x1, y1, x2, y2, ELEMENTS[element].glow),
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
          this.showBanner('victory');
        },
        onDefeat: () => {
          this.services.audio.playSfx('sfx_defeat');
          this.showBanner('defeat');
        },
      },
    });
    this.refreshSynergy();
    this.syncTowers();
    this.sim.start();

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
      label: 'MAP',
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
      label: `REROLL ${REROLL_BASE_COST}`,
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
    this.inspectedIndex = index;
    this.grid.inspect(index); // neighbor cells, arrows, effect badges
    this.drawInspectRange(index, def, placed.grade); // attack radius over the road
    this.infoPanel.setWidth(this.infoPanelWidth);
    this.infoPanel.show(def, placed.grade, towerStats(def, placed.grade), this.synergy[index] ?? null);
    this.infoPanel.setOverload(this.towerOverloadPct(index));
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
      this.inspectedIndex = null;
      this.grid.clearInspect();
      this.inspectRange.clear();
      this.inspectRange.visible = false;
    }
    if (this.inspectedCard && !this.inspectedCard.destroyed) this.inspectedCard.setSelected(false);
    this.inspectedCard = null;
    this.infoPanel.hide();
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

  /** Gold price of the next Reactor burn this battle (base + step per burn, §3.Г). */
  private burnCost(): number {
    return overdriveCost(this.burnsThisBattle);
  }

  private showReactor(): void {
    this.reactorTween?.stop();
    this.reactor.visible = true;
    // Push the current (escalating) burn price + affordability onto the slot.
    const cost = this.burnCost();
    this.reactor.setCost(cost, this.state.gold >= cost);
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
    this.clearInspect(); // inspection and dragging are mutually exclusive modes
    const entry = this.hand.find((h) => h.card === card);
    entry?.returnTween?.stop();
    if (entry) entry.returnTween = undefined;

    this.dragging = card;
    card.cursor = 'grabbing';

    const gp = card.getGlobalPosition();
    this.dragLayer.addChild(card);
    const local = this.dragLayer.toLocal(gp);
    card.position.copyFrom(local);

    const pointerLocal = this.dragLayer.toLocal(e.global);
    this.dragOffset = { x: local.x - pointerLocal.x, y: local.y - pointerLocal.y };

    this.track(tween({ duration: 0.12, onUpdate: (t) => { if (!card.destroyed) card.scale.set(1 + 0.14 * t); } }));
    card.alpha = 0.97;
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
    const avatar = this.makeCard(def, placed.grade);
    avatar.eventMode = 'none'; // visual only; slot/card move+up handlers drive it
    this.dragging = avatar;
    this.fieldDragFrom = slot.index;

    const gp = slot.getGlobalPosition();
    this.dragLayer.addChild(avatar);
    const local = this.dragLayer.toLocal(gp);
    avatar.position.copyFrom(local);
    const pointerLocal = this.dragLayer.toLocal(e.global);
    this.dragOffset = { x: local.x - pointerLocal.x, y: local.y - pointerLocal.y };

    this.track(tween({ duration: 0.12, onUpdate: (t) => { if (!avatar.destroyed) avatar.scale.set(1 + 0.14 * t); } }));
    avatar.alpha = 0.97;
    this.previewSlot = null;
    this.cardGhosted = false;

    this.grid.showMergeTargets(def.id, placed.grade, slot.index);
    this.hint.alpha = 0.95;
  }

  private onDragMove(e: FederatedPointerEvent): void {
    const card = this.dragging;
    if (!card) return;
    const p = this.dragLayer.toLocal(e.global);
    card.position.set(p.x + this.dragOffset.x, p.y + this.dragOffset.y);

    // Modernization cards have their own (platform-wide) drag feedback.
    if (card.def.category === 'modernization') {
      this.onModDragMove(card, e);
      return;
    }

    const fieldDrag = this.fieldDragFrom !== null;
    // Reactor is only a target for hand cards (you can't burn a placed tower).
    const overReactor = !fieldDrag && this.reactor.visible && this.reactor.containsGlobal(e.global);
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
    if (!fieldDrag) {
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
    if (parts && resonates) parts.push({ text: 'RESONANCE', color: COLORS.synergy });
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
        this.goldPart(goldIcon, this.burnCost()),
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
        { text: `→ Lv${previewGrade}`, color: COLORS.energyOverdrive },
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
    return { icon, text: `-${cost}`, color: this.state.gold >= cost ? COLORS.gold : COLORS.energyDanger };
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
    // Fully fade the card out over a slot so only the clean build-preview shows.
    const to = on ? 0 : 0.97;
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

    // Field-to-field merge: a lifted tower only drops onto a matching same-grade
    // tower (not its origin); anything else glides it back home.
    if (fromIndex !== null) {
      if (slot && slot.index !== fromIndex && this.canMerge(card.def.id, card.grade, slot.index)) {
        this.mergeFieldTower(fromIndex, slot.index, card);
      } else {
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
    this.state.slots[slot.index] = { cardId: def.id, grade: card.grade };
    this.spendGold(def.costGold);
    this.refreshEnergy(); // load grows by this card's base step
    this.grid.applyState(this.state); // renders the tower + redraws broadcast beams
    this.refreshSynergy(); // recompute neighbor buffs / resonance
    this.syncTowers(); // the new tower joins the firing line

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
    this.state.slots[slot.index] = { cardId: placed.cardId, grade: newGrade };
    this.spendGold(def.costGold);
    this.refreshEnergy(); // higher grade draws more load; capacity also grows (§3.В)
    this.grid.applyState(this.state);
    this.refreshSynergy();
    this.syncTowers();

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
    this.state.slots[toIndex] = { cardId: target.cardId, grade: newGrade };
    this.state.slots[fromIndex] = null; // the consumed tower leaves the platform
    this.spendGold(cost);
    this.refreshEnergy();
    this.grid.applyState(this.state);
    this.refreshSynergy();
    this.syncTowers();

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
    const label = makeText(`Lv${grade}`, 'title', { fontSize: 40, fill: hex(COLORS.energyOverdrive) });
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
    this.services.audio.playSfx('sfx_burn');
    this.spendGold(this.burnCost());
    this.burnsThisBattle++;
    this.overdriveStacks.push(OVERDRIVE_SEC);
    this.refreshEnergy();
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
          { text: 'ISOLATION', color: COLORS.crystal },
          { icon: energyIcon, text: `+${MOD_ISOLATION_CAPACITY} CAP`, color: COLORS.energyOk },
          this.goldPart(goldIcon, def.costGold),
        ];
      case 'overdrive':
        return [
          { text: 'OVERDRIVE', color: COLORS.energyOverdrive },
          {
            icon: energyIcon,
            text: `+${OVERDRIVE_CAPACITY_BONUS} CAP ${MOD_EMERGENCY_OVERDRIVE_SEC}s`,
            color: COLORS.energyOverdrive,
          },
          this.crystalPart(crystalIcon, def.costCrystals ?? 0),
        ];
      case 'focus': {
        const label = el ? ELEMENTS[el].label : 'PICK ELEMENT';
        const color = el ? ELEMENTS[el].glow : COLORS.textDim;
        return [
          { text: `FOCUS ${label}`, color },
          { text: `+${Math.round((MOD_FOCUS_DMG_MULT - 1) * 100)}% DMG`, color: COLORS.dropValid },
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
    this.spendGold(card.def.costGold);
    this.state.energyCapacity += MOD_ISOLATION_CAPACITY;
    this.refreshEnergy();
    this.flash(this.gauge, COLORS.crystal);
    this.freeHandCard(card);
    this.animateModApply(card);
  }

  /** Elemental Focus (§4): +DMG to all towers of `el` until the wave ends. */
  private applyFocus(card: BattleCard, el: ElementId): void {
    this.services.audio.playSfx('sfx_place');
    this.spendGold(card.def.costGold);
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
    this.spendCrystals(card.def.costCrystals ?? 0);
    this.overdriveStacks.push(MOD_EMERGENCY_OVERDRIVE_SEC);
    this.refreshEnergy();
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
      this.focusLabel.text = `FOCUS: ${skin.label}  +${Math.round((MOD_FOCUS_DMG_MULT - 1) * 100)}%`;
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

  /** Toggle the bright ring on the hand card currently under the dragged card. */
  private setFusionTarget(target: BattleCard | null): void {
    if (this.fusionTarget === target) return;
    if (this.fusionTarget && !this.fusionTarget.destroyed) this.fusionTarget.setSelected(false);
    this.fusionTarget = target;
    if (target && !target.destroyed) target.setSelected(true);
  }

  /**
   * Fuse two different hand cards into a hybrid (v2 §6.5). The dragged source's
   * hand position recharges; the target slot becomes the hybrid (Grade I) for the
   * player to deploy. Costs scalable gold + a flat crystal.
   */
  private fuseCards(dragged: BattleCard, target: BattleCard, hybridId: string): void {
    this.services.audio.playSfx('sfx_fusion');
    this.spendGold(fusionGoldCost(dragged.grade, target.grade));
    this.spendCrystals(FUSION_CRYSTAL_COST);
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
    this.resonanceLabel.text = count > 1 ? `RESONANCE ×${count}` : count === 1 ? 'RESONANCE' : '';
    this.resonanceLabel.alpha = count > 0 ? 1 : 0;
  }

  /**
   * A wave began (v2 §3.В + §8.Б): track the wave number (capacity grows
   * +CAPACITY_PER_WAVE) and reset the per-wave Reroll cost back to its base.
   */
  private onWaveBegan(n: number): void {
    this.waveBadge.setWave(n, this.sim.totalWaves);
    this.currentWave = n;
    this.rerollsThisWave = 0;
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
    this.addReward(WAVE_CLEAR_BONUS);
    this.goldChip.pulse();
    const crystals = perfect ? PERFECT_CLEAR_CRYSTALS : 0;
    if (crystals > 0) this.addCrystals(crystals);
    this.playWaveClearedSequence(n, perfect, crystals);
  }

  /** Grant crystals (Perfect Clear / elite drop) and refresh wallet-gated UI. */
  private addCrystals(n: number): void {
    if (!n) return;
    this.state.crystals += n;
    this.refreshRerollButton();
    this.refreshHandAffordability(); // crystal-priced cards may now be affordable
  }

  /** Spend crystals (Reroll / fusion / Emergency Overdrive) and refresh wallet-gated UI. */
  private spendCrystals(n: number): void {
    this.state.crystals = Math.max(0, this.state.crystals - n);
    this.refreshRerollButton();
    this.refreshHandAffordability(); // a crystal-priced card may now be locked
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
    this.rerollBtn.setLabel(`REROLL ${cost}`);
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
    this.spendCrystals(cost);
    this.rerollsThisWave++;
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
  private beam(x1: number, y1: number, x2: number, y2: number, color: number): void {
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
  }

  /**
   * Award gold (on a kill or a wave clear) and refresh the hand locks. The chip
   * *display* isn't set here — it chases `state.gold` each frame ({@link chaseChips})
   * so the counter visibly ticks up as the coins land (task §3).
   */
  private addReward(gold: number): void {
    if (!gold) return;
    this.state.gold += gold;
    this.refreshHandAffordability();
  }

  /** Spend gold (placing a card) and refresh the hand locks (display chases). */
  private spendGold(gold: number): void {
    this.state.gold = Math.max(0, this.state.gold - gold);
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
    for (const e of this.sim.enemies) {
      let view = this.enemyViews.get(e.id);
      if (!view) {
        // Support mobs telegraph their buff reach with an element-tinted aura ring.
        const aura =
          e.def.archetype === 'support' && e.def.auraRadiusFrac
            ? { color: ELEMENTS[e.def.element].glow, radiusPx: e.def.auraRadiusFrac * this.arenaW }
            : undefined;
        view = new EnemySprite(assets.get(e.def.iconKey), this.enemySize, e.id * 0.7, aura);
        this.enemyViews.set(e.id, view);
        this.enemyHpSeen.set(e.id, e.hp);
        this.enemyLayer.addChild(view);
      }
      const prev = this.enemyHpSeen.get(e.id);
      if (prev !== undefined && e.hp < prev) view.playHit();
      this.enemyHpSeen.set(e.id, e.hp);
      view.position.set(e.x, e.y);
      view.setHpFrac(e.hp / e.maxHp);
      view.setShield(e.shield, e.shieldMax);
      view.tick(dt);
    }
  }

  /** Create/update a bolt per live projectile; drop the view once it is gone.
   *  Impact flashes are driven by the sim's onProjectileHit (real hits only), so
   *  a bolt that fizzles on an already-dead target leaves no phantom burst. */
  private syncProjectiles(): void {
    const radius = this.arenaW * 0.014;
    const live = new Set<number>();
    for (const p of this.sim.projectiles) {
      live.add(p.id);
      let view = this.projViews.get(p.id);
      if (!view) {
        view = new ProjectileView(p.element, radius);
        this.projViews.set(p.id, view);
        this.fxLayer.addChild(view);
      }
      view.setPos(p.x, p.y);
    }
    for (const [id, view] of this.projViews) {
      if (live.has(id)) continue;
      view.destroy();
      this.projViews.delete(id);
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
      slot.setCooldown(this.sim.cooldownFrac(i));
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
      this.syncTowerBadge(slot, i, overload);
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
  private syncTowerBadge(slot: SlotView, index: number, overload: number): void {
    const placed = this.state.slots[index];
    const def = placed ? getCard(placed.cardId) : null;
    // Only attacking towers — their damage/tempo/range the buffs actually scale,
    // and they carry overload + resonance. Support batteries/barriers don't.
    if (!placed || !def || def.category !== 'attacking') {
      slot.setEffect(0, false, false);
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
    slot.setEffect(bonusPct - penaltyPct, hasBonus, hasPenalty);
  }

  /** Announce the pre-wave / intermission countdown; fade out once spawning. */
  private updateWaveToast(dt: number): void {
    let target = 0;
    if (this.sim.status === 'running' && this.sim.wavePhase === 'countdown') {
      const secs = Math.max(0, Math.ceil(this.sim.countdown));
      this.waveToast.text = `WAVE ${this.sim.nextWaveNumber}  •  ${secs}`;
      target = 0.95;
    }
    this.waveToast.alpha += (target - this.waveToast.alpha) * Math.min(1, dt * 8);
  }

  /** Draw the active march route over the arena art (worn trench + warm inlay). */
  private drawRoad(): void {
    const pts = this.path.points;
    const g = this.roadLayer;
    g.clear();
    if (pts.length < 2) return;
    const trace = (): void => {
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
    };
    trace();
    g.stroke({ color: COLORS.black, width: this.arenaW * 0.05, alpha: 0.28, cap: 'round', join: 'round' });
    trace();
    g.stroke({ color: COLORS.brass, width: this.arenaW * 0.03, alpha: 0.5, cap: 'round', join: 'round' });
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

  private onTowerFired(slotIndex: number): void {
    const placed = this.state.slots[slotIndex];
    if (!placed) return;
    const def = getCard(placed.cardId);
    this.services.audio.playSfx(TOWER_SHOOT_SFX[placed.cardId] ?? 'sfx_shoot');
    const p = this.grid.slotScenePos(slotIndex);
    this.burst(p.x, p.y, ELEMENTS[def.element].glow, this.arenaW * 0.026);
  }

  private onEnemyKilled(e: SimEnemy): void {
    this.addReward(e.bounty);
    this.spawnGoldCoins(e.x, e.y, e.bounty); // coins burst, then stream to the gold chip (§3)
    // Elite crystal drop (v3 §8.В): a second crystal source besides Perfect Clear.
    // The chip display chases state.crystals each frame, so it ticks up on its own.
    const crystals = e.def.crystalBounty ?? 0;
    if (crystals > 0) {
      this.addCrystals(crystals);
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
    const color = kind === 'stun' ? COLORS.energyDanger : ELEMENTS.Electricity.glow;
    this.burst(x, y, color, this.arenaW * (kind === 'stun' ? 0.06 : 0.04));
    const label = makeText(kind === 'stun' ? 'STUN!' : 'JAMMED', 'label', {
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

    const title = makeText('WAVE REPELLED', 'display', { fontSize: 64, fill: hex(COLORS.energyOk) });
    title.anchor.set(0.5);
    const sub = makeText(`WAVE ${n} CLEARED`, 'label', { fontSize: 28, fill: hex(COLORS.textBright) });
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
    const reason = makeText('PERFECT CLEAR', 'label', { fontSize: 26, fill: hex(COLORS.crystal) });
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

  private showBanner(kind: 'victory' | 'defeat'): void {
    if (this.banner) return;
    let opts;
    if (kind === 'victory') {
      // Record the clear: unlocks the next level + grants this level's stars (§4).
      // The returned star count is the single source — it also drives the banner's
      // star row, so what's saved and what's shown can never diverge.
      // Capture first-clear *before* recording: only a genuinely new clear should
      // tout "Tech unlocked" (replays already own the tower).
      const firstClear = !progress.isCleared(this.levelId);
      const stars = progress.recordClear(this.levelId, this.sim.coreHp, CORE_MAX);
      const unlockedCards = firstClear
        ? towersUnlockedByClearing(this.levelId).map((id) => {
            const def = getCard(id);
            return { name: def.shortName, element: def.element, icon: this.services.assets.get(def.iconKey) };
          })
        : [];
      opts = {
        title: 'VICTORY',
        subtitle: `Core ${this.sim.coreHp}/${CORE_MAX}`,
        accent: COLORS.energyOk,
        // 1–3★ shown as a star row (icon_star sprite) — see BattleBanner.
        stars,
        starTexture: this.services.assets.get('icon_star'),
        // Cards this clear opens up on the next level → "TECH UNLOCKED" reveal.
        unlockedCards,
        buttons: [
          { label: 'WORLD MAP', primary: true, onClick: () => this.services.navigate('worldmap') },
        ],
      };
    } else {
      opts = {
        title: 'DEFEAT',
        subtitle: 'The core was overrun',
        accent: COLORS.energyDanger,
        buttons: [
          { label: 'RETRY', primary: true, onClick: () => this.services.navigate('battle', { levelId: this.levelId }) },
          { label: 'MAP', onClick: () => this.services.navigate('worldmap') },
        ],
      };
    }
    this.banner = new BattleBanner(opts);
    this.banner.alpha = 0;
    this.addChild(this.banner);
    this.refreshRerollButton(); // grey out Reroll once the battle is over
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

    // Drive the combat simulation, then mirror it into sprites. Overload from
    // too much energy load slows each tower's fire rate in proportion to its own
    // load (Overdrive lifts the capacity that feeds this).
    if (this.sim.status === 'running') {
      this.sim.overload = overloadAmount(this.state.energyLoad, this.effectiveCapacity);
    }
    this.sim.update(dt);
    this.syncEnemies(dt);
    this.syncProjectiles();
    this.syncCooldowns(dt);
    this.updateWaveToast(dt);
    this.updateTelegraph(dt);
    this.modOverlay.tick(dt); // pulse the platform holo while a modernization card is dragged
    this.chaseChips(dt); // gold/crystal counters ease toward their true totals (§3/§4)

    // Keep the inspected tower's overload readout in step with load/capacity.
    if (this.inspectedIndex !== null) this.infoPanel.setOverload(this.towerOverloadPct(this.inspectedIndex));

    // Overdrive countdown: tick each burn stack; resync capacity when one expires.
    if (this.overdriveStacks.length > 0) {
      const before = this.overdriveStacks.length;
      for (let i = this.overdriveStacks.length - 1; i >= 0; i--) {
        this.overdriveStacks[i]! -= dt;
        if (this.overdriveStacks[i]! <= 0) this.overdriveStacks.splice(i, 1);
      }
      if (this.overdriveStacks.length !== before) this.refreshEnergy();
    }

    // Hand recharge: empty positions count down, then spawn a fresh card.
    for (const slot of this.hand) {
      if (slot.card) continue;
      slot.cooldown -= dt;
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
    this.rewardLayer.removeChildren().forEach((c) => c.destroy());
    this.enemyViews.clear();
    this.enemyHpSeen.clear();
    this.projViews.clear();
  }
}
