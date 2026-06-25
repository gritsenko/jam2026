import { Container, Graphics, Sprite } from 'pixi.js';
import { COLORS, ELEMENTS, hex } from '../theme';
import type { AssetLoader } from '../core/AssetLoader';
import type { AudioBus } from '../core/AudioBus';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { tween, Easings, type TweenHandle } from '../core/tween';
import type { TutorialLesson } from '../config/tutorial';
import { Button } from './Button';
import { drawPanel, makeText, fitSprite, glowCircle } from './helpers';
import { TUTORIAL_DEMOS, type TutorialDemo } from './TutorialDemos';

const CARD_W = 820;
const CARD_H = 1000;
const PAD = 56;
const ILLU = 340;

/**
 * Modal onboarding carousel (docs/done/tutorial-modals.md §5). A dimmed scrim
 * behind a centered brass panel that walks the player through one level's pending
 * lessons: title, illustration (a ready sprite or a scripted in-engine demo) and
 * a short body, one page at a time. The scrim deliberately does NOT close on tap
 * — the player advances with the button so a lesson can't be skipped by accident.
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

    drawPanel(this.cardBg, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, {
      radius: 28,
      fill: COLORS.metalMid,
      edge: COLORS.brass,
      edgeWidth: 5,
      bevel: true,
      rivets: true,
    });
    // Center origin (pivot at panel middle) so the intro can scale around center
    // and layout only needs the safe-area center point.
    this.card.eventMode = 'static';
    this.card.addChild(this.cardBg, this.content, this.dots);

    this.illu.addChild(this.illuGlow);

    this.nextBtn = new Button({
      label: 'NEXT',
      width: 320,
      height: 92,
      primary: true,
      onClick: () => this.advance(),
    });
    this.nextBtn.position.set(0, CARD_H / 2 - 92);
    this.card.addChild(this.nextBtn);

    this.addChild(this.scrim, this.card);

    this.showPage(0);

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

  /** Build the content for the current lesson page (title + illustration + body). */
  private showPage(index: number): void {
    this.pageIndex = index;
    const lesson = this.lessons[index];
    if (!lesson) return;

    // Tear down the previous page's content + demo.
    this.currentDemo?.destroy();
    this.currentDemo = null;
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.illu = new Container();
    this.illuGlow = new Graphics();
    this.illu.addChild(this.illuGlow);

    const accent = lesson.accent ? ELEMENTS[lesson.accent] : null;

    // Title — tinted by the lesson's element accent when present.
    const title = makeText(lesson.title.toUpperCase(), 'title', {
      fontSize: 50,
      fill: accent ? hex(accent.glow) : hex(COLORS.textBright),
    });
    title.anchor.set(0.5, 0);
    title.position.set(0, -CARD_H / 2 + 44);
    this.content.addChild(title);

    // Illustration: a soft glow behind a ready sprite, or a scripted demo.
    const glowColor = accent ? accent.glow : COLORS.brass;
    this.illuGlow.addChild(glowCircle(ILLU * 0.5, glowColor, 0.5));
    this.buildIllustration(lesson);
    this.illuBaseY = -CARD_H / 2 + 100 + ILLU / 2;
    this.illu.position.set(0, this.illuBaseY);
    this.content.addChild(this.illu);

    // Body — paragraphs joined, word-wrapped to the panel width.
    const body = makeText(lesson.body.join('\n\n'), 'small', {
      fontSize: 28,
      fill: hex(COLORS.textBright),
      align: 'center',
      wordWrap: true,
      wordWrapWidth: CARD_W - PAD * 2,
      lineHeight: 38,
    });
    body.anchor.set(0.5, 0);
    body.position.set(0, this.illuBaseY + ILLU / 2 + 36);
    this.content.addChild(body);

    this.refreshDots();
    this.refreshButton();
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

  /** Page indicator dots (hidden for single-lesson levels). */
  private refreshDots(): void {
    this.dots.clear();
    const n = this.lessons.length;
    if (n < 2) return;
    const gap = 30;
    const total = (n - 1) * gap;
    const y = CARD_H / 2 - 176;
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
    this.nextBtn.setLabel(last ? 'ПОНЯТНО' : 'NEXT');
  }

  private advance(): void {
    this.audio.playSfx('sfx_click');
    if (this.pageIndex >= this.lessons.length - 1) {
      this.onDone();
      return;
    }
    this.showPage(this.pageIndex + 1);
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
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.intro?.stop();
    this.intro = null;
    this.currentDemo?.destroy();
    this.currentDemo = null;
    super.destroy(options);
  }
}
