import type { PointData } from 'pixi.js';

/**
 * A polyline path through the arena, parameterized by *arc length* so a constant
 * `t` step yields constant on-screen speed regardless of where the corners fall.
 *
 * Waypoints are supplied as fractions of the arena image (0..1) and baked into
 * pixel coordinates for a given arena size, so the simulation reasons purely in
 * the arena's own coordinate space (the same space enemy/tower views live in).
 */
export class ArenaPath {
  private readonly pts: PointData[];
  /** Cumulative arc length at each waypoint; `cum[0] === 0`. */
  private readonly cum: number[];
  /** Total length of the path in arena pixels. */
  readonly length: number;

  constructor(waypointFracs: readonly PointData[], width: number, height: number) {
    this.pts = waypointFracs.map((p) => ({ x: p.x * width, y: p.y * height }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]!;
      const b = this.pts[i]!;
      this.cum.push(this.cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cum[this.cum.length - 1] ?? 0;
  }

  /** Position at progress `t` in [0,1] along the whole path (clamped to the ends). */
  pointAt(t: number): PointData {
    const first = this.pts[0] ?? { x: 0, y: 0 };
    if (this.length <= 0 || this.pts.length < 2) return { x: first.x, y: first.y };

    const target = Math.min(Math.max(t, 0), 1) * this.length;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i]! < target) i++;

    const a = this.pts[i - 1]!;
    const b = this.pts[i]!;
    const segStart = this.cum[i - 1]!;
    const segLen = this.cum[i]! - segStart || 1;
    const f = (target - segStart) / segLen;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
}
