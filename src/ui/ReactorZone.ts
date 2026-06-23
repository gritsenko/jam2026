import { Container, Graphics, type PointData, Sprite } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import { drawPanel, fitSprite, glowCircle, makeText } from './helpers';
import type { SlotHighlight } from './SlotView';

/**
 * The Reactor: a right-edge drop zone for burning cards (mock). Origin center.
 * Highlights when a drag is in progress and reports global hit-testing.
 */
export class ReactorZone extends Container {
  private bg = new Graphics();
  private hl = new Graphics();
  private w: number;
  private h: number;

  /** Drop-zone footprint (origin is the center), for scene-side anchoring. */
  get zoneW(): number {
    return this.w;
  }
  get zoneH(): number {
    return this.h;
  }

  constructor(assets: AssetLoader, width = 196, height = 300) {
    super();
    this.w = width;
    this.h = height;
    const W = width;
    const H = height;

    drawPanel(this.bg, -W / 2, -H / 2, W, H, {
      radius: 22,
      fill: COLORS.metalMid,
      edge: COLORS.reactor,
      edgeWidth: 5,
      bevel: true,
      rivets: true,
    });
    this.addChild(this.bg);

    const title = makeText('REACTOR', 'label', { fontSize: 26, fill: hex(COLORS.reactor) });
    title.anchor.set(0.5);
    title.position.set(0, -H / 2 + 34);
    this.addChild(title);

    const glow = glowCircle(W * 0.32, COLORS.reactor, 0.6);
    glow.position.set(0, -6);
    this.addChild(glow);

    const icon = new Sprite(assets.get('icon_reactor'));
    fitSprite(icon, W * 0.62, W * 0.62);
    icon.position.set(0, -6);
    this.addChild(icon);

    const burn = makeText('BURN', 'title', { fontSize: 34, fill: hex(COLORS.reactor) });
    burn.anchor.set(0.5);
    burn.position.set(0, H / 2 - 78);
    this.addChild(burn);

    const sub = makeText('+5s OVERDRIVE', 'micro', { fontSize: 18, fill: hex(COLORS.energyOverdrive) });
    sub.anchor.set(0.5);
    sub.position.set(0, H / 2 - 44);
    this.addChild(sub);

    this.addChild(this.hl);
  }

  setHighlight(state: SlotHighlight): void {
    this.hl.clear();
    if (state === 'none') return;
    const color = state === 'hover' ? COLORS.dropHover : COLORS.reactor;
    const alpha = state === 'hover' ? 0.45 : 0.22;
    this.hl.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 22).fill({ color, alpha });
    this.hl.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 22).stroke({ width: 5, color });
  }

  containsGlobal(p: PointData): boolean {
    return this.bg.getBounds().rectangle.contains(p.x, p.y);
  }
}
