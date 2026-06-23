import { Container, Graphics, type PointData } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import { CARDS } from '../config/cards';
import type { BattleStateMock, CardDef, Direction, PlacedCard } from '../config/types';
import { makeText } from './helpers';
import { SlotView, type SlotHighlight } from './SlotView';

const DIR_DELTA: Record<Direction, { dc: number; dr: number }> = {
  Up: { dc: 0, dr: -1 },
  Down: { dc: 0, dr: 1 },
  Left: { dc: -1, dr: 0 },
  Right: { dc: 1, dr: 0 },
};

/**
 * The 3x3 steampunk platform: plate art + nine SlotViews + resonance beams.
 * Origin is the center. Exposes slot hit-testing and drop highlighting for the
 * battle scene's drag & drop.
 */
export class PlatformGrid extends Container {
  readonly slots: SlotView[] = [];
  private plate = new Container();
  private beams = new Graphics();
  /** Inspection visuals drawn *under* the towers (range tint, cell highlights). */
  private inspectBelow = new Container();
  private slotLayer = new Container();
  /** Inspection visuals drawn *over* the towers (arrows, badges, selection ring). */
  private inspectAbove = new Container();
  private size: number;
  private cell = 0;
  private step = 0;
  /** Last applied placement, so inspection can read the inspected card. */
  private placed: (PlacedCard | null)[] = [];
  private inspectedIndex: number | null = null;

  constructor(
    private assets: AssetLoader,
    size: number,
  ) {
    super();
    this.size = size;
    this.addChild(this.plate, this.beams, this.inspectBelow, this.slotLayer, this.inspectAbove);
    this.buildPlate();

    const gap = size * 0.035;
    this.cell = (size * 0.78 - gap * 2) / 3;
    this.step = this.cell + gap;
    for (let i = 0; i < 9; i++) {
      const slot = new SlotView(i, this.cell);
      const c = i % 3;
      const r = Math.floor(i / 3);
      slot.position.set((c - 1) * this.step, (r - 1) * this.step);
      this.slots.push(slot);
      this.slotLayer.addChild(slot);
    }
  }

  /** Scale the whole grid (and its hit areas) to a target on-screen size. */
  setScaleSize(target: number): void {
    this.scale.set(target / this.size);
  }

  /** One grid cell's size in the parent (field) coordinate space, after scaling. */
  get cellWorldSize(): number {
    return this.cell * this.scale.x;
  }

  /** Center of slot `index` in this grid's *local* space. */
  private slotLocal(index: number): PointData {
    const c = index % 3;
    const r = Math.floor(index / 3);
    return { x: (c - 1) * this.step, y: (r - 1) * this.step };
  }

  /** Render the placed cards from the mock state and (re)draw resonance beams. */
  applyState(state: BattleStateMock): void {
    // Cards changed → any active inspection overlay is stale.
    this.clearInspect();
    this.placed = state.slots;
    state.slots.forEach((placed, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      if (placed) {
        const def = CARDS[placed.cardId];
        if (def) slot.setPlaced(this.artFor(placed.cardId), def.element, placed.grade);
        else slot.setEmpty();
      } else {
        slot.setEmpty();
      }
    });
    this.drawBeams(state);
  }

  /**
   * Center of slot `index` in this grid's *parent* coordinate space (the field),
   * accounting for the grid's own position and scale. Used to fire towers from
   * the right spot into the enemy ring.
   */
  slotScenePos(index: number): PointData {
    const slot = this.slots[index];
    if (!slot) return { x: this.x, y: this.y };
    return { x: this.x + slot.x * this.scale.x, y: this.y + slot.y * this.scale.y };
  }

  /** Returns the slot whose bounds contain the given global point, else null. */
  slotAtGlobal(global: PointData): SlotView | null {
    for (const slot of this.slots) {
      if (slot.getBounds().rectangle.contains(global.x, global.y)) return slot;
    }
    return null;
  }

  /**
   * Highlight every empty slot as a drop target. When `affordable` is false
   * (not enough SP for the held card) they light up red instead of green.
   */
  showDropTargets(affordable = true): void {
    const empty: SlotHighlight = affordable ? 'valid' : 'invalid';
    for (const slot of this.slots) slot.setHighlight(slot.isOccupied ? 'none' : empty);
  }

