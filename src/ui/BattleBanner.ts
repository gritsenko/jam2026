import { Container, Graphics, type Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { Button } from './Button';
import { drawPanel, glowCircle, makeText } from './helpers';

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

    const bg = new Graphics();
    drawPanel(bg, -this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, {
      radius: 28,
      fill: COLORS.metalDark,
      edge: opts.accent,
      edgeWidth: 6,
      bevel: true,
      rivets: true,
    });
    this.panel.addChild(bg);

    const glow = glowCircle(this.panelW * 0.34, opts.accent, 0.35);
    glow.position.set(0, -60);
    this.panel.addChild(glow);

    const title = makeText(opts.title, 'display', { fontSize: 96, fill: hex(opts.accent) });
    title.anchor.set(0.5);
    title.position.set(0, -110);
    this.panel.addChild(title);

    if (opts.subtitle) {
      const sub: Text = makeText(opts.subtitle, 'title', { fontSize: 34, fill: hex(COLORS.textBright) });
      sub.anchor.set(0.5);
      sub.position.set(0, -20);
      this.panel.addChild(sub);
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
      button.position.set(bx, 110);
      this.panel.addChild(button);
      bx += btnW + gap;
    }
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
