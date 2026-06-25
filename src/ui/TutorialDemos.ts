import { Container, Graphics } from 'pixi.js';
import { COLORS, ELEMENTS } from '../theme';
import type { TutorialDemoId } from '../config/tutorial';
import { makeText } from './helpers';

/**
 * Tiny looping in-engine illustrations for the "process" lessons
 * (docs/done/tutorial-modals.md §6.2). Each demo is pure Graphics + a phase
 * clock driven by {@link TutorialDemo.tick} — no new assets, no tween handles to
 * leak. The modal places `view` in its illustration area and forwards `tick(dt)`.
 *
 * All demos draw centered on their own origin (0,0) inside a `box`×`box` area so
 * the modal can position the whole thing at the illustration center.
 */
export interface TutorialDemo {
  readonly view: Container;
  tick(dt: number): void;
  destroy(): void;
}

export type DemoFactory = (box: number) => TutorialDemo;

/** Smooth 0..1..0 triangle-ish pulse from a looping phase. */
function pingPong(t: number): number {
  return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
}

/** Synergy: a 3×3 grid; the center tile pulses and beams buff arrows to its four orthogonal neighbors. */
function makeSynergyDemo(box: number): TutorialDemo {
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);
  const cell = box * 0.22;
  const span = cell * 1.18;
  let phase = 0;

  const draw = () => {
    g.clear();
    const pulse = pingPong(phase);
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const cx = col * span;
        const cy = row * span;
        const isCenter = row === 0 && col === 0;
        const isNeighbor = Math.abs(row) + Math.abs(col) === 1;
        const lit = isCenter || (isNeighbor && pulse > 0.4);
        const fill = isCenter ? COLORS.brass : COLORS.metalMid;
        const s = isCenter ? 1 + pulse * 0.08 : 1;
        const w = cell * s;
        g.roundRect(cx - w / 2, cy - w / 2, w, w, 8).fill({ color: fill, alpha: 0.95 });
        g.roundRect(cx - w / 2, cy - w / 2, w, w, 8).stroke({
          width: 3,
          color: lit ? ELEMENTS.Fire.glow : COLORS.brass,
          alpha: lit ? 0.5 + pulse * 0.5 : 0.4,
        });
      }
    }
    // Buff arrows from center to the four orthogonal neighbors, sliding outward.
    const reach = span * (0.5 + pulse * 0.5);
    const ah = cell * 0.16;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const tipX = dx * reach;
      const tipY = dy * reach;
      const baseX = tipX - dx * ah - dy * ah;
      const baseY = tipY - dy * ah + dx * ah;
      const base2X = tipX - dx * ah + dy * ah;
      const base2Y = tipY - dy * ah - dx * ah;
      g.poly([tipX, tipY, baseX, baseY, base2X, base2Y]).fill({
        color: ELEMENTS.Fire.glow,
        alpha: 0.25 + pulse * 0.6,
      });
    }
  };

  draw();
  return {
    view,
    tick(dt) {
      phase += dt * 0.6;
      if (phase > 1) phase -= 1;
      draw();
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}

/** Merge: two identical mini-cards slide together and snap into one larger "Lv2" card. */
function makeMergeDemo(box: number): TutorialDemo {
  const view = new Container();
  const g = new Graphics();
  const label = makeText('Lv2', 'value', { fontSize: Math.round(box * 0.14) });
  label.anchor.set(0.5);
  label.visible = false;
  view.addChild(g, label);

  const cw = box * 0.26;
  const ch = box * 0.4;
  const spread = box * 0.26;
  let phase = 0;
  const T = 2.6; // loop seconds

  const card = (cx: number, cy: number, w: number, h: number, color: number, alpha = 1) => {
    g.roundRect(cx - w / 2, cy - h / 2, w, h, 10).fill({ color: COLORS.metalMid, alpha });
    g.roundRect(cx - w / 2 + 6, cy - h / 2 + 6, w - 12, h * 0.5, 8).fill({ color, alpha: alpha * 0.85 });
    g.roundRect(cx - w / 2, cy - h / 2, w, h, 10).stroke({ width: 3, color: COLORS.brass, alpha });
  };

  const draw = () => {
    g.clear();
    const p = phase / T;
    if (p < 0.55) {
      // Approach: the two cards close the gap.
      const k = 1 - p / 0.55;
      const off = spread * k;
      card(-off, 0, cw, ch, ELEMENTS.Electricity.base);
      card(off, 0, cw, ch, ELEMENTS.Electricity.base);
      label.visible = false;
    } else if (p < 0.85) {
      // Snap: one larger merged card with the grade-up label.
      const k = (p - 0.55) / 0.3;
      const grow = 1 + 0.18 * pingPong(Math.min(1, k) * 0.5);
      card(0, 0, cw * 1.15 * grow, ch * 1.1 * grow, ELEMENTS.Electricity.glow);
      label.visible = true;
      label.alpha = Math.min(1, k * 2);
    } else {
      // Fade-out before the loop restarts.
      const k = (p - 0.85) / 0.15;
      card(0, 0, cw * 1.15, ch * 1.1, ELEMENTS.Electricity.glow, 1 - k);
      label.visible = true;
      label.alpha = 1 - k;
    }
  };

  draw();
  return {
    view,
    tick(dt) {
      phase += dt;
      if (phase > T) phase -= T;
      draw();
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}

/** Resonance: two adjacent element cores emit a periodic reaction burst between them. */
function makeResonanceDemo(box: number): TutorialDemo {
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);
  const r = box * 0.15;
  const off = box * 0.22;
  let phase = 0;

  const draw = () => {
    g.clear();
    const pulse = pingPong(phase);
    // Fire (left) + Water (right) cores.
    for (const [cx, el] of [
      [-off, ELEMENTS.Fire],
      [off, ELEMENTS.Water],
    ] as const) {
      g.circle(cx, 0, r * (1 + pulse * 0.06)).fill({ color: el.base });
      g.circle(cx, 0, r).stroke({ width: 4, color: el.glow, alpha: 0.7 });
      g.circle(cx, 0, r * 0.5).fill({ color: el.glow, alpha: 0.4 + pulse * 0.4 });
    }
    // Reaction discharge between them: a jagged bolt + a central flash that peaks each cycle.
    const flash = Math.max(0, pulse - 0.5) * 2;
    if (flash > 0) {
      const steps = 5;
      const pts: number[] = [-off + r, 0];
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = -off + r + (off * 2 - r * 2) * t;
        const y = (i % 2 === 0 ? 1 : -1) * box * 0.06 * flash;
        pts.push(x, y);
      }
      pts.push(off - r, 0);
      g.poly(pts, false).stroke({ width: 4, color: COLORS.energyWarn, alpha: 0.5 + flash * 0.5 });
      g.circle(0, 0, box * 0.1 * flash).fill({ color: COLORS.white, alpha: 0.35 * flash });
      g.circle(0, 0, box * 0.16 * flash).fill({ color: ELEMENTS.Fire.glow, alpha: 0.18 * flash });
    }
  };

  draw();
  return {
    view,
    tick(dt) {
      phase += dt * 0.7;
      if (phase > 1) phase -= 1;
      draw();
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}

/** Energy: a segmented gauge fills into the yellow/red overload zone, then resets. */
function makeEnergyDemo(box: number): TutorialDemo {
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);
  const bw = box * 0.74;
  const bh = box * 0.2;
  const segs = 10;
  const gap = 4;
  const segW = (bw - gap * (segs - 1)) / segs;
  let phase = 0;
  const T = 3; // fill + hold + reset

  const draw = () => {
    g.clear();
    const p = phase / T;
    // 0..0.7 fill up, 0.7..0.85 hold full (overloaded), 0.85..1 drop back.
    let frac: number;
    if (p < 0.7) frac = p / 0.7;
    else if (p < 0.85) frac = 1;
    else frac = 1 - (p - 0.85) / 0.15;
    const filledN = frac * segs;

    g.roundRect(-bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 12).fill({ color: COLORS.metalDark, alpha: 0.9 });
    for (let i = 0; i < segs; i++) {
      const x = -bw / 2 + i * (segW + gap);
      const on = i < filledN;
      const t = (i + 0.5) / segs;
      const color = t < 0.6 ? COLORS.energyOk : t < 0.85 ? COLORS.energyWarn : COLORS.energyDanger;
      g.roundRect(x, -bh / 2, segW, bh, 4).fill({
        color: on ? color : COLORS.metalMid,
        alpha: on ? 1 : 0.5,
      });
    }
    // Overload glow on the bar when it tops out.
    if (frac >= 0.99) {
      g.roundRect(-bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 12).stroke({
        width: 4,
        color: COLORS.energyDanger,
        alpha: 0.7,
      });
    }
  };

  draw();
  return {
    view,
    tick(dt) {
      phase += dt;
      if (phase > T) phase -= T;
      draw();
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}

/** Registry of scripted demos, keyed by {@link TutorialDemoId}. */
export const TUTORIAL_DEMOS: Record<TutorialDemoId, DemoFactory> = {
  synergy: makeSynergyDemo,
  merge: makeMergeDemo,
  resonance: makeResonanceDemo,
  energy: makeEnergyDemo,
};
