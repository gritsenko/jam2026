import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import type { AudioBus } from '../core/AudioBus';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { tween, Easings, type TweenHandle } from '../core/tween';
import type { TutorialLesson } from '../config/tutorial';
import { t, tutorialBody, tutorialTitle } from '../core/i18n';
import { Button } from './Button';
import { drawPanel, makeText, fitSprite, glowCircle } from './helpers';
import { TUTORIAL_DEMOS, type TutorialDemo } from './TutorialDemos';

// Largest the brass panel is allowed to grow; the actual size is clamped to the
// safe area in layout() so the card always fits — and uses most of it (the old
// fixed 820×1000 wasted half the screen and forced a tiny body font).
const MAX_CARD_W = 1000;
const MAX_CARD_H = 1520;
const MARGIN_X = 48;
const MARGIN_Y = 110;
const PAD = 60;
const ILLU = 360;
const TITLE_FONT = 60;
const BUTTON_H = 100;
// Body font auto-fits its region: big by default, shrinking only when a long
// lesson would overflow (so every lesson reads as large as it can).
const BODY_FONT_MAX = 46;
const BODY_FONT_MIN = 26;
const BODY_LINE_RATIO = 1.34;

/**
 * Modal onboarding carousel (docs/done/tutorial-modals.md §5). A dimmed scrim
 * behind a centered brass panel that walks the player through one level's pending
 * lessons: title, illustration (a ready sprite or a scripted in-engine demo) and
 * a short body, one page at a time. The scrim deliberately does NOT close on tap
 * — the player advances with the button so a lesson can't be skipped by accident.
 *
 * The card sizes itself to the safe area (see layout/renderPage) and the body
 * font scales to fill the space left under the illustration, so the copy is as
 * large as it can be on any screen.
 *
 * Self-contained, mirroring SettingsPanel: add it to a scene's top layer, call
 * `layout(info)` from the scene's layout hook and `tick(dt)` from update; it
 * calls `onDone` once the last page is acknowledged.
 */
export class TutorialModal extends Container {
  private scrim = new Graphics();
  private card = new Container();
  private cardBg = new Graphics();
  private content = new Container();
  private dots = new Graphics();
  private nextBtn: Button;

  /** Illustration holder (floats for idle life); rebuilt per page. */
  private illu = new Container();
  private illuGlow = new Graphics();
  private illuBaseY = 0;
  private currentDemo: TutorialDemo | null = null;

  /** Advisor (KloDouglas) layer, drawn ON TOP of the card so the figure overlaps its right edge. */
  private readonly advisorLayer = new Container();

  /** Current card size (clamped to the safe area by layout). */
  private cardW = MAX_CARD_W;
  private cardH = MAX_CARD_H;

  private pageIndex = 0;
  private idleClock = 0;
  private intro: TweenHandle | null = null;

  private readonly lessons: readonly TutorialLesson[];
  private readonly assets: AssetLoader;
  private readonly audio: AudioBus;
  private readonly onDone: () => void;

  constructor(
    lessons: readonly TutorialLesson[],
    assets: AssetLoader,
    audio: AudioBus,
    onDone: () => void,
  ) {
    super();
    this.lessons = lessons;
    this.assets = assets;
    this.audio = audio;
    this.onDone = onDone;

    // Scrim blocks taps from reaching the battlefield, but has no close handler.
    this.scrim.eventMode = 'static';

    // Center origin (pivot at panel middle) so the intro can scale around center
    // and layout only needs the safe-area center point.
    this.card.eventMode = 'static';
    this.card.addChild(this.cardBg, this.content, this.dots);

    this.illu.addChild(this.illuGlow);

    this.nextBtn = new Button({
      label: t('common.next'),
      width: 320,
      height: BUTTON_H,
      primary: true,
      onClick: () => this.advance(),
    });
    this.card.addChild(this.nextBtn);

    // Advisor sits above everything in the card; passive so taps reach the button.
    this.advisorLayer.eventMode = 'none';
    this.card.addChild(this.advisorLayer);

    this.addChild(this.scrim, this.card);

    // Initial render at the default (max) size; layout() re-renders at the size
    // clamped to the real safe area.
    this.renderPage(0);

    // Entrance: fade + a small grow, like the end-of-battle banner.
    this.card.alpha = 0;
    this.card.scale.set(0.92);
    this.intro = tween({
      duration: 0.3,
      easing: Easings.outCubic,
      onUpdate: (e) => {
        if (this.card.destroyed) return;
        this.card.alpha = e;
        this.card.scale.set(0.92 + 0.08 * e);
      },
      onComplete: () => {
        this.intro = null;
      },
    });
  }

