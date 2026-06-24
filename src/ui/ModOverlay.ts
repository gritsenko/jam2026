import { Container, Graphics, type PointData, type Text } from 'pixi.js';
import { COLORS, ELEMENTS, type ElementId, hex } from '../theme';
import { makeText } from './helpers';
import type { ModEffect } from '../config/types';

/** Fixed element order for the Focus picker row. */
const ELEMENT_ORDER: readonly ElementId[] = ['Fire', 'Water', 'Electricity', 'Physical', 'Energy'];

/**
 * Platform-wide holo overlay for modernization cards (docs/done/modernization-cards.md §5).
 * While a modernization card is dragged, the *whole* platform is veiled by this
 * translucent holo layer (so the gesture reads as "global", unlike build cards
 * that light individual slots). Releasing over it applies the upgrade.
 *
 * For **Elemental Focus** the overlay also shows a row of the five element discs;
 * the release must land on one to pick which element gets the damage buff. The
 * other two upgrades apply on release anywhere over the platform.
 *
 * Origin is the center; the scene positions it over the platform (field space) and
 * sizes it to the plate. Presentational only — hit-testing helpers report which
 * element (if any) the pointer is over so the scene drives the actual apply.
 */
export class ModOverlay extends Container {
  private holo = new Graphics();
  private title: Text;
  private picker = new Container();
  private discs: { el: ElementId; node: Container; bg: Graphics }[] = [];
  private readonly size: number;
  private affordable = true;
  private pulse = 0;
  private discR: number;

  constructor(size: number) {
    super();
    this.size = size;
    this.discR = size * 0.11;
    this.title = makeText('', 'title', { fontSize: Math.round(size * 0.07), fill: hex(COLORS.crystal) });
    this.title.anchor.set(0.5);
    this.addChild(this.holo, this.title, this.picker);
    this.buildDiscs();
    this.drawHolo();
    this.visible = false;
  }

  /**
   * Reveal the holo for a modernization drag. `title` is the effect/price caption;
   * `picker` shows the five-element row (Focus) — otherwise release-anywhere applies.
   */
  show(_mod: ModEffect, title: string, picker: boolean): void {
    this.title.text = title;
    this.title.position.set(0, picker ? -this.size * 0.3 : 0);
    this.picker.visible = picker;
    this.affordable = true;
    this.pulse = 0;
    this.highlightElement(null);
    this.drawHolo();
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.highlightElement(null);
  }

  /** Tint the holo by affordability (red = can't pay); call when the wallet changes. */
  setAffordable(affordable: boolean): void {
    if (this.affordable === affordable) return;
    this.affordable = affordable;
    this.drawHolo();
  }

  /** Subtle border pulse so the holo reads as a live drop zone. */
  tick(dt: number): void {
    if (!this.visible) return;
    this.pulse += dt;
    this.holo.alpha = 0.85 + 0.15 * Math.sin(this.pulse * 5);
  }

  /** The element disc under a global point, or null (Focus picker hit-test). */
  elementAtGlobal(p: PointData): ElementId | null {
    if (!this.picker.visible) return null;
    for (const d of this.discs) {
      if (d.node.getBounds().rectangle.contains(p.x, p.y)) return d.el;
    }
    return null;
  }

  /** Brighten the disc for `el` (or none); the rest dim back to rest state. */
  highlightElement(el: ElementId | null): void {
    for (const d of this.discs) {
      const hot = d.el === el;
      this.paintDisc(d.bg, d.el, hot);
      d.node.scale.set(hot ? 1.12 : 1);
    }
  }

  /** Is a global point over the platform holo (release-anywhere apply)? */
  containsGlobal(p: PointData): boolean {
    return this.holo.getBounds().rectangle.contains(p.x, p.y);
  }

  private drawHolo(): void {
    const S = this.size;
    const r = S / 2;
    const color = this.affordable ? COLORS.crystal : COLORS.energyDanger;
    this.holo.clear();
    this.holo.roundRect(-r, -r, S, S, S * 0.09).fill({ color, alpha: 0.13 });
    this.holo.roundRect(-r, -r, S, S, S * 0.09).stroke({ width: 6, color, alpha: 0.85 });
    // Corner ticks to read as a targeting frame.
    const t = S * 0.12;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const cx = sx * (r - 10);
      const cy = sy * (r - 10);
      this.holo.moveTo(cx, cy).lineTo(cx - sx * t, cy).stroke({ width: 5, color, alpha: 0.95 });
      this.holo.moveTo(cx, cy).lineTo(cx, cy - sy * t).stroke({ width: 5, color, alpha: 0.95 });
    }
  }

  private buildDiscs(): void {
    const S = this.size;
    const n = ELEMENT_ORDER.length;
    const span = S * 0.82;
    const gap = span / (n - 1);
    const startX = -span / 2;
    const y = S * 0.06;
    ELEMENT_ORDER.forEach((el, i) => {
      const node = new Container();
      node.position.set(startX + i * gap, y);
      const bg = new Graphics();
      node.addChild(bg);
      const label = makeText(ELEMENTS[el].label, 'micro', {
        fontSize: Math.round(S * 0.034),
        fill: hex(COLORS.white),
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, this.discR + S * 0.03);
      if (label.width > gap * 0.95) label.scale.set((gap * 0.95) / label.width);
      node.addChild(label);
      this.picker.addChild(node);
      this.discs.push({ el, node, bg });
      this.paintDisc(bg, el, false);
    });
  }

  private paintDisc(bg: Graphics, el: ElementId, hot: boolean): void {
    const skin = ELEMENTS[el];
    const r = this.discR;
    bg.clear();
    bg.circle(0, 0, r + 5).fill({ color: skin.dark, alpha: 0.95 });
    bg.circle(0, 0, r).fill({ color: skin.glow, alpha: hot ? 1 : 0.82 });
    bg.circle(0, 0, r).stroke({ width: hot ? 6 : 3, color: hot ? COLORS.white : skin.base, alpha: 0.95 });
  }
}
