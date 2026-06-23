import { Container, type FederatedPointerEvent, Graphics, type PointData, Sprite } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene, type SceneParams } from '../core/scene';
import { tween, Easings, type TweenHandle } from '../core/tween';
import { createBattleState } from '../config/battleState';
import { getCard } from '../config/cards';
import { ENEMIES } from '../config/enemies';
import type { BattleStateMock } from '../config/types';
import { BattleCard } from '../ui/BattleCard';
import { Button } from '../ui/Button';
import { EnemySprite } from '../ui/EnemySprite';
import { EnergyGauge } from '../ui/EnergyGauge';
import { HeroAvatar } from '../ui/HeroAvatar';
import { PlatformGrid } from '../ui/PlatformGrid';
import { ReactorZone } from '../ui/ReactorZone';
import { ResourceChip } from '../ui/ResourceChip';
import { SceneBackground } from '../ui/SceneBackground';
import type { SlotView } from '../ui/SlotView';
import { WaveBadge } from '../ui/WaveBadge';
import { makeText } from '../ui/helpers';

interface HandEntry {
  card: BattleCard;
  home: PointData;
  /** In-flight return-to-hand animation, if any (so a re-grab can cancel it). */
  returnTween?: TweenHandle;
}

/** Enemy positions on the square arena's road ring, as fractions of the image. */
const ENEMY_SPOTS = [
  { fx: 0.18, fy: 0.18 },
  { fx: 0.82, fy: 0.18 },
  { fx: 0.18, fy: 0.82 },
  { fx: 0.82, fy: 0.82 },
];

/**
 * Arena-image width fraction between the opposite *outer road edges*. The
 * playfield zooms in until this span fills the screen width, cropping the
 * rocky frame in the image so the road ring sits right at the screen edges.
 */
