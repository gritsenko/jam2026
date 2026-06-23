import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LevelNode } from '../config/types';
import { fitSprite, glowCircle, makeText } from './helpers';

/**
 * A level marker on the world map. Origin center. Available nodes pulse and are
 * clickable; cleared nodes read as done; locked nodes are dim and inert.
 */
export class WorldMapNode extends Container {
  readonly node: LevelNode;
  private ring = new Graphics();
  private glow?: Graphics;
  private pulse = 0;

  constructor(node: LevelNode, texAvailable: Texture, texLocked: Texture, onSelect: (n: LevelNode) => void) {
    super();
    this.node = node;
    const r = 46;

    if (node.state === 'available') {
      this.glow = glowCircle(r * 1.5, COLORS.brassLight, 0.6);
      this.addChild(this.glow);
    }

    const tex = node.state === 'locked' ? texLocked : texAvailable;
    const sprite = new Sprite(tex);
    fitSprite(sprite, r * 2, r * 2);
    if (node.state === 'cleared') sprite.tint = 0xbfae8a;
    this.addChild(sprite);

    this.addChild(this.ring);
    this.drawRing(r);

    const label = makeText(node.name, 'small', {
      fontSize: 22,
      fill: hex(node.state === 'locked' ? COLORS.textMuted : COLORS.textBright),
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, r + 8);
    this.addChild(label);

    if (node.state === 'cleared') {
      const check = new Graphics();
      check
        .moveTo(-14, 0)
        .lineTo(-4, 12)
        .lineTo(16, -12)
        .stroke({ width: 7, color: COLORS.energyOk, cap: 'round', join: 'round' });
      this.addChild(check);
    }

    if (node.state === 'available') {
      this.eventMode = 'static';
      this.cursor = 'pointer';
      this.on('pointertap', () => onSelect(node));
    }
  }

  tick(dt: number): void {
    if (this.node.state !== 'available' || !this.glow) return;
    this.pulse += dt * 2.5;
    const s = 1 + 0.08 * Math.sin(this.pulse);
    this.glow.scale.set(s);
    this.glow.alpha = 0.6 + 0.25 * Math.sin(this.pulse);
  }

  private drawRing(r: number): void {
    const color =
      this.node.state === 'available'
        ? COLORS.brassLight
        : this.node.state === 'cleared'
          ? COLORS.brass
          : COLORS.metalLight;
    this.ring.circle(0, 0, r + 2).stroke({ width: 5, color });
    this.ring.circle(0, 0, r + 8).stroke({ width: 2, color, alpha: 0.4 });
  }
}
