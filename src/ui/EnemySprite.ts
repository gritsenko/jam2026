import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';
import { fitSprite } from './helpers';

/** Icy-cyan tint of the Aegis-Beacon ally-shield bubble (docs/done/support-enemies.md). */
const SHIELD_COLOR = 0x9fe8ff;

// --- Status-FX tuning (tweak these by hand) --------------------------------
/** Burn flames: blend mode of the fire overlay ('add' = additive glow). */
const FIRE_FX_BLEND = 'add' as const;
/** Burn flames: base opacity of the additive fire overlay (0.1 = 10%). */
const FIRE_FX_ALPHA = 0.4;
/** Burn flames: seconds each of the 4 flame frames holds before advancing. */
const FIRE_FX_FRAME_SEC = 0.09;
/** Burn flames: flame height as a fraction of the enemy token (width follows the frame aspect). */
const FIRE_FX_HEIGHT = 2.1;
/** Chill/frozen: multiply-tint that turns the whole enemy clearly blue. */
const CHILL_TINT = 0x5aa0ff;
/** Wet: cooler blue body wash (kept distinct from the stronger chill blue). */
const WET_TINT = 0x8fb8ff;
/** Chill snowflake badge stroke color. */
const FROST_ICON_COLOR = 0xeaf7ff;

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
/** Shared status-FX textures, passed in so EnemySprite stays Pixi-only. */
export interface StatusFx {
  /** Burn animation frames (fx_flame_0..3); cycled additively while burning. */
  readonly flames?: readonly Texture[];
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
  /** Burn animation: source frames + the lazily-created additive flame sprite. */
  private readonly flameTextures: readonly Texture[];
  private fireFx?: Sprite;
  /** Frame cursor + per-frame timer for the flame animation. */
  private fireFrame = 0;
  private fireFrameT = 0;
  /** Corner snowflake badge shown while chilled/frozen (drawn once, then toggled). */
  private frostIcon?: Graphics;

  constructor(texture: Texture, size: number, phase = 0, aura?: AuraView, fx: StatusFx = {}) {
    super();
    this.size = size;
    this.phase = phase;
    this.bobAmp = size * 0.04;
    this.auraColor = aura?.color ?? 0;
    this.auraRadius = aura?.radiusPx ?? 0;
    this.flameTextures = fx.flames ?? [];

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
   * Reflect active statuses (driven each frame from the sim's deadlines): an
   * animated flame while burning (DoT), and — only when NOT burning — a blue body
   * tint + corner snowflake while chilled/frozen, or a cooler wash while Wet.
   *
   * Fire wins over the cold visuals: the Steam resonance (Fire+Water) applies a
   * slow *and* a DoT on the same hit, which would otherwise paint a burning enemy
   * with a contradictory snowflake. So burning suppresses the chill/Wet tint and
   * the snowflake — a scalded enemy reads purely as on-fire.
   */
  setStatus(s: { burning: boolean; wet: boolean; chilled: boolean }): void {
    if (this.fireFx) this.fireFx.visible = s.burning;
    else if (s.burning) this.ensureFire();

    // Chill = the whole enemy turns blue + a small snowflake badge in the top-right
    // corner (no big overlay). Suppressed while burning (fire wins, no fire+ice mix).
    const showChill = s.chilled && !s.burning;
    if (this.frostIcon) this.frostIcon.visible = showChill;
    else if (showChill) this.ensureFrostIcon();

    // Chill wins the body wash (clearly blue); else a cooler Wet wash; none while burning.
    this.statusTint = showChill ? CHILL_TINT : s.wet && !s.burning ? WET_TINT : 0xffffff;
  }

  private ensureFire(): void {
    if (this.fireFx || this.flameTextures.length === 0) return;
    const f = new Sprite(this.flameTextures[0]);
    // Tall flame fitted to the token height (width follows the frame aspect), rising
    // from the feet. Additive + low alpha so it glows over the enemy without hiding it.
    fitSprite(f, this.size * FIRE_FX_HEIGHT, this.size * FIRE_FX_HEIGHT);
    f.anchor.set(0.5, 0.9);
    f.blendMode = FIRE_FX_BLEND;
    f.alpha = FIRE_FX_ALPHA;
    this.fireFrame = 0;
    this.fireFrameT = 0;
    this.fireFx = f;
    // Above the body, below the HP bar so the bar stays readable.
    this.addChildAt(f, this.getChildIndex(this.sprite) + 1);
  }

  /** Draw the corner snowflake badge once (then `setStatus` just toggles visibility). */
  private ensureFrostIcon(): void {
    if (this.frostIcon) return;
    const g = new Graphics();
    const r = this.size * 0.15;
    const cx = this.size * 0.34;
    const cy = -this.size * 0.34;
    // Dark disc backing so the snowflake reads on any enemy color.
    g.circle(cx, cy, r * 1.25).fill({ color: 0x0a1a30, alpha: 0.6 });
    g.circle(cx, cy, r * 1.25).stroke({ width: Math.max(1.5, r * 0.12), color: FROST_ICON_COLOR, alpha: 0.7 });
    // 6-arm snowflake with small side branches.
    const arms = 6;
    for (let k = 0; k < arms; k++) {
      const a = (k / arms) * Math.PI * 2;
      g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      for (const fr of [0.5, 0.74]) {
        const bx = cx + Math.cos(a) * r * fr;
        const by = cy + Math.sin(a) * r * fr;
        const bl = r * 0.3;
        g.moveTo(bx, by).lineTo(bx + Math.cos(a + 0.7) * bl, by + Math.sin(a + 0.7) * bl);
        g.moveTo(bx, by).lineTo(bx + Math.cos(a - 0.7) * bl, by + Math.sin(a - 0.7) * bl);
      }
    }
    g.stroke({ width: Math.max(2, r * 0.16), color: FROST_ICON_COLOR });
    this.frostIcon = g;
    this.addChild(g); // top-most corner badge
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

    // Burn: cycle the flame frames, ride the bob, and flicker the additive alpha.
    if (this.fireFx?.visible && this.flameTextures.length > 0) {
      this.fireFrameT += dt;
      if (this.fireFrameT >= FIRE_FX_FRAME_SEC) {
        this.fireFrameT -= FIRE_FX_FRAME_SEC;
        this.fireFrame = (this.fireFrame + 1) % this.flameTextures.length;
        this.fireFx.texture = this.flameTextures[this.fireFrame]!;
      }
      this.fireFx.y = bob + this.size * 0.18;
      const flick = 0.75 + 0.5 * (0.5 + 0.5 * Math.sin(this.phase * 7.3));
      this.fireFx.alpha = FIRE_FX_ALPHA * flick;
    }

    // Hit flash wins briefly; otherwise the body carries its status wash (or none).
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) this.sprite.tint = this.statusTint;
    } else {
      this.sprite.tint = this.statusTint;
    }
  }
}
