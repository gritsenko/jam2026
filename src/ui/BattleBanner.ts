import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { COLORS, ELEMENTS, type ElementId, hex } from '../theme';
import { t } from '../core/i18n';
import { Button } from './Button';
import { drawPanel, fitSprite, glowCircle, makeText } from './helpers';

/** Star slots shown on the result banner (the rating itself is 0..STAR_SLOTS). */
const STAR_SLOTS = 3;

export interface BannerButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/** A newly unlocked tower card to celebrate under the stars ("Tech unlocked"). */
export interface UnlockedCardView {
  /** Short display name (e.g. card's shortName). */
  name: string;
  /** Element, used to color the mini-card frame and glow. */
  element: ElementId;
  /** Card art texture (resolved by the scene from the card's iconKey). */
  icon?: Texture;
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
  /**
   * Tower cards this clear unlocked for the next level. When non-empty (and the
   * star row is shown) a "TECH UNLOCKED" section is drawn below the stars; the
   * panel grows to fit. Empty/absent leaves the victory layout unchanged.
   */
  unlockedCards?: UnlockedCardView[];
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

    // Three stacked layouts, each just grows the panel and pushes content out:
    //   plain  — defeat (no stars);
    //   stars  — victory with a 3-star rating row;
    //   unlock — victory that also unlocked tech, adding a card section below.
    // Without stars the layout is unchanged (defeat banner).
    const showStars = opts.stars !== undefined && opts.starTexture !== undefined;
    const unlocked = opts.unlockedCards ?? [];
    const showUnlock = showStars && unlocked.length > 0;
    const panelH = showUnlock ? 800 : showStars ? 524 : this.panelH;
    const titleY = showUnlock ? -320 : showStars ? -160 : -110;
    const glowY = showUnlock ? -290 : showStars ? -130 : -60;
    const subY = showUnlock ? -234 : showStars ? -76 : -20;
    const starsY = showUnlock ? -150 : 22; // star-row center (only when showStars)
    const buttonsY = showUnlock ? 320 : showStars ? 152 : 110;

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
      row.position.set(0, starsY);
      this.panel.addChild(row);
    }

    if (showUnlock) {
      const section = this.buildUnlockSection(unlocked);
      section.position.set(0, 52);
      this.panel.addChild(section);
    }

    const btnW = 360;
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

  /**
   * The "TECH UNLOCKED" reveal: a gold header over a centered row of mini-cards,
   * one per tower this clear unlocked for the next level. Origin-centered so the
   * panel can drop it in like the star row.
   */
  private buildUnlockSection(cards: UnlockedCardView[]): Container {
    const section = new Container();

    const header = makeText(t('banner.techUnlocked'), 'label', { fontSize: 30, fill: hex(COLORS.gold), letterSpacing: 3 });
    header.anchor.set(0.5);
    header.position.set(0, -78);
    section.addChild(header);

    const cardW = 132;
    const cardH = 168;
    const gap = 24;
    const totalW = cards.length * cardW + (cards.length - 1) * gap;
    let x = -totalW / 2 + cardW / 2;
    for (const c of cards) {
      const mini = this.buildUnlockCard(c, cardW, cardH);
      mini.position.set(x, 36);
      section.addChild(mini);
      x += cardW + gap;
    }
    return section;
  }

  /** A compact element-framed card portrait: glow, art and a name banner. */
  private buildUnlockCard(c: UnlockedCardView, W: number, H: number): Container {
    const card = new Container();
    const skin = ELEMENTS[c.element];

    const glow = glowCircle(W * 0.52, skin.glow, 0.4);
    glow.position.set(0, -H * 0.08);
    card.addChild(glow);

    const bg = new Graphics();
    drawPanel(bg, -W / 2, -H / 2, W, H, {
      radius: 16,
      fill: COLORS.metalDark,
      fillAlpha: 0.98,
      edge: skin.base,
      edgeWidth: 4,
      bevel: true,
    });
    // Element wash behind the art (mirrors the hand card's top panel).
    bg.roundRect(-W / 2 + 6, -H / 2 + 6, W - 12, H * 0.62, 12).fill({ color: skin.dark, alpha: 0.5 });
    card.addChild(bg);

    if (c.icon) {
      const art = new Sprite(c.icon);
      fitSprite(art, W - 24, H * 0.56);
      art.position.set(0, -H * 0.14);
      card.addChild(art);
    }

    const nameY = H * 0.32;
    const nameBg = new Graphics();
    nameBg.roundRect(-W / 2 + 8, nameY - 18, W - 16, 34, 8).fill({ color: COLORS.black, alpha: 0.45 });
    card.addChild(nameBg);
    const name = makeText(c.name, 'label', { fontSize: 20, fill: hex(skin.glow) });
    name.anchor.set(0.5);
    name.position.set(0, nameY - 1);
    if (name.width > W - 16) name.scale.set((W - 16) / name.width);
    card.addChild(name);

    return card;
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
