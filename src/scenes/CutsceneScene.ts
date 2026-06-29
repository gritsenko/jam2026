import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import type { LayoutInfo } from '../core/ResponsiveLayout';
import { Scene, type RouteId, type SceneParams } from '../core/scene';
import { tween, Easings, type TweenHandle, lerp } from '../core/tween';
import { t } from '../core/i18n';
import {
  getCutscene,
  cameraKeyframes,
  type CutsceneDef,
  type CutsceneShot,
  type CameraKeyframe,
  type EasingName,
} from '../config/cutscenes';
import { getDialogue } from '../config/dialogue';
import { CREDITS } from '../config/credits';
import { Button } from '../ui/Button';
import { SkipButton } from '../ui/SkipButton';
import { DialogueOverlay, dialogueSkipPos } from '../ui/DialogueOverlay';
import { makeText, glowCircle } from '../ui/helpers';
import { hideConfigPicker } from '../ui/adminTools';
import * as progress from '../game/progress';
import * as Telemetry from '../telemetry/Telemetry';

const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: Easings.linear,
  outCubic: Easings.outCubic,
  inOutCubic: Easings.inOutCubic,
  outBack: Easings.outBack,
  inOutSine: Easings.inOutSine,
};

/**
 * Cutscene player (config/cutscenes.ts): shows a full-bleed painting with a slow
 * camera move and, optionally, a {@link DialogueOverlay} on top. Shots play in
 * order; a shot with a dialogue waits for the player to finish it, otherwise it
 * auto-advances after the camera move (+ hold). When the cutscene ends it
 * navigates to the def's `next` (a `next` passed in params overrides it), showing
 * a "THE END" card first when `endCard` is set.
 *
 * Route params: `{ id: string; next?: { route; params } }`.
 */
export class CutsceneScene extends Scene {
  private readonly bg = new Graphics(); // black backdrop behind the painting
  private readonly cam = new Container(); // holds the image; we scale/move it
  private readonly image = new Sprite();
  private readonly overlayLayer = new Container(); // dialogue + UI above the image
  private skipBtn!: SkipButton;

  private def: CutsceneDef | null = null;
  private nextOverride: { route: RouteId; params?: SceneParams } | null = null;
  private shotIndex = -1;
  private curKf: CameraKeyframe = { scale: 1, fx: 0.5, fy: 0.5 };
  private dialogue: DialogueOverlay | null = null;
  /** Intro Easter egg: the Lead-admin's "are you sure you want to leave the call?" gag. */
  private skipPrompt: DialogueOverlay | null = null;
  private skipConfirmShown = false;
  private endCard: Container | null = null;
  private navigated = false;
  private lastInfo: LayoutInfo | null = null;
  private tweens: TweenHandle[] = [];
  /** Tweens owned by the current shot (camera glide + auto-advance hold). */
  private shotCam: TweenHandle | null = null;
  private shotHold: TweenHandle | null = null;

  /** Credits roll (kind: 'credits' shots): scrolling text over a dark scrim. */
  private creditsRoll: Container | null = null;
  private creditsScrim: Graphics | null = null;
  private creditsHeight = 0;
  private creditsStarted = false;
  private creditsDur: number | null = null;

  private track(h: TweenHandle): TweenHandle {
    this.tweens.push(h);
    return h;
  }

  override onEnter(params?: SceneParams): void {
    hideConfigPicker(); // admin config switcher is world-map only
    const id = typeof params?.id === 'string' ? params.id : 'intro';
    this.def = getCutscene(id) ?? null;
    const next = (params?.next as { route: RouteId; params?: SceneParams } | undefined) ?? null;
    this.nextOverride = next;
    // Score the cutscene with its theme music (e.g. the campaign theme over the
    // intro + finale); otherwise stop music for the duration. A `musicAtMaster`
    // cutscene routes that theme to the overall volume, bypassing the music slider.
    const music = this.def?.music;
    if (music) void this.services.audio.playMusic(music, this.def?.musicAtMaster ? { bus: 'master' } : undefined);
    else this.services.audio.stopMusic();
    Telemetry.track('cutscene_view', { id });

    this.image.anchor.set(0.5);
    this.cam.addChild(this.image);
    this.addChild(this.bg, this.cam, this.overlayLayer);

    // Cutscene-level skip: jumps straight to the end (and `next`). On the intro it
    // first triggers the Lead-admin "leave the call?" Easter egg (see onSkip), and
    // it reads "Покинуть встречу" (it's framed as a work call) instead of "SKIP".
    const isIntro = this.def?.id === 'intro';
    // The finale is the payoff (credits + post-credits sting) — no skip; players
    // should watch it through, so the button stays hidden for the whole cutscene.
    const isFinale = this.def?.id === 'finale';
    this.skipBtn = new SkipButton(() => this.onSkip(), isIntro ? { label: t('cutscene.leaveMeeting') } : {});
    this.overlayLayer.addChild(this.skipBtn);
    // On the intro, hold the skip back until the second phrase shows, so first-time
    // players read at least the opening exchange before they can bail (see onDialogueLineShown).
    if (isIntro || isFinale) this.skipBtn.visible = false;

    // First time through, this beat is now "seen" (so it won't auto-play again);
    // Admin mode replays it regardless (see progress.shouldPlayStory).
    progress.markStorySeen(id);

    if (!this.def || this.def.shots.length === 0) {
      this.navigateNext();
      return;
    }
    this.playShot(0);
  }

