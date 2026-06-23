import { Container, Graphics } from 'pixi.js';
import { COLORS, ELEMENTS, type ElementId } from '../theme';
import { glowCircle } from './helpers';

/**
 * A glowing energy bolt fired by a tower, colored by its element — the same
 * vector-energy idiom as the platform's resonance beams (not a stand-in for a
 * missing sprite). Origin center; the scene drives its position from the sim.
 */
export class ProjectileView extends Container {
  readonly element: ElementId;

  constructor(element: ElementId, radius: number) {
    super();
    this.element = element;
    const skin = ELEMENTS[element];

    this.addChild(glowCircle(radius * 2.6, skin.glow, 0.75));

    const core = new Graphics();
    core.circle(0, 0, radius).fill({ color: skin.glow });
    core.circle(0, 0, radius * 0.5).fill({ color: COLORS.white });
    core.circle(0, 0, radius).stroke({ width: Math.max(1, radius * 0.3), color: skin.base, alpha: 0.9 });
    this.addChild(core);
  }

  setPos(x: number, y: number): void {
    this.position.set(x, y);
  }
}
