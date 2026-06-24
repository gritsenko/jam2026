import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LevelNode, LevelState } from '../config/types';
import { fitSprite, glowCircle, makeText } from './helpers';

/**
 * A level marker on the world map. Origin center. Available nodes pulse and are
 * clickable; cleared nodes read as done and show their best star rating; locked
 * nodes are dim and inert. The display `state` is computed live from campaign
 * progress (not the static config), so the same node re-renders as the player
 * advances or toggles Admin mode.
 */
export class WorldMapNode extends Container {
  readonly node: LevelNode;
  private ring = new Graphics();
  private glow?: Graphics;
  private pulse = 0;
  private state: LevelState;

  constructor(
    node: LevelNode,
    state: LevelState,
    stars: number,
    selectable: boolean,
    texAvailable: Texture,
    texLocked: Texture,
    onSelect: (n: LevelNode) => void,
  ) {
    super();
    this.node = node;
    this.state = state;
    const r = 46;

    if (state === 'available') {
      this.glow = glowCircle(r * 1.5, COLORS.brassLight, 0.6);
      this.addChild(this.glow);
    }

    const tex = state === 'locked' ? texLocked : texAvailable;
    const sprite = new Sprite(tex);
    fitSprite(sprite, r * 2, r * 2);
    if (state === 'cleared') sprite.tint = 0xbfae8a;
    this.addChild(sprite);

    this.addChild(this.ring);
    this.drawRing(r);

    const label = makeText(node.name, 'small', {
      fontSize: 22,
      fill: hex(state === 'locked' ? COLORS.textMuted : COLORS.textBright),
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, r + 8);
    this.addChild(label);

    if (state === 'cleared') {
      // Best star rating (1..3) earned for this level (§4) — filled vs empty pips.
      const pips = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
      const starText = makeText(pips, 'small', { fontSize: 26, fill: hex(COLORS.gold) });
      starText.anchor.set(0.5, 1);
      starText.position.set(0, -r - 6);
      this.addChild(starText);
    }

    // Available nodes are always selectable; cleared ones become replayable when
    // the scene allows it (Admin mode — §4 replay-for-stars).
    if (selectable) {
      this.eventMode = 'static';
      this.cursor = 'pointer';
      this.on('pointertap', () => onSelect(node));
    }
  }

  tick(dt: number): void {
    if (this.state !== 'available' || !this.glow) return;
    this.pulse += dt * 2.5;
    const s = 1 + 0.08 * Math.sin(this.pulse);
    this.glow.scale.set(s);
    this.glow.alpha = 0.6 + 0.25 * Math.sin(this.pulse);
  }

  private drawRing(r: number): void {
    const color =
      this.state === 'available'
        ? COLORS.brassLight
        : this.state === 'cleared'
          ? COLORS.brass
          : COLORS.metalLight;
    this.ring.circle(0, 0, r + 2).stroke({ width: 5, color });
    this.ring.circle(0, 0, r + 8).stroke({ width: 2, color, alpha: 0.4 });
  }
}