  override onExit(): void {
    this.tweens.forEach((tw) => tw.stop());
    this.tweens = [];
    this.skipPrompt?.destroy({ children: true });
    this.skipPrompt = null;
    this.disposeCredits();
  }

  // --- shot sequencing -----------------------------------------------------

  private playShot(i: number): void {
    this.stopShotTweens();
    this.disposeCredits();
    const shot = this.def?.shots[i];
    if (!shot) {
      this.endCutscene();
      return;
    }
    this.shotIndex = i;

    // Credits roll — no painting; scroll config/credits.ts over a dark scrim.
    if (shot.kind === 'credits') {
      this.image.visible = false;
      this.playCredits(shot);
      return;
    }

    // A shot may have no image (a dialogue beat over a plain dark backdrop).
    this.image.visible = !!shot.image;
    if (shot.image) this.image.texture = this.services.assets.get(shot.image);
    const { from, to } = cameraKeyframes(shot.camera, shot.focus);
    this.curKf = { ...from };
    this.applyCamera();

    const dur = shot.durationSec ?? 18;
    const ease = EASINGS[shot.easing ?? 'inOutSine'];
    this.shotCam = this.track(
      tween({
        duration: dur,
        easing: ease,
        onUpdate: (e) => {
          this.curKf = {
            scale: lerp(from.scale, to.scale, e),
            fx: lerp(from.fx, to.fx, e),
            fy: lerp(from.fy, to.fy, e),
          };
          this.applyCamera();
        },
        onComplete: () => {
          // With no dialogue gating the shot, hold then advance automatically.
          if (!shot.dialogue) {
            this.shotHold = this.track(
              tween({ duration: shot.holdSec ?? 1.2, onUpdate: () => {}, onComplete: () => this.advanceShot() }),
            );
          }
        },
      }),
    );

    this.startDialogue(shot);
  }

  private stopShotTweens(): void {
    this.shotCam?.stop();
    this.shotHold?.stop();
    this.shotCam = null;
    this.shotHold = null;
  }

  private startDialogue(shot: CutsceneShot): void {
    this.disposeDialogue();
    if (!shot.dialogue) return;
    const dlg = getDialogue(shot.dialogue);
    if (!dlg) return;
    // Light dim — the painting is the star; the dialogue rides the bottom. The
    // cutscene already owns the skip button, so the overlay hides its own.
    this.dialogue = new DialogueOverlay(dlg, this.services.assets, this.services.audio, () => this.advanceShot(), {
      dimAlpha: 0.22,
      showSkip: false,
      onLineShown: (index) => this.onDialogueLineShown(index),
    });
    this.overlayLayer.addChildAt(this.dialogue, 0); // below the skip button
    if (this.lastInfo) this.dialogue.layout(this.lastInfo);
  }

  /**
   * Intro only: the cutscene skip is hidden until the dialogue reaches its second
   * phrase (index 1), then fades in. The intro's opening lines all live in the
   * first shot's script, so this fires there; once shown it stays visible.
   */
  private onDialogueLineShown(index: number): void {
    if (this.def?.id !== 'intro' || this.skipBtn.visible || index < 1) return;
    this.skipBtn.visible = true;
    this.skipBtn.alpha = 0;
    this.track(
      tween({
        duration: 0.3,
        onUpdate: (e) => {
          if (!this.skipBtn.destroyed) this.skipBtn.alpha = e;
        },
      }),
    );
  }

  private advanceShot(): void {
    this.stopShotTweens();
    this.disposeDialogue();
    this.playShot(this.shotIndex + 1);
  }

  private disposeDialogue(): void {
    this.dialogue?.destroy({ children: true });
    this.dialogue = null;
  }

  private endCutscene(): void {
    if (this.def?.endCard) {
      this.showEndCard();
      return;
    }
    this.navigateNext();
  }

