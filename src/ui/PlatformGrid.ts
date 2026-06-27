import { Container, Graphics, Sprite, Texture, type PointData } from 'pixi.js';
import { COLORS, ELEMENTS, ELEMENT_IDS, elementSymbolKey, hex, type ElementId } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import { CARDS, COMPOSED_AIM_SHEETS, cardGrade, towerSeat } from '../config/cards';
import type { BattleStateMock, CardDef, PlacedCard } from '../config/types';
import { computeSynergy, type SlotSynergy } from '../game/synergy';
import { gridMetrics } from '../game/platformGeometry';
import { gradeLabel, statLabel, t } from '../core/i18n';
import { fitSprite, makeText, sliceCooldownSheet, sliceElementSymbolSheet } from './helpers';
import { SlotView, type SlotHighlight } from './SlotView';

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
 * The 3x3 steampunk platform: plate art + nine SlotViews.
 * Origin is the center. Exposes slot hit-testing and drop highlighting for the
 * battle scene's drag & drop. Synergy (v2 positional model) is resolved here so
 * the slot influence dots and the on-demand inspect/preview arrows read from one
 * source. There is **no** always-on broadcast web *to empty cells* — the noisy
 * "every card → every reachable cell" arrows are drawn only while a tower is
 * inspected or a card is being previewed for placement. But a quieter
 * **tower↔tower link layer** is always on, drawn *on the floor* (under the towers):
 * a small **triangle on the seam between two sockets, tinted by the source tower's
 * element**, points toward the neighbor it actually buffs (see {@link drawLinks};
 * a buff "exists" only when the fed tower desires the source's element — see
 * synergy.ts soft-needs). A mutual buff shows two triangles side-by-side. Empty
 * cells, and neighbors whose element isn't desired, get nothing.
 */
export class PlatformGrid extends Container {
  readonly slots: SlotView[] = [];
  private plate = new Container();
  /** Inspection visuals drawn *under* the towers (range tint, cell highlights). */
  private inspectBelow = new Container();
  /** Always-on connectors between occupied slots that buff each other. */
  private linkLayer = new Container();
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
    // linkLayer sits *under* the towers ("on the floor"): the direction markers are
    // small triangles placed on the seam between two sockets, where the floor shows
    // between the seat sprites. Where a tower does overlap a marker, it occludes it —
    // intended, so the markers read as floor decals, not as overlay noise.
    this.addChild(
      this.plate,
      this.inspectBelow,
      this.linkLayer,
      this.slotLayer,
      this.inspectAbove,
    );
    this.buildPlate();

