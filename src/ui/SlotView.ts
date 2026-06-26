import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture, type PointData } from 'pixi.js';
import { COLORS, ELEMENTS, hex, type ElementId } from '../theme';
import { TOWER_SEAT_DEFAULT, type TowerSeat } from '../config/cards';
import type { SynergyDot } from '../game/synergy';
import { fitSprite, makeElementSymbol, makeText } from './helpers';

export type SlotHighlight = 'none' | 'valid' | 'hover' | 'invalid' | 'merge';

/**
 * One platform slot. Empty = a recessed rune socket; filled = tower art in an
 * element-colored ring with grade pips. Origin is the center.
 */
export class SlotView extends Container {
  readonly index: number;
  private size: number;
  private base = new Graphics();
  private hl = new Graphics();
  /** Resonance halo drawn around an actively-resonating tower. */
  private reso = new Graphics();
  private content = new Container();
  /** Influence-dot layout radius (sets the symbol footprint + spacing). */
  private static readonly DOT_R = 12;
  /** Translucent preview of the building that would land here while dragging. */
  private ghost = new Container();
  /**
   * Sprite charge/cooldown bar laid over an attacking tower (just above the
   * influence-dot row): an empty battery frame with the chosen "ready" color frame
   * revealed left→right by the recharge fraction. The color encodes efficiency
   * (blue normal · green bonus · yellow mixed · red penalty), so it carries the
   * net-effect reading throughout the battle while the % badge stays selection-only.
   */
  private cdBar = new Container();
  private cdBg = new Sprite();
  private cdFill = new Sprite();
  private cdMask = new Graphics();
  /** 5 frames sliced from `cooldown.png`: [0] empty, [1] blue, [2] green, [3] yellow, [4] red. */
  private chargeFrames?: Texture[];
  /** Bar footprint (derived from the slot size); also the reveal-mask extent. */
  private barW = 0;
  private barH = 0;
  /**
   * Net-effect badge (top-left): the tower's total modifier — neighbor buffs and
   * penalties plus overload — folded into one signed % (v3 §9).
   */
  private effect = new Container();
  private effectBg = new Graphics();
  private effectLabel = makeText('', 'label', { fontSize: 22, fill: hex(COLORS.energyOk), fontWeight: '900' });
  /** Badge state: 0 hidden · 1 green (bonus only) · 2 red (penalty only) · 3 yellow (both). */
  private effectState = 0;
  /** Last drawn net percent, so we only redraw the badge when something changes. */
  private effectPct = 0;
  /** Whether the badge pulses for attention (only when a penalty is present). */
  private effectPulses = false;
  private effectPulse = 0;
  /** Whether this tower is the inspected one — gates the net-effect badge. */
  private selected = false;
  private occupied = false;
  /**
   * Legacy element-symbol textures (sym_<element>) — the fallback for influence
   * dots whose element has no column in the pre-baked sheet (see {@link setSymbolFrames}).
   */
  private symbols?: Partial<Record<ElementId, Texture>>;
  /** Pre-baked influence-dot symbols from the 4×2 sheet: unlit (off) / lit (on). */
  private symFramesOff?: Partial<Record<ElementId, Texture>>;
  private symFramesOn?: Partial<Record<ElementId, Texture>>;
  /** Dark backing plate (`upgrade_back`) drawn behind the influence/resonance dot row. */
  private dotPlateTex?: Texture;
  /**
   * The placed tower's rotating sprite — the head on a composed sheet (over a
   * static {@link sliceCenter3x3} base), the whole turret on an old-layout sheet,
   * or the single static art otherwise. Hard-swapped to the current facing frame.
   */
  private towerSprite?: Sprite;
  /** 8 directional aim frames (d0=N, d1=NE … d7=NW clockwise) from an `<id>_dirs` 3×3 sheet. */
  private dirFrames?: Texture[];
  /** Seat geometry of the placed tower (base→slot width + lift); see {@link seatSprite}. */
  private seat: TowerSeat = TOWER_SEAT_DEFAULT;
  /**
   * Fraction of the slot width the tower BASE fills (1 = exactly the socket width).
   * The barrel then protrudes above the socket. Tune here to taste.
   */
  private static readonly SEAT_FILL = 1.0;
  /** Default facing on build and before the first target: South-East. */
  private static readonly DEFAULT_OCTANT = 3;
  /**
   * Seconds per 45° step — the turret turns ONE octant at a time, leisurely, by
   * hard-swapping the facing frame (no crossfade: blending two 45°-apart frames
   * dips the head to semi-transparent mid-fade, which reads as a flicker).
   */
  private static readonly ROT_STEP_SEC = 0.11;
  /**
   * Debounce: a freshly-aimed octant must persist this long before the turret
   * commits to turning there, so a rapidly-flipping lead enemy doesn't jerk the
   * head back and forth (firing is independent of facing — see BattleSim).
   */
  private static readonly AIM_DEBOUNCE_SEC = 0.22;
  /** Octant currently SHOWN (0–7). The turret steps toward {@link targetOctant}. */
  private displayOctant = SlotView.DEFAULT_OCTANT;
  /** Octant the turret has COMMITTED to face (only updated after the debounce). */
  private targetOctant = SlotView.DEFAULT_OCTANT;
  /** Latest raw octant from {@link setAim} (pre-debounce; retained when no target). */
  private desiredOctant = SlotView.DEFAULT_OCTANT;
  /** Candidate octant being debounced toward {@link targetOctant}. */
  private pendingOctant = SlotView.DEFAULT_OCTANT;
  /** How long {@link pendingOctant} has held steady (toward {@link AIM_DEBOUNCE_SEC}). */
  private pendingTimer = 0;
  /** Time banked toward the next one-octant rotation step. */
  private aimTimer = 0;

