import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite, glowCircle } from './helpers';

/**
 * Circular hero portrait in an ornate brass frame (top-right of the HUD).
 * Origin is the center. Pass a real frame texture to overlay it; otherwise a
 * procedural brass ring is drawn so the placeholder still reads as a frame.
 */
export class HeroAvatar extends Container {
  constructor(avatar: Texture, radius = 70, frame?: Texture) {
    super();

    const glow = glowCircle(radius * 1.25, COLORS.brassLight, 0.4);
    this.addChild(glow);

    const portrait = new Sprite(avatar);
    fitSprite(portrait, radius * 2, radius * 2, 'cover');
    portrait.position.set(0, 0);

    const mask = new Graphics().circle(0, 0, radius).fill({ color: COLORS.white });
    this.addChild(portrait, mask);
    portrait.mask = mask;

    if (frame) {
      const frameSprite = new Sprite(frame);
      fitSprite(frameSprite, radius * 2.34, radius * 2.34);
      this.addChild(frameSprite);
    } else {
      const ring = new Graphics();
      ring.circle(0, 0, radius + 3).stroke({ width: 8, color: COLORS.brass });
      ring.circle(0, 0, radius + 9).stroke({ width: 3, color: COLORS.brassLight, alpha: 0.7 });
      // Decorative rivets around the ring.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ring
          .circle(Math.cos(a) * (radius + 6), Math.sin(a) * (radius + 6), 3.5)
          .fill({ color: COLORS.rivet });
      }
      this.addChild(ring);
    }
  }
}
