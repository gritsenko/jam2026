import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';

/**
 * Full-bleed scene background. Covers the entire canvas (including the decor
 * margins on wide screens, so there are never black bars) and, in wide mode,
 * draws a brass frame around the centered portrait play area.
 */
export class SceneBackground extends Container {
  private sprite: Sprite;
  private vignette = new Graphics();
  private frame = new Graphics();

  constructor(texture: Texture) {
    super();
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite, this.vignette, this.frame);
  }

  fit(info: LayoutInfo): void {
    const f = info.full;
    const tw = this.sprite.texture.width || 1;
    const th = this.sprite.texture.height || 1;
    const scale = Math.max(f.width / tw, f.height / th);
    this.sprite.scale.set(scale);
    this.sprite.position.set(f.x + f.width / 2, f.y + f.height / 2);

    this.vignette.clear();
    // Darken the canvas edges a touch for depth — soft gradient bands (no hard seam).
    this.vignette.rect(f.x, f.y, f.width, f.height).fill({ color: COLORS.black, alpha: 0.1 });
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const h = f.height * 0.14 * (1 - i / bands);
      this.vignette.rect(f.x, f.y, f.width, h).fill({ color: COLORS.black, alpha: 0.05 });
      this.vignette
        .rect(f.x, f.y + f.height - h, f.width, h)
        .fill({ color: COLORS.black, alpha: 0.06 });
    }

    this.frame.clear();
    // 'wide' centers horizontally; a very tall aspect (offsetY>0) letterboxes
    // vertically — both want the play area framed and the margins dimmed.
    if (info.mode === 'wide' || info.offsetY > 0) {
      const W = info.width;
      const H = info.height;
      // Dim only the decor margins (outside the frame), never the play area.
      const dim = COLORS.bgDeep;
      const a = 0.5;
      const leftW = Math.max(0, 0 - f.x);
      const rightX = W;
      const rightW = Math.max(0, f.x + f.width - W);
      const topH = Math.max(0, 0 - f.y);
      const botY = H;
      const botH = Math.max(0, f.y + f.height - H);
      if (leftW > 0) this.frame.rect(f.x, f.y, leftW, f.height).fill({ color: dim, alpha: a });
      if (rightW > 0) this.frame.rect(rightX, f.y, rightW, f.height).fill({ color: dim, alpha: a });
      if (topH > 0) this.frame.rect(0, f.y, W, topH).fill({ color: dim, alpha: a });
      if (botH > 0) this.frame.rect(0, botY, W, botH).fill({ color: dim, alpha: a });
      // Brass frame around the portrait play area.
      this.frame.roundRect(-6, -6, W + 12, H + 12, 8).stroke({ width: 10, color: COLORS.brass });
      this.frame.roundRect(-12, -12, W + 24, H + 24, 10).stroke({ width: 3, color: COLORS.brassLight, alpha: 0.5 });
    }
  }
}