  constructor(index: number, size: number) {
    super();
    this.index = index;
    this.size = size;
    this.effectLabel.anchor.set(0, 0.5);
    this.effect.addChild(this.effectBg, this.effectLabel);
    this.effect.visible = false;
    this.cdBg.anchor.set(0.5);
    this.cdFill.anchor.set(0.5);
    this.cdFill.mask = this.cdMask;
    this.cdBar.addChild(this.cdBg, this.cdFill, this.cdMask);
    this.cdBar.visible = false;
    this.addChild(this.base, this.reso, this.content, this.hl, this.ghost, this.cdBar, this.effect);
    this.ghost.visible = false;
    // Fixed cell-sized hit area: pointer events (lifting a tower) and drop
    // detection no longer depend on drawn geometry — empty slots paint nothing
    // now that the platform board art provides the socket.
    this.hitArea = new Rectangle(-size / 2, -size / 2, size, size);
    this.drawEmpty();
  }

  /** Is a global point within this slot's cell box? Used for drag-drop targeting. */
  hitTestGlobal(p: PointData): boolean {
    const lp = this.toLocal(p);
    const h = this.size / 2;
    return lp.x >= -h && lp.x <= h && lp.y >= -h && lp.y <= h;
  }

  get cellSize(): number {
    return this.size;
  }

  setEmpty(): void {
    this.occupied = false;
    this.content.removeChildren().forEach((c) => c.destroy());
    this.reso.clear();
    this.towerSprite = undefined;
    this.dirFrames = undefined;
    this.displayOctant = SlotView.DEFAULT_OCTANT;
    this.targetOctant = SlotView.DEFAULT_OCTANT;
    this.desiredOctant = SlotView.DEFAULT_OCTANT;
    this.pendingOctant = SlotView.DEFAULT_OCTANT;
    this.pendingTimer = 0;
    this.aimTimer = 0;
    this.hideCharge();
    this.setSelected(false);
    this.setEffect(0, false, false);
    this.drawEmpty();
  }

