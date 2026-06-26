import { Container, Graphics, Texture, type PointData } from 'pixi.js';
import { COLORS, ELEMENTS, ELEMENT_IDS, elementSymbolKey, hex, type ElementId } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import { CARDS, cardGrade } from '../config/cards';
import type { BattleStateMock, BuffStat, CardDef, PlacedCard } from '../config/types';
import { computeSynergy, type SlotSynergy } from '../game/synergy';
import { gridMetrics } from '../game/platformGeometry';
import { makeText } from './helpers';
import { SlotView, type SlotHighlight } from './SlotView';

/** Short suffix per broadcast stat, for the inspection badges. */
const STAT_SUFFIX: Record<BuffStat, string> = {
  damage: 'DMG',
  range: 'RNG',
  tempo: 'SPD',
  defense: 'DEF',
};

/** Neighbor cells a card at (c,r) broadcasts to: orthogonal always, +diagonals when `diag`. */
function broadcastCells(c: number, r: number, diag: boolean): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = [];
  const ortho = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  const diagonals = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  const offsets = diag ? [...ortho, ...diagonals] : ortho;
  for (const [dc, dr] of offsets) {
    const nc = c + dc!;
    const nr = r + dr!;
    if (nc < 0 || nc > 2 || nr < 0 || nr > 2) continue;
    out.push({ c: nc, r: nr });
  }
  return out;
}

