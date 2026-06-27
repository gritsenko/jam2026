import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { COLORS, ELEMENTS, type ElementId } from '../theme';
import { fitSprite, glowCircle } from './helpers';

export interface ProjectileOpts {
  /** Leave a fading motion trail behind the bolt (ball-lightning / homing rounds). */
  readonly trail?: boolean;
  /** Native facing of the sprite art (radians from +x); the bolt rotates to `velAngle - baseAngle`. */
  readonly baseAngle?: number;
}

/**
 * A tower's in-flight shot. Renders the element's projectile sprite (shot_*) over a
 * soft element glow, rotated to its travel direction; falls back to a procedural
 * energy bolt when the sprite is absent. The scene drives its position from the sim
 * (which owns hits) and feeds the ballistic arc / velocity angle. Homing rounds also
 * carry a short fading trail. See docs/done/projectiles-vfx-and-enemy-polish.md.
 */
export class ProjectileView extends Container {
  readonly element: ElementId;
  private readonly sprite?: Sprite;
  private readonly trailGfx?: Graphics;
  private readonly trailColor: number;
  private readonly baseAngle: number;
  /** Recent world positions (newest last) for the trail, in the parent's space. */
  private readonly history: { x: number; y: number }[] = [];

  constructor(texture: Texture | null, element: ElementId, radius: number, opts: ProjectileOpts = {}) {
    super();
    this.element = element;
    this.baseAngle = opts.baseAngle ?? 0;
    const skin = ELEMENTS[element];
    this.trailColor = skin.glow;

    // Trail sits lowest so the bolt draws over its own wake.
    if (opts.trail) {
      this.trailGfx = new Graphics();
      this.addChild(this.trailGfx);
    }

    this.addChild(glowCircle(radius * (texture ? 1.9 : 2.6), skin.glow, 0.7));

    if (texture) {
      this.sprite = new Sprite(texture);
      fitSprite(this.sprite, radius * 2.8, radius * 2.8);
      this.addChild(this.sprite);
    } else {
      // Procedural fallback (the legacy energy bolt) when the shot sprite is missing.
      const core = new Graphics();
      core.circle(0, 0, radius).fill({ color: skin.glow });
      core.circle(0, 0, radius * 0.5).fill({ color: COLORS.white });
      core.circle(0, 0, radius).stroke({ width: Math.max(1, radius * 0.3), color: skin.base, alpha: 0.9 });
      this.addChild(core);
    }
  }

  setPos(x: number, y: number): void {
    this.position.set(x, y);
    if (this.trailGfx) {
      this.history.push({ x, y });
      if (this.history.length > 9) this.history.shift();
      this.redrawTrail(x, y);
    }
  }

  /** Rotate the bolt to its travel direction (no-op for the procedural fallback). */
  setAngle(angle: number): void {
    if (this.sprite) this.sprite.rotation = angle - this.baseAngle;
  }

  /** Trail drawn in local space (positions relative to the bolt's current spot), fading toward the tail. */
  private redrawTrail(cx: number, cy: number): void {
    const g = this.trailGfx;
    if (!g) return;
    g.clear();
    const n = this.history.length;
    if (n < 2) return;
    for (let i = 1; i < n; i++) {
      const a = this.history[i - 1]!;
      const b = this.history[i]!;
      const f = i / (n - 1); // 0 (oldest) → 1 (newest)
      g.moveTo(a.x - cx, a.y - cy)
        .lineTo(b.x - cx, b.y - cy)
        .stroke({ width: 2 + 6 * f, color: this.trailColor, alpha: 0.05 + 0.35 * f, cap: 'round' });
    }
  }
}