  /**
   * Render a placed tower: art in an element ring, the v2 influence-dot row at
   * the bottom (one dot per open synergy slot, colored by its wanted element and
   * lit when that synergy is present), and a resonance halo when two different
   * elements are active on it (§9).
   */
  setPlaced(
    art: Texture,
    element: ElementId,
    _grade: number,
    dots: readonly SynergyDot[] = [],
    resonant = false,
    dirStrip?: Texture,
    composedBase = false,
    seat: TowerSeat = TOWER_SEAT_DEFAULT,
  ): void {
    this.occupied = true;
    this.content.removeChildren().forEach((c) => c.destroy());
    this.hideCharge();
    const skin = ELEMENTS[element];
    this.seat = seat;

    // The painted socket (board art) backs the slot and the sprite reads its own
    // element/type, so a placed *unselected* tower draws NO frame. The only ring
    // is the tap-to-inspect selection ring (drawn by PlatformGrid.inspect).
    this.base.clear();

    this.displayOctant = SlotView.DEFAULT_OCTANT;
    this.targetOctant = SlotView.DEFAULT_OCTANT;
    this.desiredOctant = SlotView.DEFAULT_OCTANT;
    this.pendingOctant = SlotView.DEFAULT_OCTANT;
    this.pendingTimer = 0;
    this.aimTimer = 0;

    // Turret aim sheet: a 3×3 directional sprite-sheet (`<id>_dirs`); the 8
    // perimeter cells are the compass aims. A rotating turret builds facing
    // South-East ({@link DEFAULT_OCTANT}) and turns one octant at a time toward
    // its target (see setAim/tickAim). Towers without a sheet (supports, statics)
    // just show `art`. Every sprite is SEATED so its base fills the slot width.
    let mainSprite: Sprite;
    if (dirStrip) {
      this.dirFrames = this.sliceSheet3x3(dirStrip);

      if (composedBase) {
        // Composed layout: the CENTER cell is a STATIONARY base, drawn once
        // underneath; the 8 perimeter cells are the rotating head only. The base
        // never moves — only the head sprite hard-swaps to the aimed octant.
        // Seat base + head identically so the head stays mounted on the base.
        const base = new Sprite(this.sliceCenter3x3(dirStrip));
        this.seatSprite(base, seat);
        this.content.addChild(base);
      }
      // Composed → head; old layout → the whole turret (base baked into each cell).
      mainSprite = new Sprite(this.dirFrames[this.displayOctant]!);
    } else {
      this.dirFrames = undefined;
      mainSprite = new Sprite(art);
    }
    this.seatSprite(mainSprite, seat);
    this.content.addChild(mainSprite);
    this.towerSprite = mainSprite;

    this.drawDots(dots);
    this.drawResonance(resonant, skin.glow);
  }

  /**
   * Seat a tower sprite/cell in its slot: scale so the base (turntable) spans the
   * slot width ({@link SEAT_FILL}) and lift it so the base center sits at the slot
   * center — the barrel then protrudes above the socket. Because `seat.wFrac` is
   * fixed per tower (not per aim frame), a rotating turret keeps a constant size
   * as it turns; composed sheets seat base + head with the same seat so the head
   * stays mounted. Anchored at center, so a texture swap (tickAim) preserves it.
   */
  private seatSprite(sprite: Sprite, seat: TowerSeat): void {
    const tex = sprite.texture;
    const tw = tex.width || 1;
    const th = tex.height || 1;
    const scale = (this.size * SlotView.SEAT_FILL) / (tw * seat.wFrac);
    sprite.anchor.set(0.5);
    sprite.scale.set(scale);
    sprite.position.set(0, th * (0.5 - seat.cyFrac) * scale);
  }

  /**
   * Slice a 3×3 directional sheet into the 8 compass aim frames (d0 = N, then
   * clockwise to d7 = NW). Each cell points outward from center by its grid
   * position (top row NW/N/NE, etc.). The center cell is the stationary base on
   * a composed sheet ({@link sliceCenter3x3}); on an old-layout sheet it is the
   * idle facing and goes unused. Equal-size cells → no scale jump when swapping.
   * Future per-state/per-grade variants = separate sheets.
   */
  private sliceSheet3x3(sheet: Texture): Texture[] {
    const cw = sheet.width / 3;
    const ch = sheet.height / 3;
    const cell = (col: number, row: number): Texture =>
      new Texture({ source: sheet.source, frame: new Rectangle(col * cw, row * ch, cw, ch) });
    return [
      cell(1, 0), // d0 N  (top-center)
      cell(2, 0), // d1 NE (top-right)
      cell(2, 1), // d2 E  (mid-right)
      cell(2, 2), // d3 SE (bottom-right)
      cell(1, 2), // d4 S  (bottom-center)
      cell(0, 2), // d5 SW (bottom-left)
      cell(0, 1), // d6 W  (mid-left)
      cell(0, 0), // d7 NW (top-left)
    ];
  }