  /** Redraw the brass panel at the current card size. */
  private drawCardBg(): void {
    this.cardBg.clear();
    // Seat the light/dark seam just below the illustration so the title + icon sit
    // on the glossy band and the body copy reads on the darker plate below.
    const illuBottom = 54 + 96 + ILLU; // px from the panel's top edge (see renderPage)
    const bevelSplit = Math.min(0.46, Math.max(0.3, (illuBottom + 18) / this.cardH));
    drawPanel(this.cardBg, -this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, {
      radius: 28,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 5,
      bevel: true,
      bevelSplit,
      rivets: true,
    });
  }

  /** Build the content for the current lesson page (title + illustration + body). */
  private renderPage(index: number): void {
    this.pageIndex = index;
    const lesson = this.lessons[index];
    if (!lesson) return;

    this.drawCardBg();
    this.nextBtn.position.set(0, this.cardH / 2 - 70);

    // Tear down the previous page's content + demo.
    this.currentDemo?.destroy();
    this.currentDemo = null;
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.advisorLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.illu = new Container();
    this.illuGlow = new Graphics();
    this.illu.addChild(this.illuGlow);

    const accent = lesson.accent ? ELEMENTS[lesson.accent] : null;

    // Title — tinted by the lesson's element accent when present; shrunk to fit
    // the panel width if a long title would overflow.
    const title = makeText(tutorialTitle(lesson.id).toUpperCase(), 'title', {
      fontSize: TITLE_FONT,
      fill: accent ? hex(accent.glow) : hex(COLORS.textBright),
    });
    title.anchor.set(0.5, 0);
    const maxTitleW = this.cardW - PAD * 2;
    if (title.width > maxTitleW) title.scale.set(maxTitleW / title.width);
    const titleY = -this.cardH / 2 + 54;
    title.position.set(0, titleY);
    this.content.addChild(title);

    // Illustration: a soft glow behind a ready sprite, or a scripted demo.
    const glowColor = accent ? accent.glow : COLORS.brass;
    this.illuGlow.addChild(glowCircle(ILLU * 0.5, glowColor, 0.5));
    this.buildIllustration(lesson);
    this.illuBaseY = titleY + 96 + ILLU / 2;
    this.illu.position.set(0, this.illuBaseY);
    this.content.addChild(this.illu);

    // Advisor (KloDouglas) leans in from the card's bottom-right; only the body
    // text yields width to it. The illustration stays centered (the advisor sits
    // below it and never reaches the icon's row).
    const reserve = this.buildAdvisor();

    // Body — word-wrapped to the panel width and font-scaled to fill the space
    // between the illustration and the dots/button.
    const hasDots = this.lessons.length >= 2;
    const bodyTop = this.illuBaseY + ILLU / 2 + 30;
    const dotsY = this.cardH / 2 - 150;
    const bodyBottom = (hasDots ? dotsY : this.cardH / 2 - 120) - 28;
    const regionH = Math.max(60, bodyBottom - bodyTop);
    const body = this.fitBody(tutorialBody(lesson.id), maxTitleW - reserve, regionH);
    body.anchor.set(0.5, 0);
    body.position.set(-reserve / 2, bodyTop + Math.max(0, (regionH - body.height) / 2));
    this.content.addChild(body);

    this.refreshDots();
    this.refreshButton();
  }

  /** Largest body font (down to a floor) whose wrapped height fits `maxH`. */
  private fitBody(str: string, wrapWidth: number, maxH: number): Text {
    let font = BODY_FONT_MAX;
    let body = this.makeBody(str, font, wrapWidth);
    while (body.height > maxH && font > BODY_FONT_MIN) {
      body.destroy();
      font -= 2;
      body = this.makeBody(str, font, wrapWidth);
    }
    return body;
  }

  private makeBody(str: string, font: number, wrapWidth: number): Text {
    return makeText(str, 'small', {
      fontSize: font,
      fill: hex(COLORS.textBright),
      align: 'center',
      wordWrap: true,
      wordWrapWidth: wrapWidth,
      lineHeight: Math.round(font * BODY_LINE_RATIO),
    });
  }

  /** Place either a fitted sprite or a scripted demo into the illustration holder. */
  private buildIllustration(lesson: TutorialLesson): void {
    const art = lesson.art;
    if (art.kind === 'demo') {
      const factory = TUTORIAL_DEMOS[art.demoId];
      if (factory) {
        this.currentDemo = factory(ILLU * 0.92);
        this.illu.addChild(this.currentDemo.view);
        return;
      }
      // Defensive fallback: a thematic sprite if the demo id is unknown.
      if (art.fallbackKey) {
        this.illu.addChild(this.makeSprite(art.fallbackKey));
      }
      return;
    }
    this.illu.addChild(this.makeSprite(art.assetKey));
  }

