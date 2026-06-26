import { ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { COLORS, ELEMENTS, hex, type ElementId } from '../theme';
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
  /** Pulsing glow over the lit influence dots (animated in {@link tickDots}). */
  private dotGlow = new Graphics();
  /** Centers + colors of the currently-lit influence dots, for the pulse. */
  private litDots: { x: number; y: number; color: number }[] = [];
  private dotPulse = 0;
  /** Influence-dot radius (kept in sync between the static draw and the glow). */
  private static readonly DOT_R = 12;
  /** Translucent preview of the building that would land here while dragging. */
  private ghost = new Container();
  /** Mini cooldown dial in the corner of an attacking tower (a shrinking sector). */
  private cdDial = new Graphics();
  /** Element glow color the cooldown dial is drawn in (set when a tower is placed). */
  private cdColor: number = COLORS.white;
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
  private occupied = false;
  /** Element-symbol textures (sym_<element>) overlaid on the influence dots. */
  private symbols?: Partial<Record<ElementId, Texture>>;
  /** The placed tower's main sprite (swapped to the current facing frame). */
  private towerSprite?: Sprite;
  /** 8 directional aim frames (d0=N, d1=NE … d7=NW clockwise) from an `<id>_dirs` 3×3 sheet. */
  private dirFrames?: Texture[];
  /** Fit box for the tower sprite (full slot for sheet cells, 0.82 for a single). */
  private spriteFitBox = 0;
  /** Default facing on build and before the first target: South-East. */
  private static readonly DEFAULT_OCTANT = 3;
  /** Seconds per 45° step — the turret turns one octant at a time, not instantly. */
  private static readonly ROT_STEP_SEC = 0.06;
  /** Octant currently SHOWN (0–7). The turret steps toward {@link targetOctant}. */
  private displayOctant = SlotView.DEFAULT_OCTANT;
  /** Octant the turret WANTS to face (last aim; retained when no target is in range). */
  private targetOctant = SlotView.DEFAULT_OCTANT;
  /** Time banked toward the next one-octant rotation step. */
  private aimTimer = 0;

  constructor(index: number, size: number) {
    super();
    this.index = index;
    this.size = size;
    this.effectLabel.anchor.set(0, 0.5);
    this.effect.addChild(this.effectBg, this.effectLabel);
    this.effect.visible = false;
    this.addChild(this.base, this.reso, this.content, this.dotGlow, this.hl, this.ghost, this.cdDial, this.effect);
    this.ghost.visible = false;
    this.cdDial.visible = false;
    this.drawEmpty();
  }

  get cellSize(): number {
    return this.size;
  }

  setEmpty(): void {
    this.occupied = false;
    this.content.removeChildren().forEach((c) => c.destroy());
    this.reso.clear();
    this.litDots = [];
    this.dotGlow.clear();
    this.towerSprite = undefined;
    this.dirFrames = undefined;
    this.spriteFitBox = 0;
    this.displayOctant = SlotView.DEFAULT_OCTANT;
    this.targetOctant = SlotView.DEFAULT_OCTANT;
    this.aimTimer = 0;
    this.setCooldown(0);
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
  ): void {
    this.occupied = true;
    this.content.removeChildren().forEach((c) => c.destroy());
    this.setCooldown(0);
    const s = this.size;
    const skin = ELEMENTS[element];
    this.cdColor = skin.glow;

    this.base.clear();
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).fill({ color: COLORS.metalDark, alpha: 0.92 });
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).stroke({ width: 4, color: skin.base });
    this.base.roundRect(-s / 2 + 5, -s / 2 + 5, s - 10, s - 10, 12).stroke({ width: 2, color: skin.glow, alpha: 0.4 });

    // Turret aim sheet: a 3×3 directional sprite-sheet (`<id>_dirs`); the 8
    // perimeter cells are the compass aims. A rotating turret renders entirely
    // from the sheet — it builds facing South-East ({@link DEFAULT_OCTANT}) and
    // turns one octant at a time toward its target (see setAim/tickAim). Towers
    // without a sheet (supports, statics) just show `art`.
    const sprite = new Sprite(art);
    if (dirStrip) {
      this.dirFrames = this.sliceSheet3x3(dirStrip);
      this.spriteFitBox = s; // sheet cells include their own margin → fit cell to the slot
      this.displayOctant = SlotView.DEFAULT_OCTANT;
      this.targetOctant = SlotView.DEFAULT_OCTANT;
      this.aimTimer = 0;
      sprite.texture = this.dirFrames[this.displayOctant]!;
    } else {
      this.dirFrames = undefined;
      this.spriteFitBox = s * 0.82;
    }
    fitSprite(sprite, this.spriteFitBox, this.spriteFitBox);
    this.content.addChild(sprite);
    this.towerSprite = sprite;

    this.drawDots(dots);
    this.drawResonance(resonant, skin.glow);
  }

  /**
   * Slice a 3×3 directional sheet into the 8 compass aim frames (d0 = N, then
   * clockwise to d7 = NW). Each cell points outward from center by its grid
   * position (top row NW/N/NE, etc.); the center cell is unused. Equal cells →
   * no jump when swapping. Future per-state/per-grade variants = separate sheets.
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

  /**
   * Set the turret's DESIRED facing from a scene-space aim angle (radians, screen
   * convention: 0 = east, +PI/2 = south) — snapped to the nearest of 8 octants
   * (0 = north, clockwise). The sprite doesn't jump here; {@link tickAim} steps it
   * there. `null` keeps the last desired facing (turret holds its last aim when no
   * enemy is in range). No-op for towers without a directional sheet.
   */
  setAim(angle: number | null): void {
    if (!this.dirFrames || angle === null) return;
    this.targetOctant = ((Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  }

  /**
   * Advance the shown facing one octant at a time toward {@link targetOctant},
   * one step per {@link ROT_STEP_SEC}, taking the shorter way around the ring so
   * it passes through every intermediate octant rather than snapping. Call each frame.
   */
  tickAim(dt: number): void {
    const frames = this.dirFrames;
    const sprite = this.towerSprite;
    if (!frames || !sprite || this.displayOctant === this.targetOctant) return;
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
      fitSprite(sprite, this.spriteFitBox, this.spriteFitBox);
    }
  }

  /**
   * Influence dots along the bottom edge (v2 §9): grade = count, color = wanted
   * element. Each dot sits on a translucent backing in its own element color so it
   * reads even unlit; a lit dot is a solid disc that also gets a pulsing glow
   * (driven by {@link tickDots}) to flag the active synergy at a glance.
   */
  private drawDots(dots: readonly SynergyDot[]): void {
    this.litDots = [];
    this.dotGlow.clear();
    this.dotPulse = 0;
    if (dots.length === 0) return;
    const s = this.size;
    const g = new Graphics();
    const r = SlotView.DOT_R;
    const gap = r * 2.7;
    const startX = -((dots.length - 1) * gap) / 2;
    const y = s / 2 - r - 8;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      const skin = ELEMENTS[d.element];
      const color = skin.glow;
      const x = startX + i * gap;
      // Dark element-colored socket — reads like a switched-off LED of the wanted
      // element, so the slot is legible even before its synergy lights up.
      g.circle(x, y, r + 4).fill({ color: skin.dark, alpha: 0.95 });
      g.circle(x, y, r + 4).stroke({ width: 2, color, alpha: 0.45 });
      if (d.lit) {
        g.circle(x, y, r).fill({ color });
        this.litDots.push({ x, y, color });
      } else {
        // Unlit bulb: darker than the socket so "off" reads at a glance.
        g.circle(x, y, r).fill({ color: COLORS.black, alpha: 0.4 });
        g.circle(x, y, r).stroke({ width: 1.5, color, alpha: 0.5 });
      }
    }
    this.content.addChild(g);
    // Element symbol on each bulb (readability): the wanted-neighbor element by
    // SHAPE. Tinted dark on a lit (bright) bulb, bright on an unlit (dark) one.
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      const tex = this.symbols?.[d.element];
      if (!tex) continue;
      const skin = ELEMENTS[d.element];
      const sym = makeElementSymbol(tex, r * 1.7, d.lit ? skin.dark : skin.glow);
      sym.position.set(startX + i * gap, y);
      this.content.addChild(sym);
    }
  }

  /** Provide the element-symbol textures used to overlay the influence dots. */
  setSymbolTextures(symbols: Partial<Record<ElementId, Texture>>): void {
    this.symbols = symbols;
  }

  /** Pulse the glow on the lit influence dots + the effect badge. Call each frame. */
  tickDots(dt: number): void {
    if (this.effect.visible) {
      if (this.effectPulses) {
        this.effectPulse = (this.effectPulse + dt * 4) % (Math.PI * 2);
        this.effect.alpha = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.effectPulse));
      } else {
        this.effect.alpha = 1;
      }
    }
    if (this.litDots.length === 0) return;
    this.dotPulse = (this.dotPulse + dt * 3.5) % (Math.PI * 2);
    const pulse = 0.5 + 0.5 * Math.sin(this.dotPulse);
    const r = SlotView.DOT_R;
    this.dotGlow.clear();
    for (const d of this.litDots) {
      const grow = 4 + pulse * 7;
      this.dotGlow.circle(d.x, d.y, r + grow).fill({ color: d.color, alpha: 0.1 + 0.22 * pulse });
      this.dotGlow.circle(d.x, d.y, r + grow * 0.5).stroke({ width: 2, color: d.color, alpha: 0.4 + 0.45 * pulse });
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
   * Draw the attack cooldown as a shrinking pie sector tucked into the tower's
   * top-right corner: a full wedge right after firing that winds down to empty
   * as the shot recharges. `frac` is 1 (just fired) → 0 (ready); 0 hides it.
   */
  setCooldown(frac: number): void {
    const g = this.cdDial;
    g.clear();
    if (frac <= 0.001) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const s = this.size;
    const r = s * 0.15;
    const cx = s / 2 - r - 6;
    const cy = -s / 2 + r + 6;
    // Dark disc so the wedge reads over the tower art.
    g.circle(cx, cy, r).fill({ color: COLORS.black, alpha: 0.55 });
    // Shrinking wedge, clockwise from the top.
    const start = -Math.PI / 2;
    const end = start + Math.min(frac, 0.9999) * Math.PI * 2;
    g.moveTo(cx, cy).arc(cx, cy, r, start, end).fill({ color: this.cdColor, alpha: 0.85 });
    // Rim.
    g.circle(cx, cy, r).stroke({ width: 2, color: this.cdColor, alpha: 0.9 });
  }

  /**
   * Drive the net-effect badge in the tower's top-left corner (mirroring the
   * cooldown dial). `netPct` is the tower's total modifier — all neighbor buffs
   * and penalties plus overload, signed (v3 §9). The color encodes *composition*,
   * not just sign: green = only bonuses, red = only penalties, yellow = both (a
   * drop you can remove). With neither, the badge is hidden. Only redraws when the
   * state or percent changes; the pulse is driven in {@link tickDots}.
   */
  setEffect(netPct: number, hasBonus: boolean, hasPenalty: boolean): void {
    const state = !hasBonus && !hasPenalty ? 0 : hasBonus && hasPenalty ? 3 : hasPenalty ? 2 : 1;
    if (state === this.effectState && netPct === this.effectPct) return;
    this.effectState = state;
    this.effectPct = netPct;
    this.effectPulses = state >= 2; // red/yellow pulse for attention; green stays calm
    if (state === 0) {
      this.effect.visible = false;
      this.effect.alpha = 1;
      return;
    }
    this.drawEffect(netPct, state);
    this.effect.visible = true;
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
    const s = this.size;
    this.base.clear();
    this.hl.clear();
    // Recessed socket.
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).fill({ color: COLORS.black, alpha: 0.38 });
    this.base.roundRect(-s / 2, -s / 2, s, s, 16).stroke({ width: 3, color: COLORS.brass, alpha: 0.55 });
    this.base.roundRect(-s / 2 + 6, -s / 2 + 6, s - 12, s - 12, 12).stroke({
      width: 2,
      color: COLORS.brassLight,
      alpha: 0.25,
    });
    // Faint rune.
    this.base.circle(0, 0, s * 0.16).stroke({ width: 3, color: COLORS.brassLight, alpha: 0.22 });
    this.base.circle(0, 0, s * 0.07).fill({ color: COLORS.brassLight, alpha: 0.15 });
  }
}