  /**
   * While hovering, mark `hovered` and keep the rest as plain valid targets.
   * When `affordable` is false, every empty slot reads as 'invalid' (no hover).
   */
  setHover(hovered: SlotView | null, affordable = true): void {
    for (const slot of this.slots) {
      if (slot.isOccupied) {
        slot.setHighlight('none');
      } else if (!affordable) {
        slot.setHighlight('invalid');
      } else {
        slot.setHighlight(slot === hovered ? 'hover' : 'valid');
      }
    }
  }

  clearHighlights(): void {
    for (const slot of this.slots) slot.setHighlight('none' as SlotHighlight);
  }

  /** Currently inspected slot index, or null. */
  get inspected(): number | null {
    return this.inspectedIndex;
  }

  /**
   * Spotlight a placed tower: ring the inspected slot, highlight the neighbor
   * cells it feeds, and stamp each with an effect badge (e.g. '+15% DMG').
   * Buffs read green, drains read red. The always-on resonance beams are dimmed
   * so the selected tower's links stand out. The attack-range circle is drawn by
   * the scene (it owns the cells→pixels grade math).
   */
  inspect(index: number): void {
    this.clearInspect();
    const placed = this.placed[index];
    if (!placed) return;
    const def = CARDS[placed.cardId];
    if (!def) return;
    this.inspectedIndex = index;
    this.beams.alpha = 0.18; // de-emphasize the global resonance web

    // Selection ring on the inspected slot.
    const s = this.cell;
    const origin = this.slotLocal(index);
    const ring = new Graphics();
    ring
      .roundRect(origin.x - s / 2 - 5, origin.y - s / 2 - 5, s + 10, s + 10, 18)
      .stroke({ width: 5, color: COLORS.dropHover, alpha: 0.95 });
    this.inspectAbove.addChild(ring);

    this.drawBuffLinks(index, def);
  }

  /**
   * Preview where a held card's buffs would land while it is being dragged over
   * slot `index` — the same affected-neighbor cells, arrows and effect badges as
   * tap-to-inspect, but without the selection ring (the dragged ghost already
   * marks the target slot). Cleared via {@link clearInspect}.
   */
  previewBuffs(index: number, def: CardDef): void {
    this.clearInspect();
    this.beams.alpha = 0.18; // de-emphasize the global resonance web
    this.drawBuffLinks(index, def);
  }

  /**
   * Draw the buff arrows, affected-neighbor cell highlights and effect badges for
   * a card (placed or previewed) sitting at `index`. Shared by tap-to-inspect and
   * the drag-time placement preview.
   */
  private drawBuffLinks(index: number, def: CardDef): void {
    const buff = def.buff;
    if (!buff) return;

    const s = this.cell;
    const origin = this.slotLocal(index);
    const dirs: Direction[] =
      buff.scope === 'adjacent' ? ['Up', 'Down', 'Left', 'Right'] : def.directions;
    const accent = buff.value >= 0 ? COLORS.dropValid : COLORS.energyDanger;
    const c = index % 3;
    const r = Math.floor(index / 3);

    for (const dir of dirs) {
      const d = DIR_DELTA[dir];
      const nc = c + d.dc;
      const nr = r + d.dr;
      if (nc < 0 || nc > 2 || nr < 0 || nr > 2) continue;
      const nx = (nc - 1) * this.step;
      const ny = (nr - 1) * this.step;

      // Highlight the affected neighbor cell (under the towers).
      const cell = new Graphics();
      cell.roundRect(nx - s / 2, ny - s / 2, s, s, 14).fill({ color: accent, alpha: 0.18 });
      cell.roundRect(nx - s / 2, ny - s / 2, s, s, 14).stroke({ width: 3, color: accent, alpha: 0.85 });
      this.inspectBelow.addChild(cell);

      // Emphasized arrow from the tower into that neighbor, plus its effect badge.
      this.drawInspectArrow(origin.x, origin.y, nx, ny, accent);
      this.addBadge(nx, ny, buff.label, accent);
    }
  }

  clearInspect(): void {
    this.inspectedIndex = null;
    this.inspectBelow.removeChildren().forEach((c) => c.destroy());
    this.inspectAbove.removeChildren().forEach((c) => c.destroy());
    this.beams.alpha = 1;
  }

