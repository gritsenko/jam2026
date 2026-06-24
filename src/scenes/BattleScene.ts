import { Container, type FederatedPointerEvent, Graphics, type PointData, Sprite, type Texture } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene, type SceneParams } from '../core/scene';
import { tween, Easings, type TweenHandle } from '../core/tween';
import { createBattleState } from '../config/battleState';
import { HAND_RESPAWN_SEC, HAND_SIZE, OVERDRIVE_SEC, rollHandCard } from '../config/battleRules';
import {
  CORE_MAX,
  ENEMY_PATH,
  GRADE_CAPACITY_SCALE,
  OVERDRIVE_CAPACITY_BONUS,
  PERFECT_CLEAR_CRYSTALS,
  WAVE_CLEAR_BONUS,
} from '../config/combatRules';
import { getCard } from '../config/cards';
import { WAVES } from '../config/waves';
import type { BattleStateMock, CardDef } from '../config/types';
import { ArenaPath } from '../game/path';
import {
  BattleSim,
  buildTowerSpec,
  fireRateFromEnergy,
  isTower,
  towerStats,
  type SimEnemy,
  type TowerSpec,
} from '../game/BattleSim';
import { computeSynergy, type SlotSynergy } from '../game/synergy';
import { BattleBanner } from '../ui/BattleBanner';
import { BattleCard } from '../ui/BattleCard';
import { Button } from '../ui/Button';
import { CoreBadge } from '../ui/CoreBadge';
import { EnemySprite } from '../ui/EnemySprite';
import { EnergyGauge } from '../ui/EnergyGauge';
import { HandSlotView } from '../ui/HandSlotView';
import { HeroAvatar } from '../ui/HeroAvatar';
import { MoveCostReadout, type CostPart } from '../ui/MoveCostReadout';
import { PlatformGrid } from '../ui/PlatformGrid';
import { ProjectileView } from '../ui/Projectile';
import { ReactorZone } from '../ui/ReactorZone';
import { ResourceChip } from '../ui/ResourceChip';
import { SceneBackground } from '../ui/SceneBackground';
import type { SlotView } from '../ui/SlotView';
import { TowerInfoPanel } from '../ui/TowerInfoPanel';
import { WaveBadge } from '../ui/WaveBadge';
import { glowCircle, makeText } from '../ui/helpers';

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

  private marginBg!: SceneBackground; // dimmed backdrop that fills wide-screen margins
  private scrim = new Graphics();
  private field = new Container(); // the locked playfield (arena + platform + enemies)
  private fieldMask = new Graphics(); // clips the zoomed field to the play area
  private fieldFrame = new Graphics(); // viewport vignette + edge drawn over the field
  private enemyLayer = new Container();
  private fxLayer = new Container(); // projectiles + impact/muzzle bursts, above enemies
  private hudLayer = new Container();
  private handLayer = new Container();
  private dragLayer = new Container();

  private arenaW = 1;
  private arenaH = 1;

  private grid!: PlatformGrid;
  private reactor!: ReactorZone;
  private reactorTween?: TweenHandle;
  private gauge!: EnergyGauge;
  private waveBadge!: WaveBadge;
  private coreBadge!: CoreBadge;
  private goldChip!: ResourceChip;
  private crystalChip!: ResourceChip;
  private avatar!: HeroAvatar;
  private avatarR = 72;
  private backBtn!: Button;
  private resonanceLabel = makeText('', 'label', { fontSize: 26, fill: hex(COLORS.energyOverdrive) });
  /** Resolved positional synergy per slot (v2 model), recomputed on every change. */
  private synergy: (SlotSynergy | null)[] = [];
  private hint = makeText('Drag a card onto a slot or the Reactor', 'micro', { fontSize: 20 });
  private waveToast = makeText('', 'title', { fontSize: 40, fill: hex(COLORS.gold) });

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
    if (params?.levelId) console.log(`[Battle] started level ${String(params.levelId)}`);
    const { assets } = this.services;

    // Neutral full-bleed backdrop — a quiet steel/stone wall that fills the
    // whole canvas *around* the arena, so the surrounding margins never compete
    // with the play field (the busy bg_level canyon used to fill the margins too).
    this.marginBg = new SceneBackground(assets.get('bg_arena'));

    // --- Locked playfield: arena image (level map with the road) + platform +
    //     enemies in one transform, contain-fit and centered on the neutral
    //     backdrop above. ---
    const arenaTex = assets.get('bg_level');
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

    this.enemySize = this.arenaW * 0.12;
    this.rangePreview.visible = false;
    this.inspectRange.visible = false;
    this.field.addChild(this.rangePreview, this.inspectRange, this.enemyLayer, this.fxLayer);

    this.buildHud();
    this.buildHand();
    this.refreshEnergy(); // seed load + grade-driven capacity into the gauge

    // --- Combat: the ring path + headless simulation that drives waves, tower
    //     fire and the core's integrity. The scene only mirrors it to sprites. --
    this.path = new ArenaPath(ENEMY_PATH, this.arenaW, this.arenaH);
    this.sim = new BattleSim({
      path: this.path,
      waves: WAVES,
      arenaWidth: this.arenaW,
      coreMax: CORE_MAX,
      callbacks: {
        onEnemyKilled: (e) => this.onEnemyKilled(e),
        onEnemyLeaked: (e) => this.onEnemyLeaked(e),
        onTowerFired: (slotIndex) => this.onTowerFired(slotIndex),
        onProjectileHit: (x, y, element) => this.burst(x, y, ELEMENTS[element].glow, this.arenaW * 0.03),
        onBeam: (x1, y1, x2, y2, element) => this.beam(x1, y1, x2, y2, ELEMENTS[element].glow),
        onBarrier: (x, y) => this.burst(x, y, COLORS.brassLight, this.arenaW * 0.05),
        onWaveStart: (n) => this.waveBadge.setWave(n, this.sim.totalWaves),
        onWaveCleared: (_n, perfect) => this.onWaveCleared(perfect),
        onVictory: () => this.showBanner('victory'),
        onDefeat: () => this.showBanner('defeat'),
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

    this.waveBadge = new WaveBadge(1, WAVES.length);
    this.coreBadge = new CoreBadge(CORE_MAX, CORE_MAX);
    this.goldChip = new ResourceChip(assets.get('icon_gold'), s.gold, COLORS.gold);
    this.crystalChip = new ResourceChip(assets.get('icon_crystal'), s.crystals, COLORS.crystal);
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
      onClick: () => this.services.navigate('worldmap'),
    });

    this.hint.anchor.set(0.5);
    this.hint.alpha = 0.7;

    this.moveCost = new MoveCostReadout();

    this.waveToast.anchor.set(0.5);
    this.waveToast.alpha = 0;

    this.infoPanel = new TowerInfoPanel();

    this.hudLayer.addChild(
      this.waveBadge,
      this.coreBadge,
      this.goldChip,
      this.crystalChip,
      this.avatar,
      this.gauge,
      this.backBtn,
      this.hint,
      this.moveCost,
      this.waveToast,
      this.infoPanel,
    );
  }

  private buildHand(): void {
    // Fixed positions: seed the first ones from the mock hand, the rest start
    // empty and recharging (so the spawn loop is visible from the first frame).
    for (let i = 0; i < HAND_SIZE; i++) {
      const hc = this.state.hand[i];
      let card: BattleCard | null = null;
      if (hc) {
        const def = getCard(hc.cardId);
        card = new BattleCard(def, hc.grade, this.services.assets.get(def.iconKey), {
          energyIcon: this.services.assets.get('icon_energy'),
          goldIcon: this.services.assets.get('icon_gold'),
        });
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
    this.infoPanel.position.set(this.infoPanelPos.x, this.infoPanelPos.y);
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

  private showReactor(): void {
    this.reactorTween?.stop();
    this.reactor.visible = true;
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

    this.showReactor();
    this.grid.showDropTargets(true);
    this.reactor.setHighlight('valid');
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
    const avatar = new BattleCard(def, placed.grade, this.services.assets.get(def.iconKey), {
      energyIcon: this.services.assets.get('icon_energy'),
      goldIcon: this.services.assets.get('icon_gold'),
    });
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

    // Highlight the drop targets. Field-drag lights only matching towers; a hand
    // card lights empty slots (hover/valid) plus any merge target.
    if (fieldDrag) {
      this.grid.showMergeTargets(card.def.id, card.grade, this.fieldDragFrom, mergeSlot);
    } else if (mergeSlot) {
      this.grid.setMergeTarget(mergeSlot);
    } else {
      this.grid.setHover(emptySlot, true);
    }

    // Cost of the pending action, signed, in the sand under the base (§9). No
    // target → fall back to the generic drag hint.
    const parts = this.moveCostParts(card, fieldDrag, overReactor, emptySlot, mergeSlot, previewGrade);
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
    const base = card.def.baseLoad;

    if (overReactor) {
      return [
        { text: 'BURN', color: COLORS.energyOverdrive },
        { icon: energyIcon, text: `+${OVERDRIVE_CAPACITY_BONUS} CAP ${OVERDRIVE_SEC}s`, color: COLORS.energyOverdrive },
      ];
    }
    if (emptySlot) {
      return [this.energyPart(energyIcon, base * card.grade), this.goldPart(goldIcon, card.def.costGold)];
    }
    if (mergeSlot) {
      // Place adds load; a merge replaces two grade-g towers (field) or one (hand)
      // with a single grade-(g+1) — so the net load shift can be 0 or negative.
      const dE = fieldDrag ? base * (1 - card.grade) : base;
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

    // Hand card: burn on the Reactor (grants Overdrive)...
    if (this.reactor.visible && this.reactor.containsGlobal(e.global)) {
      this.hideReactor();
      this.burnCard(card);
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

  /** Burn a card in the Reactor: add a stacking Overdrive window, animate it in. */
  private burnCard(card: BattleCard): void {
    this.overdriveStacks.push(OVERDRIVE_SEC);
    this.refreshEnergy();
    this.flash(this.reactor, COLORS.reactor);
    this.freeHandCard(card);
    this.animateBurn(card);
  }

  /**
   * Recompute network load + capacity from the current platform and push it to
   * the gauge. Load = Σ `baseLoad × grade` over placed cards (so each grade a
   * tower gains draws another base step; generators give back more). Capacity
   * folds in the grade-driven growth (§3.В) and any Overdrive stacks. Call after
   * every placement / merge / burn or Overdrive change.
   */
  private refreshEnergy(): void {
    let load = 0;
    for (const placed of this.state.slots) {
      if (placed) load += getCard(placed.cardId).baseLoad * placed.grade;
    }
    this.state.energyLoad = Math.max(0, load);
    this.state.overdrive = this.overdriveStacks.length > 0;
    this.gauge.setState({
      load: this.state.energyLoad,
      capacity: this.effectiveCapacity,
      overdrive: this.state.overdrive,
    });
  }

  /**
   * Capacity bonus from the platform's average card grade (v2 §3.В): merging
   * towers up automatically widens the energy budget. Capped so base+grade never
   * exceeds `energyMax`.
   */
  private gradeCapacityBonus(): number {
    let sum = 0;
    let n = 0;
    for (const placed of this.state.slots) {
      if (!placed) continue;
      sum += placed.grade;
      n++;
    }
    if (n === 0) return 0;
    return Math.round((sum / n - 1) * GRADE_CAPACITY_SCALE);
  }

  /** Effective network capacity (base + grade growth, capped at max, + Overdrive stacks). */
  private get effectiveCapacity(): number {
    const withGrade = Math.min(this.state.energyMax, this.state.energyCapacity + this.gradeCapacityBonus());
    return withGrade + this.overdriveStacks.length * OVERDRIVE_CAPACITY_BONUS;
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
    const hc = rollHandCard(this.instanceSeq++);
    const def = getCard(hc.cardId);
    const card = new BattleCard(def, hc.grade, this.services.assets.get(def.iconKey), {
      energyIcon: this.services.assets.get('icon_energy'),
      goldIcon: this.services.assets.get('icon_gold'),
    });
    this.wireCard(card);
    slot.card = card;
    slot.cooldown = 0;
    slot.charge.visible = false;
    card.position.copyFrom(slot.home);
    card.setAffordable(this.state.gold >= def.costGold);
    this.handLayer.addChild(card);
    this.animateSpawn(card);
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
        reactions: syn?.reactions ?? [],
      });
      specs.push({ ...spec, slotIndex: i });
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

  /** A wave was cleared: gold bounty + crystals on a Perfect Clear (no leak). */
  private onWaveCleared(perfect: boolean): void {
    this.addReward(WAVE_CLEAR_BONUS);
    if (perfect) this.addCrystals(PERFECT_CLEAR_CRYSTALS);
  }

  /** Grant crystals (Perfect Clear) and refresh the chip. */
  private addCrystals(n: number): void {
    if (!n) return;
    this.state.crystals += n;
    this.crystalChip.setValue(this.state.crystals);
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

  /** Award gold (on a kill or a wave clear) and refresh the chip + hand locks. */
  private addReward(gold: number): void {
    if (!gold) return;
    this.state.gold += gold;
    this.goldChip.setValue(this.state.gold);
    this.refreshHandAffordability();
  }

  /** Spend gold (placing a card) and refresh the chip + hand locks. */
  private spendGold(gold: number): void {
    this.state.gold = Math.max(0, this.state.gold - gold);
    this.goldChip.setValue(this.state.gold);
    this.refreshHandAffordability();
  }

  /** Lock every hand card the player can no longer afford (and unlock the rest). */
  private refreshHandAffordability(): void {
    for (const slot of this.hand) {
      if (slot.card) slot.card.setAffordable(this.state.gold >= slot.card.def.costGold);
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
        view = new EnemySprite(assets.get(e.def.iconKey), this.enemySize, e.id * 0.7);
        this.enemyViews.set(e.id, view);
        this.enemyHpSeen.set(e.id, e.hp);
        this.enemyLayer.addChild(view);
      }
      const prev = this.enemyHpSeen.get(e.id);
      if (prev !== undefined && e.hp < prev) view.playHit();
      this.enemyHpSeen.set(e.id, e.hp);
      view.position.set(e.x, e.y);
      view.setHpFrac(e.hp / e.maxHp);
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

  /** Mirror each tower's firing cooldown into its corner dial + pulse its synergy dots. */
  private syncCooldowns(dt: number): void {
    for (let i = 0; i < this.grid.slots.length; i++) {
      const slot = this.grid.slots[i];
      if (!slot || !slot.isOccupied) continue;
      slot.setCooldown(this.sim.cooldownFrac(i));
      slot.tickDots(dt);
    }
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
    const p = this.grid.slotScenePos(slotIndex);
    this.burst(p.x, p.y, ELEMENTS[def.element].glow, this.arenaW * 0.026);
  }

  private onEnemyKilled(e: SimEnemy): void {
    this.addReward(e.def.bounty);
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

  private showBanner(kind: 'victory' | 'defeat'): void {
    if (this.banner) return;
    const opts =
      kind === 'victory'
        ? {
            title: 'VICTORY',
            subtitle: `All ${this.sim.totalWaves} waves repelled`,
            accent: COLORS.energyOk,
            buttons: [
              { label: 'WORLD MAP', primary: true, onClick: () => this.services.navigate('worldmap') },
            ],
          }
        : {
            title: 'DEFEAT',
            subtitle: 'The core was overrun',
            accent: COLORS.energyDanger,
            buttons: [
              { label: 'RETRY', primary: true, onClick: () => this.services.navigate('battle') },
              { label: 'MAP', onClick: () => this.services.navigate('worldmap') },
            ],
          };
    this.banner = new BattleBanner(opts);
    this.banner.alpha = 0;
    this.addChild(this.banner);
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
    this.waveBadge.position.set(safe.x + pad + 160, topY);
    this.coreBadge.position.set(safe.x + pad + 160, topY + this.waveBadge.badgeH + 8);

    const avatarCX = safe.x + safe.width - pad - this.avatarR;
    const avatarCY = topY + this.avatarR;
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
    // too much energy load slows every tower's fire rate (Overdrive lifts it).
    if (this.sim.status === 'running') {
      this.sim.fireRateMult = fireRateFromEnergy(this.state.energyLoad, this.effectiveCapacity);
    }
    this.sim.update(dt);
    this.syncEnemies(dt);
    this.syncProjectiles();
    this.syncCooldowns(dt);
    this.updateWaveToast(dt);

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

  override onExit(): void {
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
    this.enemyViews.clear();
    this.enemyHpSeen.clear();
    this.projViews.clear();
  }
}
