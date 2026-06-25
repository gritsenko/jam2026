import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite } from './helpers';

/** Icy-cyan tint of the Aegis-Beacon ally-shield bubble (docs/planned/support-enemies.md). */
const SHIELD_COLOR = 0x9fe8ff;

/** Support-mob aura ring (the "enemies synergize" telegraph): its element glow + true reach. */
export interface AuraView {
  /** Tint of the emanating ring (element glow color). */
  readonly color: number;
  /** True aura reach in arena px (`auraRadiusFrac × arenaWidth`). */
  readonly radiusPx: number;
}

/**
 * An enemy token on the ring. Origin center. Bobs gently and shows a slim HP
 * bar once damaged; call `tick(dt)` from the scene each frame. Position, HP and
 * death/leak animations are driven by the scene from the simulation — this is a
 * presentational view, it holds no combat state.
 *
 * Support mobs pass an {@link AuraView} so their buff radius is telegraphed by a
 * soft pulsing ring; any enemy carrying an Aegis-Beacon shield shows a bubble
 * (driven by {@link setShield}).
 */
export class EnemySprite extends Container {
  private readonly sprite: Sprite;
  private readonly hpBar = new Graphics();
  private readonly shieldGfx = new Graphics();
  private readonly auraGfx?: Graphics;
  private readonly auraColor: number;
  private readonly auraRadius: number;
  private readonly size: number;
  private phase: number;
  private readonly bobAmp: number;
  /** Seconds left on the white "took a hit" flash. */
  private hitFlash = 0;
  /** Current shield fill 0..1 (0 = no bubble). */
  private shieldFrac = 0;

  constructor(texture: Texture, size: number, phase = 0, aura?: AuraView) {
    super();
    this.size = size;
    this.phase = phase;
    this.bobAmp = size * 0.04;
    this.auraColor = aura?.color ?? 0;
    this.auraRadius = aura?.radiusPx ?? 0;

    // Aura ring sits lowest so the mob (and everyone in its reach) draws over it.
    if (aura) {
      this.auraGfx = new Graphics();
      this.addChild(this.auraGfx);
    }

    const shadow = new Graphics();
    shadow.ellipse(0, size * 0.46, size * 0.32, size * 0.1).fill({ color: COLORS.black, alpha: 0.3 });
    this.addChild(shadow);

    this.sprite = new Sprite(texture);
    fitSprite(this.sprite, size, size);
    this.addChild(this.sprite);

    // Shield bubble wraps the sprite; HP bar stays on top of everything.
    this.shieldGfx.visible = false;
    this.addChild(this.shieldGfx);

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

  /**
   * Aegis-Beacon ally shield (docs/planned/support-enemies.md): show a bubble whose
   * opacity tracks the remaining shield. `cur`/`max` are shield HP; 0 hides it.
   */
  setShield(cur: number, max: number): void {
    const f = max > 0 ? Math.min(Math.max(cur / max, 0), 1) : 0;
    this.shieldFrac = f;
    if (f <= 0) {
      this.shieldGfx.visible = false;
      this.shieldGfx.clear();
    } else {
      this.shieldGfx.visible = true; // redrawn each tick for the pulse
    }
  }

  /** Brief warm blink when struck. */
  playHit(): void {
    this.hitFlash = 0.1;
    this.sprite.tint = 0xffc9b0;
  }

  tick(dt: number): void {
    this.phase += dt * 2.2;
    const bob = Math.sin(this.phase) * this.bobAmp;
    this.sprite.y = bob;

    // Aura reach ring — slow soft pulse, low alpha so a big radius doesn't dominate.
    if (this.auraGfx && this.auraRadius > 0) {
      const p = 0.5 + 0.5 * Math.sin(this.phase * 0.9);
      const r = this.auraRadius * (0.93 + 0.07 * p);
      this.auraGfx.clear();
      this.auraGfx.circle(0, bob, r).fill({ color: this.auraColor, alpha: 0.04 + 0.04 * p });
      this.auraGfx
        .circle(0, bob, r)
        .stroke({ width: 2, color: this.auraColor, alpha: 0.16 + 0.12 * p });
    }

    // Shield bubble — faster pulse, opacity scaled by remaining shield.
    if (this.shieldFrac > 0) {
      const p = 0.5 + 0.5 * Math.sin(this.phase * 3);
      const r = this.size * 0.5;
      this.shieldGfx.clear();
      this.shieldGfx.circle(0, bob, r).fill({ color: SHIELD_COLOR, alpha: 0.1 * this.shieldFrac });
      this.shieldGfx
        .circle(0, bob, r)
        .stroke({ width: 2 + 1.5 * p, color: SHIELD_COLOR, alpha: (0.35 + 0.25 * p) * this.shieldFrac });
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) this.sprite.tint = 0xffffff;
    }
  }
}