  /**
   * Skip pressed. On the intro the first press is intercepted by the Lead-admin
   * Easter egg (he guilt-trips you about leaving the "call" + AdsAdvisor analytics);
   * tapping through it then really skips. Every other cutscene skips immediately.
   */
  private onSkip(): void {
    this.services.audio.playSfx('sfx_hut');
    if (this.def?.id === 'intro' && !this.skipConfirmShown) {
      this.skipConfirmShown = true;
      this.showSkipPrompt();
      return;
    }
    this.skipAll();
  }

  private showSkipPrompt(): void {
    const dlg = getDialogue('intro_skip_confirm');
    if (!dlg) {
      this.skipAll();
      return;
    }
    // Freeze the shot (camera + its dialogue) and use the painting as a backdrop;
    // hide the skip button so the gag must be tapped through, then really skip.
    this.stopShotTweens();
    this.disposeDialogue();
    this.skipBtn.visible = false;
    this.skipPrompt = new DialogueOverlay(
      dlg,
      this.services.assets,
      this.services.audio,
      () => this.finishSkipPrompt(),
      { dimAlpha: 0.6, showSkip: false },
    );
    this.overlayLayer.addChild(this.skipPrompt);
    if (this.lastInfo) this.skipPrompt.layout(this.lastInfo);
  }

  private finishSkipPrompt(): void {
    this.skipPrompt?.destroy({ children: true });
    this.skipPrompt = null;
    this.skipAll();
  }

  private skipAll(): void {
    this.disposeDialogue();
    this.disposeCredits();
    this.tweens.forEach((tw) => tw.stop());
    this.tweens = [];
    this.endCutscene();
  }

  // --- camera --------------------------------------------------------------

  /** Place + scale the painting so its focus point sits at screen center. */
  private applyCamera(): void {
    const info = this.lastInfo;
    if (!info || !this.image.visible) return;
    const f = info.full;
    const tex = this.image.texture;
    const tw = tex.width || 1;
    const th = tex.height || 1;
    const cover = Math.max(f.width / tw, f.height / th);
    const eff = cover * this.curKf.scale;
    this.image.scale.set(eff);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    this.image.position.set(
      cx - (this.curKf.fx - 0.5) * tw * eff,
      cy - (this.curKf.fy - 0.5) * th * eff,
    );
  }

  // --- credits roll --------------------------------------------------------

  /** Build + start the scrolling credits for a `kind: 'credits'` shot. */
  private playCredits(shot: CutsceneShot): void {
    this.disposeCredits();
    this.creditsDur = shot.durationSec ?? null;
    this.creditsStarted = false;

    const scrim = new Graphics();
    scrim.eventMode = 'static';
    scrim.on('pointertap', () => this.advanceShot()); // tap skips the roll
    this.creditsScrim = scrim;

    const roll = new Container();
    this.creditsRoll = roll;
    this.creditsHeight = this.buildCredits(roll);

    // Sits above the painting but below the skip button (added first in onEnter).
    this.overlayLayer.addChildAt(scrim, 0);
    this.overlayLayer.addChildAt(roll, 1);

    if (this.lastInfo) this.layoutCredits();
  }

  /** Lay out the credit lines into `roll` (centered, stacked); returns total height. */
  private buildCredits(roll: Container): number {
    const wrap = 900; // design-space wrap width (DESIGN is 1080 wide)
    let y = 0;
    const add = (text: Text, gapAfter: number): void => {
      text.anchor.set(0.5, 0);
      text.x = 0;
      text.y = y;
      roll.addChild(text);
      y += text.height + gapAfter;
    };
    for (const line of CREDITS) {
      if (line.kind === 'gap') {
        y += line.size ?? 44;
      } else if (line.kind === 'title') {
        add(
          makeText(line.text, 'display', {
            fontSize: 84,
            fill: hex(COLORS.gold),
            align: 'center',
            wordWrap: true,
            wordWrapWidth: wrap,
            stroke: { color: hex(COLORS.black), width: 6, alpha: 0.85 },
          }),
          18,
        );
      } else if (line.kind === 'header') {
        add(
          makeText(line.text, 'title', {
            fontSize: 46,
            fill: hex(COLORS.brass),
            align: 'center',
            wordWrap: true,
            wordWrapWidth: wrap,
          }),
          10,
        );
      } else if (line.kind === 'name') {
        add(
          makeText(line.text, 'label', {
            fontSize: 40,
            fill: hex(COLORS.textBright),
            align: 'center',
            wordWrap: true,
            wordWrapWidth: wrap,
          }),
          6,
        );
      } else {
        add(
          makeText(line.text, 'small', {
            fontSize: 32,
            fill: hex(COLORS.textDim),
            fontStyle: 'italic',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: wrap,
          }),
          6,
        );
      }
    }
    return y;
  }