    // Geometry lives in game/platformGeometry.ts so the headless bot matches the
    // rendered layout exactly (single source for slot positions / cell size).
    const m = gridMetrics(size);
    this.cell = m.cell;
    this.step = m.step;
    // One shared element-symbol lookup for every slot's influence dots: the
    // pre-baked off/on frames from Symbols.png (crisp, no per-frame downscale),
    // plus the legacy sym_ icons as the fallback for elements absent from the sheet.
    const symbols: Partial<Record<ElementId, Texture>> = {};
    for (const e of ELEMENT_IDS) symbols[e] = this.assets.get(elementSymbolKey(e));
    const symFrames = this.assets.has('Symbols')
      ? sliceElementSymbolSheet(this.assets.get('Symbols'))
      : undefined;
    // Shared charge-bar frames (cooldown.png) + dot-row backing plate (upgrade_back.png).
    const chargeFrames = this.assets.has('cooldown')
      ? sliceCooldownSheet(this.assets.get('cooldown'))
      : undefined;
    const dotPlate = this.assets.has('upgrade_back') ? this.assets.get('upgrade_back') : undefined;
    for (let i = 0; i < 9; i++) {
      const slot = new SlotView(i, this.cell);
      slot.setSymbolTextures(symbols);
      if (symFrames) slot.setSymbolFrames(symFrames.off, symFrames.on);
      if (dotPlate) slot.setDotPlate(dotPlate);
      if (chargeFrames) slot.setChargeFrames(chargeFrames);
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

  /** Render the placed cards from the mock state and resolve synergy. */
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
          // Composed sheets (COMPOSED_AIM_SHEETS) split base/head and crossfade.
          // Prefer a grade-specific aim sheet (`<id>_g2_dirs`) when present, else base.
          const gradedDirs = placed.grade > 1 ? `${def.iconKey}_g${placed.grade}_dirs` : '';
          const dirsKey =
            gradedDirs && this.assets.has(gradedDirs) ? gradedDirs : `${def.iconKey}_dirs`;
          const dirStrip = this.assets.has(dirsKey) ? this.assets.get(dirsKey) : undefined;
          slot.setPlaced(
            this.artFor(def.iconKey, placed.grade),
            def.element,
            placed.grade,
            syn?.dots ?? [],
            syn?.resonant ?? false,
            dirStrip,
            COMPOSED_AIM_SHEETS.has(def.iconKey),
            towerSeat(def.iconKey),
          );
        } else slot.setEmpty();
      } else {
        slot.setEmpty();
      }
    });
    this.drawLinks();
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

  /** Returns the slot whose cell box contains the given global point, else null. */
  slotAtGlobal(global: PointData): SlotView | null {
    for (const slot of this.slots) {
      // Content-independent (empty slots no longer draw a base → no getBounds).
      if (slot.hitTestGlobal(global)) return slot;
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
   * read green, drains red. The synergy links (lines, arrows, badges) only appear
   * here — the battlefield is otherwise free of them. The attack-range circle is
   * drawn by the scene (it owns the cells→pixels grade math).
   */
  inspect(index: number): void {
    this.clearInspect();
    const placed = this.placed[index];
    if (!placed) return;
    const def = CARDS[placed.cardId];
    if (!def) return;
    this.inspectedIndex = index;
    // The bright per-cell inspect arrows below supersede the quiet always-on
    // links; hide the link layer so the two don't double up.
    this.linkLayer.visible = false;

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
    this.linkLayer.visible = false;
    this.drawBuffLinks(index, def, grade);
    if (mergeToGrade !== undefined) this.drawMergeBadge(index, mergeToGrade);
  }

  /** A gold "MERGE → Lvn" plaque floated above the slot being merged into (§4). */
  private drawMergeBadge(index: number, grade: number): void {
    const s = this.cell;
    const origin = this.slotLocal(index);
    const txt = makeText(t('battle.mergeTo', { grade: gradeLabel(grade) }), 'small', {
      fontSize: 28,
      fill: hex(COLORS.energyOverdrive),
    });
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
    const label = `${g.buff >= 0 ? '+' : ''}${g.buff}% ${statLabel(def.buffStat)}`;
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
    this.linkLayer.visible = true;
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

  /**
   * Always-on, low-key connectors between two *occupied* slots that actually buff
   * one another — the "bridge" between neighboring towers (empty cells get none).
   * Reads {@link SlotSynergy.incoming} (each carries its source slot), merges the
   * two directions of a pair into one link, and points an arrowhead along the flow
   * of influence (double-headed when mutual). Hidden while a tower is inspected /
   * a card previewed, since the brighter inspect arrows cover the same ground.
   */
  private drawLinks(): void {
    this.linkLayer.removeChildren().forEach((c) => c.destroy());
    // key "a-b" (a<b) → signed buff in each direction (a→b, b→a). 0 = no influence.
    const pairs = new Map<string, { a: number; b: number; aToB: number; bToA: number }>();
    for (let to = 0; to < this.synergy.length; to++) {
      const syn = this.synergy[to];
      if (!syn) continue;
      const bySource = new Map<number, number>();
      for (const buff of syn.incoming) {
        bySource.set(buff.from, (bySource.get(buff.from) ?? 0) + buff.value);
      }
      for (const [from, net] of bySource) {
        if (net === 0) continue;
        const a = Math.min(from, to);
        const b = Math.max(from, to);
        const key = `${a}-${b}`;
        let e = pairs.get(key);
        if (!e) {
          e = { a, b, aToB: 0, bToA: 0 };
          pairs.set(key, e);
        }
        if (from === a) e.aToB += net; // a → b
        else e.bToA += net; // b → a
      }
    }
    for (const e of pairs.values()) this.drawLink(e);
  }

  /**
   * One connector between occupied slots `a`/`b`. Each direction of influence gets
   * a small **triangle on the seam between the two sockets**, colored by the *source*
   * tower's element and pointing toward the tower it feeds. A mutual buff shows two
   * triangles side-by-side (offset across the seam), one per element; a one-way buff
   * shows a single triangle. Drawn on the floor (under the towers).
   */
  private drawLink(e: { a: number; b: number; aToB: number; bToA: number }): void {
    const A = this.slotLocal(e.a);
    const B = this.slotLocal(e.b);
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    const mx = (A.x + B.x) / 2; // seam midpoint = border between the two slots
    const my = (A.y + B.y) / 2;
    // Unit vector *along* the seam (perpendicular to the link axis). Markers are
    // pushed out along it toward the slot edges/corners, where the floor shows
    // between the round bases (the bases fill the cell, so the seam centre is
    // covered). This also keeps a pair "aligned": a horizontal seam → both on the
    // same vertical line (X = mx), a vertical seam → both on the same horizontal
    // line (Y = my, clear of the central barrel).
    const px = -Math.sin(ang);
    const py = Math.cos(ang);
    const spread = this.cell * 0.34;
    const g = new Graphics();
    if (e.aToB !== 0) {
      this.drawTriangle(g, mx + px * spread, my + py * spread, ang, this.slotElement(e.a));
    }
    if (e.bToA !== 0) {
      this.drawTriangle(g, mx - px * spread, my - py * spread, ang + Math.PI, this.slotElement(e.b));
    }
    this.linkLayer.addChild(g);
  }

  /** Element of the tower currently placed at `index` (for tinting links). */
  private slotElement(index: number): ElementId | null {
    const placed = this.placed[index];
    if (!placed) return null;
    return CARDS[placed.cardId]?.element ?? null;
  }

  /** A small, element-tinted triangle at (x,y) pointing along `ang` (sized to the cell). */
  private drawTriangle(g: Graphics, x: number, y: number, ang: number, element: ElementId | null): void {
    const skin = element ? ELEMENTS[element] : null;
    const fill = skin?.base ?? COLORS.dropValid;
    const edge = skin?.glow ?? COLORS.white;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const px = -sin; // unit perpendicular
    const py = cos;
    const tip = this.cell * 0.11; // tip ahead of center
    const back = this.cell * 0.05; // base behind center
    const H = this.cell * 0.09; // half-width of the base
    const pts = [
      x + cos * tip, y + sin * tip, // tip
      x - cos * back + px * H, y - sin * back + py * H, // base corner 1
      x - cos * back - px * H, y - sin * back - py * H, // base corner 2
    ];
    g.poly(pts).fill({ color: fill, alpha: 0.95 });
    g.poly(pts).stroke({ width: this.cell * 0.016, color: edge, alpha: 0.85, join: 'round' });
  }

  private artFor(cardId: string, grade = 1): ReturnType<AssetLoader['get']> {
    // Prefer a merge-level variant (`<id>_g2`/`_g3`) when it exists; else the base art.
    if (grade > 1) {
      const gk = `${cardId}_g${grade}`;
      if (this.assets.has(gk)) return this.assets.get(gk);
    }
    return this.assets.get(cardId);
  }

  private buildPlate(): void {
    const s = this.size;
    this.plate.removeChildren().forEach((c) => c.destroy());
    // The platform board art (a top-down dark-steel plate with nine recessed
    // sockets) replaces the old procedurally-drawn octagon plate. It fills the
    // grid's base box; its sockets are centered and spaced to match the slot grid
    // (gridMetrics traces the same 310/235-of-1024 proportions), so towers seat
    // on the painted sockets and SlotView no longer paints its own socket.
    const board = new Sprite(this.assets.get('platform_board'));
    fitSprite(board, s, s);
    this.plate.addChild(board);
  }
}