  /** The center cell of a 3×3 sheet — the stationary base of a composed aim sheet. */
  private sliceCenter3x3(sheet: Texture): Texture {
    const cw = sheet.width / 3;
    const ch = sheet.height / 3;
    return new Texture({ source: sheet.source, frame: new Rectangle(cw, ch, cw, ch) });
  }

  /**
   * Record the turret's DESIRED facing from a scene-space aim angle (radians,
   * screen convention: 0 = east, +PI/2 = south) — snapped to the nearest of 8
   * octants (0 = north, clockwise). This is the *raw* aim; {@link tickAim}
   * debounces it before the turret commits to turning (so a flickering lead
   * enemy doesn't jerk the head). `null` keeps the last desired facing (turret
   * holds its aim when no enemy is in range). No-op without a directional sheet.
   */
  setAim(angle: number | null): void {
    if (!this.dirFrames || angle === null) return;
    this.desiredOctant = ((Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  }

  /**
   * Debounce the raw aim, then advance the shown facing one octant at a time
   * toward the committed {@link targetOctant} — one hard frame-swap per {@link
   * ROT_STEP_SEC}, the shorter way around the ring so it passes through every
   * intermediate octant rather than snapping. Call each frame.
   */
  tickAim(dt: number): void {
    const frames = this.dirFrames;
    const sprite = this.towerSprite;
    if (!frames || !sprite) return;

    // Debounce: only commit a new facing once the desired octant has held steady
    // for AIM_DEBOUNCE_SEC. A target that keeps flipping resets the timer, so the
    // turret stays put instead of jittering (it still fires regardless of facing).
    if (this.desiredOctant !== this.targetOctant) {
      if (this.desiredOctant === this.pendingOctant) {
        this.pendingTimer += dt;
        if (this.pendingTimer >= SlotView.AIM_DEBOUNCE_SEC) this.targetOctant = this.pendingOctant;
      } else {
        this.pendingOctant = this.desiredOctant;
        this.pendingTimer = 0;
      }
    }

    if (this.displayOctant === this.targetOctant) return;
    this.aimTimer += dt;
    let changed = false;
    while (this.aimTimer >= SlotView.ROT_STEP_SEC && this.displayOctant !== this.targetOctant) {
      this.aimTimer -= SlotView.ROT_STEP_SEC;
      const diff = (this.targetOctant - this.displayOctant + 8) % 8;
      this.displayOctant = (this.displayOctant + (diff <= 4 ? 1 : -1) + 8) % 8;
      changed = true;
    }
    if (changed) {
      sprite.texture = frames[this.displayOctant]!;
      this.seatSprite(sprite, this.seat); // equal-size cells → keeps scale/lift
    }
  }

  /**
   * Influence-dot row along the bottom edge (v2 §9): one symbol per open synergy
   * slot, the wanted-neighbor element read by SHAPE. Each symbol is a pre-baked
   * sprite from the 4×2 element-symbol sheet ({@link setSymbolFrames}) — the OFF
   * frame when that synergy is absent, the ON (lit) frame when it is present. No
   * 256px icon is down-scaled per frame and there is no pulsing glow; that
   * procedural noise was the point of the rework. An element with no sheet column
   * (currently Physical) falls back to {@link drawFallbackDot}.
   */
  private drawDots(dots: readonly SynergyDot[]): void {
    if (dots.length === 0) return;
    const s = this.size;
    const r = SlotView.DOT_R;
    const dia = (r * 5.2) / 1.5; // 2× base footprint, then reduced 1.5× (≈1.33× the original r*2.6)
    const gap = (r * 5.4) / 2.5; // spacing scaled with the footprint
    const startX = -((dots.length - 1) * gap) / 2;
    const y = s / 2 - dia / 2 + 10; // anchored just inside the bottom edge
    // Dark backing plate behind the whole dot row (added first → sits underneath).
    if (this.dotPlateTex) {
      const plate = new Sprite(this.dotPlateTex);
      plate.anchor.set(0.5);
      plate.width = (3 - 1) * gap + dia;
      plate.height = dia * 0.9;
      plate.position.set(0, y);
      this.content.addChild(plate);
    }
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      const x = startX + i * gap;
      const frame = (d.lit ? this.symFramesOn : this.symFramesOff)?.[d.element];
      if (frame) {
        const sym = new Sprite(frame);
        fitSprite(sym, dia, dia);
        sym.position.set(x, y);
        this.content.addChild(sym);
      } else {
        this.drawFallbackDot(x, y, d);
      }
    }
  }

  /**
   * Legacy procedural influence dot — an element-colored LED socket with the
   * down-scaled sym_ icon — drawn only for elements absent from the pre-baked
   * sheet (currently Physical), so every element still reads correctly.
   */
  private drawFallbackDot(x: number, y: number, d: SynergyDot): void {
    const r = SlotView.DOT_R;
    const skin = ELEMENTS[d.element];
    const color = skin.glow;
    const g = new Graphics();
    g.circle(x, y, r + 4).fill({ color: skin.dark, alpha: 0.95 });
    g.circle(x, y, r + 4).stroke({ width: 2, color, alpha: 0.45 });
    if (d.lit) {
      g.circle(x, y, r).fill({ color });
    } else {
      g.circle(x, y, r).fill({ color: COLORS.black, alpha: 0.4 });
      g.circle(x, y, r).stroke({ width: 1.5, color, alpha: 0.5 });
    }
    this.content.addChild(g);
    const tex = this.symbols?.[d.element];
    if (tex) {
      const sym = makeElementSymbol(tex, r * 1.7, d.lit ? skin.dark : skin.glow);
      sym.position.set(x, y);
      this.content.addChild(sym);
    }
  }

  /** Provide the legacy element-symbol textures (sym_<element>) for the dot fallback. */
  setSymbolTextures(symbols: Partial<Record<ElementId, Texture>>): void {
    this.symbols = symbols;
  }

  /** Provide the pre-baked influence-dot symbols (unlit/lit) sliced from the sheet. */
  setSymbolFrames(
    off: Partial<Record<ElementId, Texture>>,
    on: Partial<Record<ElementId, Texture>>,
  ): void {
    this.symFramesOff = off;
    this.symFramesOn = on;
  }

  /** Provide the backing-plate texture (`upgrade_back`) drawn behind the dot row. */
  setDotPlate(tex: Texture): void {
    this.dotPlateTex = tex;
  }

  /** Pulse the net-effect badge (the influence dots are now static). Call each frame. */
  tickDots(dt: number): void {
    if (!this.effect.visible) return;
    if (this.effectPulses) {
      this.effectPulse = (this.effectPulse + dt * 4) % (Math.PI * 2);
      this.effect.alpha = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.effectPulse));
    } else {
      this.effect.alpha = 1;
    }
  }

  /** A soft pulsing-color halo marking an active resonance. */
  private drawResonance(resonant: boolean, color: number): void {
    this.reso.clear();
    if (!resonant) return;
    const s = this.size;
    for (let i = 0; i < 3; i++) {
      const grow = 4 + i * 5;
      this.reso
        .roundRect(-s / 2 - grow, -s / 2 - grow, s + grow * 2, s + grow * 2, 18 + grow)
        .stroke({ width: 4 - i, color, alpha: 0.4 - i * 0.12 });
    }
  }

  /**
   * Show a translucent preview of the tower that a dragged card would build
   * here — an element ring plus its desaturated art, so the drop reads before
   * the card is even released. Cleared with {@link clearGhost}.
   */
  showGhost(art: Texture, element: ElementId): void {
    this.clearGhost();
    const s = this.size;
    const skin = ELEMENTS[element];

    const ring = new Graphics();
    ring.roundRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 14).fill({ color: skin.dark, alpha: 0.35 });
    ring.roundRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8, 14).stroke({ width: 3, color: skin.glow, alpha: 0.85 });
    this.ghost.addChild(ring);

    const sprite = new Sprite(art);
    fitSprite(sprite, s * 0.8, s * 0.8);
    const desat = new ColorMatrixFilter();
    desat.desaturate();
    sprite.filters = [desat];
    this.ghost.addChild(sprite);

    this.ghost.alpha = 0.62;
    this.ghost.visible = true;
  }

  clearGhost(): void {
    this.ghost.removeChildren().forEach((c) => c.destroy());
    this.ghost.visible = false;
  }

  /**
   * Provide the charge-bar frames (sliced from `cooldown.png`) and lay the bar out
   * over the tower, just above the influence-dot row. Called once per slot at build
   * (frames are shared across slots). No-op if the sheet is missing/too short.
   */
  setChargeFrames(frames: Texture[]): void {
    if (frames.length < 5) return;
    this.chargeFrames = frames;
    const base = frames[0]!;
    const fw = base.width || 1;
    const fh = base.height || 1;
    this.barW = (this.size * 0.5) / 1.5;
    this.barH = (fh / fw) * this.barW;
    const scale = this.barW / fw;
    this.cdBg.texture = base;
    this.cdFill.texture = frames[1]!;
    this.cdBg.scale.set(scale);
    this.cdFill.scale.set(scale);
    // Sit just above the influence-dot row (mirror drawDots' bottom anchoring).
    const dia = (SlotView.DOT_R * 5.2) / 1.5;
    const dotTopY = this.size / 2 - dia - 4;
    this.cdBar.position.set(0, dotTopY - 6 - this.barH / 2);
  }

  /**
   * Drive the over-tower charge bar (attacking towers only): `frac` is the firing
   * cooldown (1 just after firing → 0 ready), shown as a battery filling left→right
   * (fill = 1 − frac) over the empty frame. The reveal color encodes the tower's
   * current efficiency (`state`: 0 normal → blue · 1 bonus → green · 2 penalty → red
   * · 3 both → yellow), matching the net-effect badge so efficiency reads off the bar
   * without it. `state < 0` (a non-attacking tower) hides the bar.
   */
  setCharge(frac: number, state: number): void {
    if (!this.chargeFrames || state < 0) {
      this.hideCharge();
      return;
    }
    this.cdBar.visible = true;
    // Efficiency → color frame: blue(1) normal, green(2) bonus, yellow(3) both, red(4) penalty.
    const colorIdx = state === 3 ? 3 : state === 2 ? 4 : state === 1 ? 2 : 1;
    const tex = this.chargeFrames[colorIdx];
    if (tex && this.cdFill.texture !== tex) this.cdFill.texture = tex;
    const fill = 1 - Math.max(0, Math.min(1, frac));
    this.cdFill.visible = fill > 0.001;
    this.cdMask.clear();
    if (this.cdFill.visible) {
      this.cdMask.rect(-this.barW / 2, -this.barH / 2, this.barW * fill, this.barH).fill(0xffffff);
    }
  }

  /** Hide the charge bar (non-attacking tower / empty slot). */
  private hideCharge(): void {
    this.cdBar.visible = false;
  }

  /**
   * Drive the net-effect badge in the tower's top-left corner. `netPct` is the
   * tower's total modifier — all neighbor buffs and penalties plus overload, signed
   * (v3 §9). The color encodes *composition*, not just sign: green = only bonuses,
   * red = only penalties, yellow = both (a drop you can remove). The badge is only
   * shown while this tower is inspected ({@link setSelected}); in the running battle
   * the same efficiency reads off the charge-bar color instead. Only redraws when the
   * state or percent changes; the pulse is driven in {@link tickDots}.
   */
  setEffect(netPct: number, hasBonus: boolean, hasPenalty: boolean): void {
    const state = !hasBonus && !hasPenalty ? 0 : hasBonus && hasPenalty ? 3 : hasPenalty ? 2 : 1;
    if (state === this.effectState && netPct === this.effectPct) return;
    this.effectState = state;
    this.effectPct = netPct;
    this.effectPulses = state >= 2; // red/yellow pulse for attention; green stays calm
    if (state !== 0) this.drawEffect(netPct, state); // keep content current for when selected
    this.applyEffectVisibility();
  }

  /**
   * The net-effect badge shows only while this tower is inspected, and only when
   * there is actually a modifier to report. Driven by both {@link setEffect}
   * (content/state changes) and {@link setSelected} (selection toggles).
   */
  private applyEffectVisibility(): void {
    const show = this.selected && this.effectState !== 0;
    this.effect.visible = show;
    if (!show) this.effect.alpha = 1;
  }

  /** Mark this tower as the inspected one — toggles the net-effect badge. */
  setSelected(selected: boolean): void {
    if (this.selected === selected) return;
    this.selected = selected;
    this.applyEffectVisibility();
  }

  /** Lay out the effect badge (dark pill + state-colored rim, net-direction arrow, signed %). */
  private drawEffect(netPct: number, state: number): void {
    const color = state === 3 ? COLORS.energyWarn : state === 2 ? COLORS.energyDanger : COLORS.energyOk;
    const s = this.size;
    const h = s * 0.22;
    const padX = h * 0.3;
    const arrowW = h * 0.42;
    const gapX = h * 0.16;

    this.effectLabel.text = `${netPct > 0 ? '+' : ''}${netPct}%`;
    this.effectLabel.style.fill = hex(color);
    const w = padX + arrowW + gapX + this.effectLabel.width + padX;
    const x0 = -s / 2 + 6;
    const y0 = -s / 2 + 6;
    const cy = y0 + h / 2;

    this.effectBg.clear();
    this.effectBg.roundRect(x0, y0, w, h, h / 2).fill({ color: COLORS.black, alpha: 0.72 });
    this.effectBg.roundRect(x0, y0, w, h, h / 2).stroke({ width: 2, color, alpha: 0.95 });

    // Arrow shows net direction: up = net buff, down = net nerf, dash = exactly even.
    const ax = x0 + padX + arrowW / 2;
    const a = arrowW / 2;
    if (netPct > 0) {
      this.effectBg
        .moveTo(ax - a, cy + a * 0.45)
        .lineTo(ax, cy - a * 0.6)
        .lineTo(ax + a, cy + a * 0.45)
        .stroke({ width: 3, color, cap: 'round', join: 'round' });
    } else if (netPct < 0) {
      this.effectBg
        .moveTo(ax - a, cy - a * 0.45)
        .lineTo(ax, cy + a * 0.6)
        .lineTo(ax + a, cy - a * 0.45)
        .stroke({ width: 3, color, cap: 'round', join: 'round' });
    } else {
      this.effectBg.moveTo(ax - a, cy).lineTo(ax + a, cy).stroke({ width: 3, color, cap: 'round' });
    }

    this.effectLabel.position.set(x0 + padX + arrowW + gapX, cy);
  }

  setHighlight(state: SlotHighlight): void {
    const s = this.size;
    this.hl.clear();
    if (state === 'none') return;
    const color =
      state === 'merge'
        ? COLORS.energyOverdrive
        : state === 'hover'
          ? COLORS.dropHover
          : state === 'invalid'
            ? COLORS.energyDanger
            : COLORS.dropValid;
    const alpha = state === 'hover' || state === 'merge' ? 0.5 : 0.28;
    this.hl.roundRect(-s / 2, -s / 2, s, s, 16).fill({ color, alpha });
    this.hl.roundRect(-s / 2, -s / 2, s, s, 16).stroke({ width: 4, color });
  }

  get isOccupied(): boolean {
    return this.occupied;
  }

  private drawEmpty(): void {
    // The platform board art now paints the empty socket — the slot itself draws
    // nothing (its fixed hitArea, set in the constructor, still catches drops).
    this.base.clear();
    this.hl.clear();
  }
}
