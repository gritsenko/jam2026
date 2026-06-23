import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite } from './helpers';

/**
 * An enemy token on the ring. Origin center. Bobs gently and shows a slim HP
 * bar once damaged; call `tick(dt)` from the scene each frame. Position, HP and
 * death/leak animations are driven by the scene from the simulation — this is a
 * presentational view, it holds no combat state.
 */
export class EnemySprite extends Container {
  private readonly sprite: Sprite;
  private readonly hpBar = new Graphics();
  private readonly size: number;
  private phase: number;
  private readonly bobAmp: number;
  /** Seconds left on the white "took a hit" flash. */
  private hitFlash = 0;

  constructor(texture: Texture, size: number, phase = 0) {
    super();
    this.size = size;
    this.phase = phase;
    this.bobAmp = size * 0.04;

    const shadow = new Graphics();
    shadow.ellipse(0, size * 0.46, size * 0.32, size * 0.1).fill({ color: COLORS.black, alpha: 0.3 });
    this.addChild(shadow);

    this.sprite = new Sprite(texture);
    fitSprite(this.sprite, size, size);
    this.addChild(this.sprite);

    this.hpBar.visible = false;
    this.addChild(this.hpBar);
  }

  /** Update the HP bar (0..1). Hidden at full health to keep the field clean. */
  setHpFrac(frac: number): void {
    const f = Math.min(Math.max(frac, 0), 1);
    if (f >= 1) {
      this.hpBar.visible = false;
      return;
    }
    const w = this.size * 0.64;
    const h = 8;
    const x = -w / 2;
    const y = -this.size * 0.54;
    const color = f > 0.5 ? COLORS.energyOk : f > 0.25 ? COLORS.energyWarn : COLORS.energyDanger;
    this.hpBar.clear();
    this.hpBar.roundRect(x - 2, y - 2, w + 4, h + 4, 4).fill({ color: COLORS.black, alpha: 0.6 });
    this.hpBar.roundRect(x, y, w * f, h, 3).fill({ color });
    this.hpBar.roundRect(x, y, w, h, 3).stroke({ width: 1.5, color: COLORS.black, alpha: 0.5 });
    this.hpBar.visible = true;
  }

  /** Brief warm blink when struck. */
  playHit(): void {
    this.hitFlash = 0.1;
    this.sprite.tint = 0xffc9b0;
  }

  tick(dt: number): void {
    this.phase += dt * 2.2;
    this.sprite.y = Math.sin(this.phase) * this.bobAmp;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) this.sprite.tint = 0xffffff;
    }
  }
}
