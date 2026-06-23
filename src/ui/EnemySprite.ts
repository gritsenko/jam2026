import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite } from './helpers';

/**
 * Atmospheric enemy token on the track. Origin center. Gently bobs; call
 * `tick(dt)` from the scene's update loop. No pathing / combat — decor only.
 */
export class EnemySprite extends Container {
  private sprite: Sprite;
  private phase: number;
  private bobAmp: number;

  constructor(texture: Texture, size: number, phase = 0) {
    super();
    this.phase = phase;
    this.bobAmp = size * 0.04;

    const shadow = new Graphics();
    shadow.ellipse(0, size * 0.46, size * 0.32, size * 0.1).fill({ color: COLORS.black, alpha: 0.3 });
    this.addChild(shadow);

    this.sprite = new Sprite(texture);
    fitSprite(this.sprite, size, size);
    this.addChild(this.sprite);
  }

  tick(dt: number): void {
    this.phase += dt * 2.2;
    this.sprite.y = Math.sin(this.phase) * this.bobAmp;
  }
}
