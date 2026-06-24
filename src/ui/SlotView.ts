import { ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, ELEMENTS, type ElementId } from '../theme';
import type { SynergyDot } from '../game/synergy';
import { fitSprite } from './helpers';

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
  private occupied = false;

  constructor(index: number, size: number) {
    super();
    this.index = index;
    this.size = size;
    this.addChild(this.base, this.reso, this.content, this.dotGlow, this.hl, this.ghost, this.cdDial);
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
    this.setCooldown(0);
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

    const sprite = new Sprite(art);
    fitSprite(sprite, s * 0.82, s * 0.82);
    this.content.addChild(sprite);

    this.drawDots(dots);
    this.drawResonance(resonant, skin.glow);
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
  }

  /** Pulse the glow on the lit influence dots. Call each frame from the scene. */
  tickDots(dt: number): void {
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