const ROAD_SPAN = 0.76;
/** Platform plate width as a fraction of the arena image width. */
const PLATFORM_FRAC = 0.5;

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
  private goldChip!: ResourceChip;
  private crystalChip!: ResourceChip;
  private avatar!: HeroAvatar;
  private avatarR = 72;
  private backBtn!: Button;
  private resonanceLabel = makeText('PAR RESONANCE', 'label', { fontSize: 26, fill: hex(COLORS.energyOk) });
  private hint = makeText('Drag a card onto a slot or the Reactor', 'micro', { fontSize: 20 });

  private hand: HandEntry[] = [];
  private enemies: EnemySprite[] = [];

  // Drag state.
  private dragging: BattleCard | null = null;
  private dragOffset: PointData = { x: 0, y: 0 };
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
    this.field.addChild(arena);

    this.grid = new PlatformGrid(assets, 720);
    this.grid.applyState(this.state);
    this.grid.position.set(this.arenaW * 0.5, this.arenaH * 0.5);
    this.grid.setScaleSize(this.arenaW * PLATFORM_FRAC);
    this.field.addChild(this.grid);
    this.wireSlotTaps();

    this.resonanceLabel.anchor.set(0.5);
    this.resonanceLabel.position.set(
      this.arenaW * 0.5,
      this.arenaH * 0.5 - this.arenaW * PLATFORM_FRAC * 0.5 - 30,
    );
    this.field.addChild(this.resonanceLabel);

    const enemySize = this.arenaW * 0.13;
    ENEMIES.forEach((def, i) => {
      const e = new EnemySprite(assets.get(def.iconKey), enemySize, i * 1.3);
      const spot = ENEMY_SPOTS[i % ENEMY_SPOTS.length]!;
      e.position.set(spot.fx * this.arenaW, spot.fy * this.arenaH);
      this.enemies.push(e);
      this.enemyLayer.addChild(e);
    });
    this.field.addChild(this.enemyLayer);

    this.buildHud();
    this.buildHand();

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

    this.waveBadge = new WaveBadge(s.wave, s.maxWave);
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
      onClick: () => this.services.navigate('worldmap'),
    });

    this.hint.anchor.set(0.5);
    this.hint.alpha = 0.7;

    this.hudLayer.addChild(
      this.waveBadge,
      this.goldChip,
      this.crystalChip,
      this.avatar,
      this.gauge,
      this.backBtn,
      this.hint,
    );
  }

  private buildHand(): void {
    for (const hc of this.state.hand) {
      const def = getCard(hc.cardId);
      const card = new BattleCard(def, hc.grade, this.services.assets.get(def.iconKey));
      card.eventMode = 'static';
      card.cursor = 'grab';
      card.on('pointerdown', (e: FederatedPointerEvent) => this.startDrag(card, e));
      card.on('globalpointermove', (e: FederatedPointerEvent) => this.onDragMove(e));
      card.on('pointerup', (e: FederatedPointerEvent) => this.endDrag(e));
      card.on('pointerupoutside', (e: FederatedPointerEvent) => this.endDrag(e));
      this.hand.push({ card, home: { x: 0, y: 0 } });
      this.handLayer.addChild(card);
    }
  }

  private wireSlotTaps(): void {
    for (const slot of this.grid.slots) {
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.on('pointertap', () => {
        if (this.dragging) return;
        console.log(`[Battle] tapped slot ${slot.index} (${slot.isOccupied ? 'occupied' : 'empty'})`);
      });
    }
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
    if (this.dragging) return;
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
    this.grid.showDropTargets();
    this.reactor.setHighlight('valid');
    this.hint.alpha = 0.95;
  }

  private onDragMove(e: FederatedPointerEvent): void {
    const card = this.dragging;
    if (!card) return;
    const p = this.dragLayer.toLocal(e.global);
    card.position.set(p.x + this.dragOffset.x, p.y + this.dragOffset.y);

    const overReactor = this.reactor.visible && this.reactor.containsGlobal(e.global);
    const slot = overReactor ? null : this.grid.slotAtGlobal(e.global);
    const targetSlot = slot && !slot.isOccupied ? slot : null;

    // Reactor hover charges the gauge (previewing the burn payoff); otherwise
    // the reactor sits as a plain valid target.
    this.reactor.setHighlight(overReactor ? 'hover' : 'valid');
    this.gauge.setCharging(overReactor);

    // Over a free slot: drop a translucent build preview into it and fade the
    // dragged card out so the preview reads cleanly.
    if (targetSlot !== this.previewSlot) {
      this.previewSlot?.clearGhost();
      this.previewSlot = targetSlot;
      targetSlot?.showGhost(this.services.assets.get(card.def.iconKey), card.def.element);
    }
    this.grid.setHover(targetSlot);
    this.setCardGhosted(targetSlot !== null);
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
    this.dragging = null;
    card.cursor = 'grab';

    if (this.reactor.visible && this.reactor.containsGlobal(e.global)) {
      console.log(`[Battle] BURN ${card.def.shortName} in the Reactor (mock — +overdrive)`);
      this.flash(this.reactor, COLORS.reactor);
    } else {
      const slot = this.grid.slotAtGlobal(e.global);
      if (slot && !slot.isOccupied) {
        console.log(`[Battle] PLACE ${card.def.shortName} into slot ${slot.index} (mock)`);
        this.flash(slot, COLORS.dropValid);
      } else {
        console.log(`[Battle] ${card.def.shortName} dropped on no target — returning to hand`);
      }
    }

    this.cardFadeTween?.stop();
    this.previewSlot?.clearGhost();
    this.previewSlot = null;
    this.cardGhosted = false;
    this.gauge.setCharging(false);
    this.grid.clearHighlights();
    this.hideReactor();
    this.hint.alpha = 0.7;
    this.returnCardHome(card);
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

    const avatarCX = safe.x + safe.width - pad - this.avatarR;
    const avatarCY = topY + this.avatarR;
    this.avatar.position.set(avatarCX, avatarCY);

    const chipY = avatarCY - this.goldChip.chipH / 2;
    const rowRight = avatarCX - this.avatarR - 16;
    this.crystalChip.position.set(rowRight - this.crystalChip.chipW, chipY);
    this.goldChip.position.set(rowRight - this.crystalChip.chipW - 12 - this.goldChip.chipW, chipY);

    // --- Bottom: hand, then gauge above it ----------------------------------
    const cardH = this.hand[0]?.card.cardH ?? 300;
    const cardW = this.hand[0]?.card.cardW ?? 212;
    const bottomPad = 22;
    const handCY = safe.y + safe.height - bottomPad - cardH / 2;
    const handGap = 22;
    const totalW = this.hand.length * cardW + (this.hand.length - 1) * handGap;
    let hx = cx - totalW / 2 + cardW / 2;
    for (const entry of this.hand) {
      entry.home = { x: hx, y: handCY };
      if (entry.card !== this.dragging && entry.card.parent === this.handLayer) {
        entry.card.position.set(hx, handCY);
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
    const fieldTop = Math.max(topY + this.waveBadge.badgeH, avatarCY + this.avatarR) + 14;
    const fieldBottom = gaugeY - 14;
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
  }

  override update(dt: number): void {
    this.gauge.tick(dt);
    for (const e of this.enemies) e.tick(dt);
  }

  override onExit(): void {
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
  }
}