/**
 * The 3x3 steampunk platform: plate art + nine SlotViews + resonance beams.
 * Origin is the center. Exposes slot hit-testing and drop highlighting for the
 * battle scene's drag & drop. Synergy (v2 positional model) is resolved here so
 * the dots, broadcast arrows and resonance beams all read from one source.
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
  /** Resolved synergy for the last applied placement. */
  private synergy: (SlotSynergy | null)[] = [];
  private inspectedIndex: number | null = null;

  constructor(
    private assets: AssetLoader,
    size: number,
  ) {
    super();
    this.size = size;
    this.addChild(this.plate, this.beams, this.inspectBelow, this.slotLayer, this.inspectAbove);
    this.buildPlate();

    // Geometry lives in game/platformGeometry.ts so the headless bot matches the
    // rendered layout exactly (single source for slot positions / cell size).
    const m = gridMetrics(size);
    this.cell = m.cell;
    this.step = m.step;
    // One shared element-symbol lookup for every slot's influence dots.
    const symbols: Partial<Record<ElementId, Texture>> = {};
    for (const e of ELEMENT_IDS) symbols[e] = this.assets.get(elementSymbolKey(e));
    for (let i = 0; i < 9; i++) {
      const slot = new SlotView(i, this.cell);
      slot.setSymbolTextures(symbols);
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

  /** Render the placed cards from the mock state, resolve synergy and (re)draw beams. */
  applyState(state: BattleStateMock): void {
    // Cards changed → any active inspection overlay is stale.
    this.clearInspect();
    this.placed = state.slots;
    this.synergy = computeSynergy(state.slots);
    state.slots.forEach((placed, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      if (placed) {
        const def = CARDS[placed.cardId];
        const syn = this.synergy[i];
        if (def) {
          // Aim frames live under `<iconKey>_dirs` (hybrids share their parent's
          // strip via iconKey); absent for supports/un-generated art → static.
          const dirsKey = `${def.iconKey}_dirs`;
          const dirStrip = this.assets.has(dirsKey) ? this.assets.get(dirsKey) : undefined;
          slot.setPlaced(
            this.artFor(def.iconKey),
            def.element,
            placed.grade,
            syn?.dots ?? [],
            syn?.resonant ?? false,
            dirStrip,
          );
        } else slot.setEmpty();
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

  /** Is a global point over the platform plate? (Modernization release-anywhere, §5.) */
  containsGlobal(global: PointData): boolean {
    return this.plate.getBounds().rectangle.contains(global.x, global.y);
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
   * (not enough gold for the held card) they light up red instead of green.
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

  /** Mark a slot as the active merge target (a matching tower under the dragged card). */
  setMergeTarget(slot: SlotView | null): void {
    for (const s of this.slots) {
      if (s === slot) s.setHighlight('merge');
      else if (s.isOccupied) s.setHighlight('none');
    }
  }

  /**
   * Light every tower that the lifted card could merge into (same id + grade, not
   * maxed, not its own origin slot) as a valid target; the one under the pointer
   * reads as the active 'merge' target. Used while dragging a tower off the
   * platform (field-to-field merge, v2 §1.5) where empty slots are *not* targets.
   */
  showMergeTargets(
    cardId: string,
    grade: number,
    exceptIndex: number | null,
    hovered: SlotView | null = null,
  ): void {
    for (const slot of this.slots) {
      const placed = this.placed[slot.index];
      const ok =
        !!placed &&
        slot.index !== exceptIndex &&
        placed.cardId === cardId &&
        placed.grade === grade &&
        placed.grade < 3;
      slot.setHighlight(!ok ? 'none' : slot === hovered ? 'merge' : 'valid');
    }
  }

  clearHighlights(): void {
    for (const slot of this.slots) slot.setHighlight('none' as SlotHighlight);
  }

  /** Currently inspected slot index, or null. */
  get inspected(): number | null {
    return this.inspectedIndex;
  }

  /** Resolved synergy for a slot (read by the scene for the inspection panel). */
  synergyAt(index: number): SlotSynergy | null {
    return this.synergy[index] ?? null;
  }

  /**
   * Spotlight a placed tower: ring the inspected slot, highlight the neighbor
   * cells it feeds, and stamp each with an effect badge (e.g. '+22% DMG'). Buffs
   * read green, drains red. The always-on resonance beams are dimmed so the
   * selected tower's links stand out. The attack-range circle is drawn by the
   * scene (it owns the cells→pixels grade math).
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

    this.drawBuffLinks(index, def, placed.grade);
  }

  /**
   * Preview where a held card's buffs would land while it is being dragged over
   * slot `index` — the same affected-neighbor cells, arrows and effect badges as
   * tap-to-inspect, but without the selection ring. When `mergeToGrade` is given
   * (the drop would merge into a higher grade), a "MERGE → Lvn" plaque is stamped
   * above the slot. Cleared via {@link clearInspect}.
   */
  previewBuffs(index: number, def: CardDef, grade: number, mergeToGrade?: number): void {
    this.clearInspect();
    this.beams.alpha = 0.18;
    this.drawBuffLinks(index, def, grade);
    if (mergeToGrade !== undefined) this.drawMergeBadge(index, mergeToGrade);
  }

  /** A gold "MERGE → Lvn" plaque floated above the slot being merged into (§4). */
  private drawMergeBadge(index: number, grade: number): void {
    const s = this.cell;
    const origin = this.slotLocal(index);
    const txt = makeText(`MERGE → Lv${grade}`, 'small', { fontSize: 28, fill: hex(COLORS.energyOverdrive) });
    txt.anchor.set(0.5);
    const w = txt.width + 26;
    const h = txt.height + 14;
    const y = origin.y - s / 2 - h / 2 - 8;
    const g = new Graphics();
    g.roundRect(origin.x - w / 2, y - h / 2, w, h, 12).fill({ color: COLORS.metalDark, alpha: 0.96 });
    g.roundRect(origin.x - w / 2, y - h / 2, w, h, 12).stroke({ width: 3, color: COLORS.energyOverdrive, alpha: 0.95 });
    this.inspectAbove.addChild(g);
    txt.position.set(origin.x, y);
    this.inspectAbove.addChild(txt);
  }

  /**
   * Draw broadcast arrows, affected-neighbor cell highlights and effect badges for
   * a card sitting at `index` at `grade`: it reaches all orthogonal neighbors, plus
   * diagonals at Grade III. Shared by tap-to-inspect and the drag-time preview.
   */
  private drawBuffLinks(index: number, def: CardDef, grade: number): void {
    const g = cardGrade(def, grade);
    if (g.buff === 0 && !g.bonusDamage) return;

    const s = this.cell;
    const origin = this.slotLocal(index);
    const accent = g.buff >= 0 ? COLORS.dropValid : COLORS.energyDanger;
    const label = `${g.buff >= 0 ? '+' : ''}${g.buff}% ${STAT_SUFFIX[def.buffStat]}`;
    const c = index % 3;
    const r = Math.floor(index / 3);

    for (const cell of broadcastCells(c, r, g.diagonal === true)) {
      const nx = (cell.c - 1) * this.step;
      const ny = (cell.r - 1) * this.step;

      const tint = new Graphics();
      tint.roundRect(nx - s / 2, ny - s / 2, s, s, 14).fill({ color: accent, alpha: 0.18 });
      tint.roundRect(nx - s / 2, ny - s / 2, s, s, 14).stroke({ width: 3, color: accent, alpha: 0.85 });
      this.inspectBelow.addChild(tint);

      this.drawInspectArrow(origin.x, origin.y, nx, ny, accent);
      this.addBadge(nx, ny, label, accent);
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

  /** A small labelled pill (e.g. '+22% DMG') centered on a neighbor cell. */
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
    const g = new Graphics();
    const o = s / 2;
    const chamfer = s * 0.07;
    const oct: number[] = [
      -o + chamfer, -o, o - chamfer, -o, o, -o + chamfer, o, o - chamfer,
      o - chamfer, o, -o + chamfer, o, -o, o - chamfer, -o, -o + chamfer,
    ];
    // Dieselpunk dark-steel plate (matches the towers): dark fill, a recessed
    // inner panel, brass edge with a dark keyline under it, and a riveted rim.
    g.poly(oct).fill({ color: COLORS.metalDark });
    g.poly(oct.map((v) => v * 0.9)).fill({ color: COLORS.metalMid, alpha: 0.55 });
    g.poly(oct).stroke({ width: 12, color: COLORS.black, alpha: 0.4 });
    g.poly(oct).stroke({ width: 8, color: COLORS.brass });
    g.poly(oct.map((v) => v * 0.9)).stroke({ width: 3, color: COLORS.brassLight, alpha: 0.35 });
    const rivetR = o * 0.86;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      g.circle(Math.cos(a) * rivetR, Math.sin(a) * rivetR, 6).fill({ color: COLORS.rivet });
      g.circle(Math.cos(a) * rivetR, Math.sin(a) * rivetR, 6).stroke({ width: 1.5, color: COLORS.brassLight, alpha: 0.4 });
    }
    this.plate.addChild(g);
  }

  /** Always-on broadcast web: every placed card → its reachable neighbors. */
  private drawBeams(state: BattleStateMock): void {
    this.beams.clear();
    state.slots.forEach((placed, i) => {
      if (!placed) return;
      const def = CARDS[placed.cardId];
      if (!def) return;
      const g = cardGrade(def, placed.grade);
      const skin = ELEMENTS[def.element];
      const c = i % 3;
      const r = Math.floor(i / 3);
      const x1 = (c - 1) * this.step;
      const y1 = (r - 1) * this.step;
      for (const cell of broadcastCells(c, r, g.diagonal === true)) {
        const x2 = (cell.c - 1) * this.step;
        const y2 = (cell.r - 1) * this.step;
        this.beams.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 10, color: skin.glow, alpha: 0.4 });
        this.beams.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 4, color: COLORS.white, alpha: 0.4 });
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
          .fill({ color: skin.glow, alpha: 0.8 });
      }
    });
  }
}
