import { Container, Graphics, type PointData } from 'pixi.js';
import { COLORS, ELEMENTS } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import { CARDS } from '../config/cards';
import type { BattleStateMock, Direction } from '../config/types';
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
  private slotLayer = new Container();
  private size: number;
  private cell = 0;
  private step = 0;

  constructor(
    private assets: AssetLoader,
    size: number,
  ) {
    super();
    this.size = size;
    this.addChild(this.plate, this.beams, this.slotLayer);
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

  /** Render the placed cards from the mock state and (re)draw resonance beams. */
  applyState(state: BattleStateMock): void {
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

  /** Returns the slot whose bounds contain the given global point, else null. */
  slotAtGlobal(global: PointData): SlotView | null {
    for (const slot of this.slots) {
      if (slot.getBounds().rectangle.contains(global.x, global.y)) return slot;
    }
    return null;
  }

  /** Highlight every empty slot as a valid drop target. */
  showDropTargets(): void {
    for (const slot of this.slots) slot.setHighlight(slot.isOccupied ? 'none' : 'valid');
  }

  /** While hovering, mark `hovered` and keep the rest as plain valid targets. */
  setHover(hovered: SlotView | null): void {
    for (const slot of this.slots) {
      if (slot.isOccupied) {
        slot.setHighlight('none');
      } else {
        slot.setHighlight(slot === hovered ? 'hover' : 'valid');
      }
    }
  }

  clearHighlights(): void {
    for (const slot of this.slots) slot.setHighlight('none' as SlotHighlight);
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