  /** Position the dark scrim + recenter the roll; start the scroll once geometry exists. */
  private layoutCredits(): void {
    const roll = this.creditsRoll;
    const scrim = this.creditsScrim;
    const info = this.lastInfo;
    if (!roll || !scrim || !info) return;
    const { full, safe } = info;
    scrim.clear();
    scrim.rect(full.x, full.y, full.width, full.height).fill({ color: COLORS.black, alpha: 0.92 });
    roll.x = safe.x + safe.width / 2;
    if (this.creditsStarted) return;
    this.creditsStarted = true;
    const startY = full.y + full.height + 40;
    const endY = full.y - this.creditsHeight - 40;
    const dist = startY - endY;
    const speed = 130; // design px / sec
    const dur = this.creditsDur ?? Math.max(12, dist / speed);
    roll.y = startY;
    this.shotCam = this.track(
      tween({
        duration: dur,
        easing: Easings.linear,
        onUpdate: (e) => {
          if (!roll.destroyed) roll.y = lerp(startY, endY, e);
        },
        onComplete: () => this.advanceShot(),
      }),
    );
  }

  private disposeCredits(): void {
    this.creditsRoll?.destroy({ children: true });
    this.creditsRoll = null;
    this.creditsScrim?.destroy();
    this.creditsScrim = null;
    this.creditsStarted = false;
  }

  // --- end card ------------------------------------------------------------

  private showEndCard(): void {
    if (this.endCard) return;
    const card = new Container();
    const scrim = new Graphics();
    card.addChild(scrim);

    const glow = glowCircle(280, COLORS.gold, 0.3);
    card.addChild(glow);
    const title = makeText(t('cutscene.theEnd'), 'display', {
      fontSize: 110,
      fill: hex(COLORS.gold),
      stroke: { color: hex(COLORS.black), width: 8, alpha: 0.9 },
    });
    title.anchor.set(0.5);
    card.addChild(title);

    const btn = new Button({
      label: t('cutscene.continue'),
      primary: true,
      width: 360,
      height: 96,
      onClick: () => this.navigateNext(),
    });
    card.addChild(btn);

    this.endCard = card;
    this.overlayLayer.addChild(card);
    // Keep references to position children — set BEFORE the first layoutEndCard(),
    // which positions glow/title/btn through these refs (and reuses them on resize).
    (card as Container & { _glow?: Graphics; _title?: Container; _btn?: Container })._glow = glow;
    (card as Container & { _title?: Container })._title = title;
    (card as Container & { _btn?: Container })._btn = btn;
    this.layoutEndCard();
    card.alpha = 0;
    this.track(tween({ duration: 0.5, onUpdate: (e) => { if (!card.destroyed) card.alpha = e; } }));
  }

  private layoutEndCard(): void {
    const card = this.endCard;
    const info = this.lastInfo;
    if (!card || !info) return;
    const { full, safe } = info;
    const c = card as Container & { _glow?: Container; _title?: Container; _btn?: Container };
    const scrim = card.children[0] as Graphics;
    scrim.clear();
    scrim.rect(full.x, full.y, full.width, full.height).fill({ color: COLORS.black, alpha: 0.72 });
    const cx = safe.x + safe.width / 2;
    const cy = safe.y + safe.height * 0.45;
    c._glow?.position.set(cx, cy);
    c._title?.position.set(cx, cy);
    c._btn?.position.set(cx, cy + safe.height * 0.2);
  }

  private navigateNext(): void {
    if (this.navigated) return;
    this.navigated = true;
    const dest = this.nextOverride ?? this.def?.next ?? { route: 'menu' as RouteId };
    this.services.navigate(dest.route, dest.params);
  }

  // --- lifecycle -----------------------------------------------------------

  override layout(info: LayoutInfo): void {
    this.lastInfo = info;
    const f = info.full;
    this.bg.clear();
    this.bg.rect(f.x, f.y, f.width, f.height).fill({ color: COLORS.black });
    this.applyCamera();
    this.dialogue?.layout(info);
    this.skipPrompt?.layout(info);
    this.layoutCredits();
    this.layoutEndCard();
    // Skip sits right next to the dialogue (its top-right edge), matching the
    // standalone DialogueOverlay; on a wordless camera shot it floats there too.
    const p = dialogueSkipPos(info, this.skipBtn.btnW, this.skipBtn.btnH);
    this.skipBtn.position.set(p.x, p.y);
  }

  override update(dt: number): void {
    this.dialogue?.tick(dt);
    this.skipPrompt?.tick(dt);
  }
}
