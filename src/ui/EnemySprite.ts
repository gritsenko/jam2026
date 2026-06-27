import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite } from './helpers';

/** Icy-cyan tint of the Aegis-Beacon ally-shield bubble (docs/done/support-enemies.md). */
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
/** Shared status-overlay textures (fire/frost), passed in so EnemySprite stays Pixi-only. */
export interface StatusFx {
  readonly burn?: Texture;
  readonly frost?: Texture;
}

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
  /** Fitted |scale.x| of the body sprite, so facing-flip keeps a constant size. */
  private baseScaleX = 1;
  /** Element-wash tint applied between hit flashes (Wet/chill); white = none. */
  private statusTint = 0xffffff;
  /** Lazy status overlays (created on first use) + their source textures. */
  private readonly fxBurnTex?: Texture;
  private readonly fxFrostTex?: Texture;
  private fireFx?: Sprite;
  private frostFx?: Sprite;

  constructor(texture: Texture, size: number, phase = 0, aura?: AuraView, fx: StatusFx = {}) {
    super();
    this.size = size;
    this.phase = phase;
    this.bobAmp = size * 0.04;
    this.auraColor = aura?.color ?? 0;
    this.auraRadius = aura?.radiusPx ?? 0;
    this.fxBurnTex = fx.burn;
    this.fxFrostTex = fx.frost;

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
    this.baseScaleX = this.sprite.scale.x; // remember the fitted size for facing-flips
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
   * Aegis-Beacon ally shield (docs/done/support-enemies.md): show a bubble whose
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

  /**
   * Face the direction of travel. The art is authored facing LEFT (−x); moving
   * right mirrors the body sprite (only the sprite — not the HP bar / aura / shield).
   * Near-zero `dx` keeps the last facing so a stalled enemy doesn't flicker.
   */
  setFacing(dx: number): void {
    if (Math.abs(dx) < 0.001) return;
    this.sprite.scale.x = dx > 0 ? -this.baseScaleX : this.baseScaleX;
  }

  /**
   * Reflect active statuses (driven each frame from the sim's deadlines): a flame
   * overlay while burning (DoT), a frost overlay while chilled/frozen, and a cool
   * body wash for Wet/chill. See docs/done/projectiles-vfx-and-enemy-polish.md.
   */
  setStatus(s: { burning: boolean; wet: boolean; chilled: boolean }): void {
    if (this.fireFx) this.fireFx.visible = s.burning;
    else if (s.burning) this.ensureFire();

    if (this.frostFx) this.frostFx.visible = s.chilled;
    else if (s.chilled) this.ensureFrost();

    // Wet wins the body wash (it's the synergy linchpin); else a chill tint; else none.
    this.statusTint = s.wet ? 0x8fb8ff : s.chilled ? 0xc2ecff : 0xffffff;
  }

  private ensureFire(): void {
    if (this.fireFx || !this.fxBurnTex) return;
    const f = new Sprite(this.fxBurnTex);
    fitSprite(f, this.size * 0.8, this.size * 0.8);
    f.anchor.set(0.5, 0.9); // flames rise from around the feet
    this.fireFx = f;
    this.addChild(f); // above the body, below the HP bar would be ideal — but HP bar is added first; this draws over it briefly which is fine
  }

  private ensureFrost(): void {
    if (this.frostFx || !this.fxFrostTex) return;
    const f = new Sprite(this.fxFrostTex);
    fitSprite(f, this.size * 0.78, this.size * 0.78);
    f.anchor.set(0.5, 0.5);
    f.alpha = 0.85;
    this.frostFx = f;
    this.addChildAt(f, this.getChildIndex(this.sprite) + 1); // just over the body
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

    // Fire overlay rides the bob and flickers; frost overlay rides the bob.
    if (this.fireFx?.visible) {
      this.fireFx.y = bob + this.size * 0.18;
      const flick = 0.78 + 0.22 * Math.sin(this.phase * 7.3);
      this.fireFx.alpha = flick;
      this.fireFx.scale.y = this.fireFx.scale.x * (0.92 + 0.12 * (0.5 + 0.5 * Math.sin(this.phase * 5.1)));
    }
    if (this.frostFx?.visible) this.frostFx.y = bob;

    // Hit flash wins briefly; otherwise the body carries its status wash (or none).
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) this.sprite.tint = this.statusTint;
    } else {
      this.sprite.tint = this.statusTint;
    }
  }
}