  private makeSprite(key: string): Sprite {
    const s = new Sprite(this.assets.get(key));
    fitSprite(s, ILLU, ILLU);
    return s;
  }

  /**
   * Stand the advisor (KloDouglas) tall on the card's RIGHT side, drawn on top of
   * the panel: his head sits at the illustration row, his feet just above the button,
   * and his body straddles the right edge (torso on the panel, the rest hanging off).
   * Only the body copy yields width to him (its right edge stops at `textRightX`).
   * Returns the px the body should reserve. Hidden on narrow/short cards or with no art.
   */
  private buildAdvisor(): number {
    const KEY = 'advisor_klodouglas';
    if (this.cardW < 640 || this.cardH < 820 || !this.assets.has(KEY)) return 0;

    const tex = this.assets.get(KEY);
    // Vertical span: head crown ~ at the icon row, feet a touch above the button.
    const headY = this.illuBaseY - ILLU * 0.04;
    const feetY = this.cardH / 2 - 135;
    const targetH = Math.max(200, feetY - headY);
    const scale = tex.height > 0 ? targetH / tex.height : 1;
    const w = tex.width * scale;

    // His body starts ~13% right of center; his right side hangs off the edge.
    const gap = 22;
    const textRightX = this.cardW * 0.03;

    const holder = new Container();
    holder.eventMode = 'none';

    // Soft brass glow behind the torso so the figure reads over the panel/board.
    const glow = glowCircle(targetH * 0.3, COLORS.brass, 0.26);
    glow.position.set(textRightX + w * 0.32, feetY - targetH * 0.5);
    holder.addChild(glow);

    const sprite = new Sprite(tex);
    sprite.anchor.set(0, 1); // bottom-left → his left edge anchors at textRightX
    sprite.scale.set(scale);
    sprite.position.set(textRightX, feetY);
    holder.addChild(sprite);

    this.advisorLayer.addChild(holder);
    // Body right edge = textRightX - gap. body uses (maxTitleW - reserve), x = -reserve/2,
    // so its right edge is maxTitleW/2 - reserve ⇒ solve for reserve:
    return this.cardW / 2 - PAD - (textRightX - gap);
  }

  /** Page indicator dots (hidden for single-lesson levels). */
  private refreshDots(): void {
    this.dots.clear();
    const n = this.lessons.length;
    if (n < 2) return;
    const gap = 30;
    const total = (n - 1) * gap;
    const y = this.cardH / 2 - 150;
    for (let i = 0; i < n; i++) {
      const x = -total / 2 + i * gap;
      const on = i === this.pageIndex;
      this.dots.circle(x, y, on ? 8 : 6).fill({
        color: on ? COLORS.gold : COLORS.metalLight,
        alpha: on ? 1 : 0.7,
      });
    }
  }

  private refreshButton(): void {
    const last = this.pageIndex >= this.lessons.length - 1;
    this.nextBtn.setLabel(last ? t('common.gotIt') : t('common.next'));
  }

  private advance(): void {
    this.audio.playSfx('sfx_click');
    if (this.pageIndex >= this.lessons.length - 1) {
      this.onDone();
      return;
    }
    this.renderPage(this.pageIndex + 1);
  }

  /** Idle life: the illustration gently floats and its glow pulses; demos animate. */
  tick(dt: number): void {
    this.idleClock += dt;
    this.illu.position.y = this.illuBaseY + Math.sin(this.idleClock * 1.6) * 6;
    this.illuGlow.alpha = 0.75 + 0.25 * Math.sin(this.idleClock * 2.2);
    this.currentDemo?.tick(dt);
  }

  /** Cover the full canvas with the scrim and center the card on the safe area. */
  layout(info: LayoutInfo): void {
    const { full, safe } = info;
    this.scrim.clear();
    this.scrim.rect(full.x, full.y, full.width, full.height).fill({ color: COLORS.black, alpha: 0.66 });
    this.card.position.set(safe.x + safe.width / 2, safe.y + safe.height / 2);

    // Size the card to the safe area (capped), and re-render only when it changes.
    const w = Math.min(MAX_CARD_W, safe.width - MARGIN_X * 2);
    const h = Math.min(MAX_CARD_H, safe.height - MARGIN_Y * 2);
    if (w !== this.cardW || h !== this.cardH) {
      this.cardW = w;
      this.cardH = h;
      this.renderPage(this.pageIndex);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.intro?.stop();
    this.intro = null;
    this.currentDemo?.destroy();
    this.currentDemo = null;
    super.destroy(options);
  }
}
