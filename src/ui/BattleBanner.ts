import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { Button } from './Button';
import { drawPanel, fitSprite, glowCircle, makeText } from './helpers';

/** Star slots shown on the result banner (the rating itself is 0..STAR_SLOTS). */
const STAR_SLOTS = 3;

export interface BannerButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface BattleBannerOptions {
  title: string;
  subtitle?: string;
  /** Accent color for the title and the panel edge (e.g. green victory / red defeat). */
  accent: number;
  buttons: BannerButton[];
  /**
   * Earned stars (0..{@link STAR_SLOTS}) to show as a rating row. The row is drawn
   * only when this is set *and* {@link starTexture} is provided — so the defeat
   * banner (no stars) is unaffected.
   */
  stars?: number;
  /** Star icon texture: filled stars draw it as-is, empty stars draw it dimmed. */
  starTexture?: Texture;
}

/**
 * Full-screen end-of-battle overlay (victory / defeat): a scrim plus a centered
 * brass panel with a title, a one-line summary and action buttons. The scene
 * sizes the scrim via {@link setScreen} and centers the panel via
 * {@link setCenter}, then fades the whole thing in.
 */
export class BattleBanner extends Container {
  private readonly scrim = new Graphics();
  private readonly panel = new Container();
  private readonly panelW = 760;
  private readonly panelH = 440;

  constructor(opts: BattleBannerOptions) {
    super();
    this.addChild(this.scrim);
    this.addChild(this.panel);

    // The star row needs a taller panel and pushes the title/subtitle up to make
    // room above the buttons; without stars the layout is unchanged (defeat banner).
    const showStars = opts.stars !== undefined && opts.starTexture !== undefined;
    const panelH = showStars ? 524 : this.panelH;
    const titleY = showStars ? -160 : -110;
    const glowY = showStars ? -130 : -60;
    const subY = showStars ? -76 : -20;
    const buttonsY = showStars ? 152 : 110;

    const bg = new Graphics();
    drawPanel(bg, -this.panelW / 2, -panelH / 2, this.panelW, panelH, {
      radius: 28,
      fill: COLORS.metalDark,
      edge: opts.accent,
      edgeWidth: 6,
      bevel: true,
      rivets: true,
    });
    this.panel.addChild(bg);

    const glow = glowCircle(this.panelW * 0.34, opts.accent, 0.35);
    glow.position.set(0, glowY);
    this.panel.addChild(glow);

    const title = makeText(opts.title, 'display', { fontSize: 96, fill: hex(opts.accent) });
    title.anchor.set(0.5);
    title.position.set(0, titleY);
    this.panel.addChild(title);

    if (opts.subtitle) {
      const sub: Text = makeText(opts.subtitle, 'title', { fontSize: 34, fill: hex(COLORS.textBright) });
      sub.anchor.set(0.5);
      sub.position.set(0, subY);
      this.panel.addChild(sub);
    }

    if (showStars && opts.starTexture) {
      const row = this.buildStars(opts.stars ?? 0, opts.starTexture);
      row.position.set(0, 22);
      this.panel.addChild(row);
    }

    const btnW = 300;
    const btnH = 92;
    const gap = 36;
    const totalW = opts.buttons.length * btnW + (opts.buttons.length - 1) * gap;
    let bx = -totalW / 2 + btnW / 2;
    for (const b of opts.buttons) {
      const button = new Button({
        label: b.label,
        width: btnW,
        height: btnH,
        primary: b.primary ?? false,
        onClick: b.onClick,
      });
      button.position.set(bx, buttonsY);
      this.panel.addChild(button);
      bx += btnW + gap;
    }
  }

  /**
   * A centered row of {@link STAR_SLOTS} stars; the first `filled` are lit (gold
   * texture + glow), the rest are dimmed (tinted, low alpha). Origin-centered so it
   * drops into the panel's coordinate space.
   */
  private buildStars(filled: number, tex: Texture): Container {
    const row = new Container();
    const size = 92;
    const gap = 20;
    const totalW = STAR_SLOTS * size + (STAR_SLOTS - 1) * gap;
    const lit = Math.max(0, Math.min(STAR_SLOTS, Math.round(filled)));
    for (let i = 0; i < STAR_SLOTS; i++) {
      const x = -totalW / 2 + size / 2 + i * (size + gap);
      const earned = i < lit;
      if (earned) {
        const glow = glowCircle(size * 0.46, COLORS.gold, 0.42);
        glow.position.set(x, 0);
        row.addChild(glow);
      }
      const star = new Sprite(tex);
      fitSprite(star, size, size, 'contain');
      star.position.set(x, 0);
      if (!earned) {
        star.tint = COLORS.metalLight;
        star.alpha = 0.4;
      }
      row.addChild(star);
    }
    return row;
  }

  /** Draw the dimming scrim over the given full-screen rect. */
  setScreen(x: number, y: number, w: number, h: number): void {
    this.scrim.clear();
    this.scrim.rect(x, y, w, h).fill({ color: COLORS.black, alpha: 0.62 });
  }

  /** Center the panel at the given point (typically the safe-area center). */
  setCenter(cx: number, cy: number): void {
    this.panel.position.set(cx, cy);
  }
}