  /** A bright arrow from the inspected slot toward a neighbor, stopping at its edge. */
  private drawInspectArrow(x1: number, y1: number, x2: number, y2: number, color: number): void {
    const g = new Graphics();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const back = this.cell * 0.55; // stop short of the neighbor center (room for the badge)
    const ex = x2 - Math.cos(ang) * back;
    const ey = y2 - Math.sin(ang) * back;
    g.moveTo(x1, y1).lineTo(ex, ey).stroke({ width: 9, color, alpha: 0.6 });
    g.moveTo(x1, y1).lineTo(ex, ey).stroke({ width: 3, color: COLORS.white, alpha: 0.6 });
    const ah = 18;
    g.poly([
      ex + Math.cos(ang) * ah, ey + Math.sin(ang) * ah,
      ex + Math.cos(ang + 2.5) * ah, ey + Math.sin(ang + 2.5) * ah,
      ex + Math.cos(ang - 2.5) * ah, ey + Math.sin(ang - 2.5) * ah,
    ]).fill({ color, alpha: 0.9 });
    this.inspectAbove.addChild(g);
  }

  /** A small labelled pill (e.g. '+15% DMG') centered on a neighbor cell. */
  private addBadge(x: number, y: number, label: string, color: number): void {
    const txt = makeText(label, 'small', { fontSize: 30, fill: hex(color) });
    txt.anchor.set(0.5);
    const w = txt.width + 26;
    const h = txt.height + 14;
    const g = new Graphics();
    g.roundRect(x - w / 2, y - h / 2, w, h, 12).fill({ color: COLORS.metalDark, alpha: 0.96 });
    g.roundRect(x - w / 2, y - h / 2, w, h, 12).stroke({ width: 3, color, alpha: 0.95 });
    this.inspectAbove.addChild(g);
    txt.position.set(x, y);
    this.inspectAbove.addChild(txt);
  }

  private artFor(cardId: string): ReturnType<AssetLoader['get']> {
    return this.assets.get(cardId);
  }

  private buildPlate(): void {
    const s = this.size;
    this.plate.removeChildren().forEach((c) => c.destroy());
    // Crisp procedural plate: keeps the flat 3x3 slots perfectly aligned with
    // drop-highlights and hit-testing. (The isometric base_platform.png sprite
    // is showcased on the main menu instead, where no grid alignment is needed.)
    const g = new Graphics();
    const o = s / 2;
    // Small corner cut only — a near-square plate gives the 3x3 grid more usable
    // area (bigger, easier tap targets on phones) than the old wide octagon.
    const chamfer = s * 0.07;
    const oct: number[] = [
      -o + chamfer, -o, o - chamfer, -o, o, -o + chamfer, o, o - chamfer,
      o - chamfer, o, -o + chamfer, o, -o, o - chamfer, -o, -o + chamfer,
    ];
    g.poly(oct).fill({ color: COLORS.metalMid });
    g.poly(oct).stroke({ width: 10, color: COLORS.brass });
    g.poly(oct.map((v) => v * 0.92)).stroke({ width: 4, color: COLORS.brassLight, alpha: 0.4 });
    // Rivets along the rim.
    const rivetR = o * 0.86;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      g.circle(Math.cos(a) * rivetR, Math.sin(a) * rivetR, 6).fill({ color: COLORS.rivet });
    }
    this.plate.addChild(g);
  }

  private drawBeams(state: BattleStateMock): void {
    this.beams.clear();
    state.slots.forEach((placed, i) => {
      if (!placed) return;
      const def = CARDS[placed.cardId];
      if (!def) return;
      const skin = ELEMENTS[def.element];
      const c = i % 3;
      const r = Math.floor(i / 3);
      for (const dir of def.directions) {
        const d = DIR_DELTA[dir];
        const nc = c + d.dc;
        const nr = r + d.dr;
        if (nc < 0 || nc > 2 || nr < 0 || nr > 2) continue;
        const x1 = (c - 1) * this.step;
        const y1 = (r - 1) * this.step;
        const x2 = (nc - 1) * this.step;
        const y2 = (nr - 1) * this.step;
        // Beam.
        this.beams.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 10, color: skin.glow, alpha: 0.5 });
        this.beams.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 4, color: COLORS.white, alpha: 0.5 });
        // Arrowhead near the neighbor.
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const hx = x2 - Math.cos(ang) * this.cell * 0.34;
        const hy = y2 - Math.sin(ang) * this.cell * 0.34;
        const ah = 16;
        this.beams
          .poly([
            hx + Math.cos(ang) * ah,
            hy + Math.sin(ang) * ah,
            hx + Math.cos(ang + 2.5) * ah,
            hy + Math.sin(ang + 2.5) * ah,
            hx + Math.cos(ang - 2.5) * ah,
            hy + Math.sin(ang - 2.5) * ah,
          ])
          .fill({ color: skin.glow, alpha: 0.85 });
      }
    });
  }
}
