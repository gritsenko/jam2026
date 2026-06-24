import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite, glowCircle } from './helpers';

/**
 * Pre-wave source pin: a push-pin marking the edge the **next wave comes in from**.
 * The round head shows the upcoming enemy's icon; the spike points **toward the
 * off-screen source** (where the enemies emerge from beyond the screen), so the
 * player reads "the wave arrives from over there" and can re-anchor before it
 * lands. The head/icon stays upright; only the spike rotates to the source
 * direction via {@link setHeading}. Frame + spike are code-drawn (no PNG, per the
 * project's asset rules); the enemy art is an existing texture. Origin = head center.
 */
export class WaveTelegraph extends Container {
  private spike = new Graphics(); // pointer toward the off-screen source (rotates)
  private disc = new Graphics(); // dark head backing (under the icon)
  private ring = new Graphics(); // brass head frame (over the icon)
  private iconMask = new Graphics();
  private icon?: Sprite;
  private readonly r: number; // head radius

  constructor(size: number) {
    super();
    this.r = size * 0.42;
    this.addChild(glowCircle(size * 0.78, COLORS.energyDanger, 0.4));
    this.drawSpike(size);
    this.disc.circle(0, 0, this.r).fill({ color: COLORS.metalDark, alpha: 0.94 });
    this.iconMask.circle(0, 0, this.r * 0.84).fill({ color: COLORS.white });
    this.ring
      .circle(0, 0, this.r)
      .stroke({ color: COLORS.brass, width: this.r * 0.18 })
      .circle(0, 0, this.r * 0.84)
      .stroke({ color: COLORS.brassLight, width: this.r * 0.06, alpha: 0.8 });
    // spike (under, rotates toward source) → head disc → icon → mask → brass ring.
    this.addChild(this.spike, this.disc, this.iconMask, this.ring);
  }

  /** Aim the spike toward the off-screen source (radians); the head stays upright. */
  setHeading(angle: number): void {
    this.spike.rotation = angle;
  }

  /** Put the upcoming enemy's art inside the pin head (null clears it). */
  setEnemyIcon(tex: Texture | null): void {
    if (this.icon) {
      this.icon.destroy();
      this.icon = undefined;
    }
    if (!tex) return;
    const s = new Sprite(tex);
    fitSprite(s, this.r * 1.7, this.r * 1.7, 'cover');
    s.mask = this.iconMask;
    this.icon = s;
    this.addChildAt(s, this.getChildIndex(this.iconMask));
  }

  /** A tapered point from the head out to a tip along local +X (the source dir). */
  private drawSpike(size: number): void {
    const r = this.r;
    const tip = r * 2.5; // tip distance from head center
    const baseHalf = r * 0.7; // half-width where it meets the head (hidden under the disc)
    this.spike
      .moveTo(r * 0.3, -baseHalf)
      .lineTo(tip, 0)
      .lineTo(r * 0.3, baseHalf)
      .closePath()
      .fill({ color: COLORS.energyDanger, alpha: 0.95 })
      .stroke({ color: COLORS.brassLight, width: size * 0.035, alpha: 0.9, join: 'round' });
  }
}
