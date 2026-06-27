import { Container, Graphics, Sprite } from 'pixi.js';
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
import { Button } from '../ui/Button';
import { CloseButton } from '../ui/CloseButton';
import { DialogueOverlay } from '../ui/DialogueOverlay';
import { makeText, glowCircle } from '../ui/helpers';
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
  private skipBtn!: CloseButton;

  private def: CutsceneDef | null = null;
  private nextOverride: { route: RouteId; params?: SceneParams } | null = null;
  private shotIndex = -1;
  private curKf: CameraKeyframe = { scale: 1, fx: 0.5, fy: 0.5 };
  private dialogue: DialogueOverlay | null = null;
  private endCard: Container | null = null;
  private navigated = false;
  private lastInfo: LayoutInfo | null = null;
  private tweens: TweenHandle[] = [];
  /** Tweens owned by the current shot (camera glide + auto-advance hold). */
  private shotCam: TweenHandle | null = null;
  private shotHold: TweenHandle | null = null;

  private track(h: TweenHandle): TweenHandle {
    this.tweens.push(h);
    return h;
  }

  override onEnter(params?: SceneParams): void {
    const id = typeof params?.id === 'string' ? params.id : 'intro';
    this.def = getCutscene(id) ?? null;
    const next = (params?.next as { route: RouteId; params?: SceneParams } | undefined) ?? null;
    this.nextOverride = next;
    this.services.audio.stopMusic();
    Telemetry.track('cutscene_view', { id });

    this.image.anchor.set(0.5);
    this.cam.addChild(this.image);
    this.addChild(this.bg, this.cam, this.overlayLayer);

    // Cutscene-level skip: jumps straight to the end (and `next`).
    this.skipBtn = new CloseButton(60, () => this.skipAll());
    this.overlayLayer.addChild(this.skipBtn);

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
  }

  // --- shot sequencing -----------------------------------------------------

  private playShot(i: number): void {
    this.stopShotTweens();
    const shot = this.def?.shots[i];
    if (!shot) {
      this.endCutscene();
      return;
    }
    this.shotIndex = i;

    this.image.texture = this.services.assets.get(shot.image);
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
    });
    this.overlayLayer.addChildAt(this.dialogue, 0); // below the skip button
    if (this.lastInfo) this.dialogue.layout(this.lastInfo);
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

  private skipAll(): void {
    this.services.audio.playSfx('sfx_click');
    this.disposeDialogue();
    this.tweens.forEach((tw) => tw.stop());
    this.tweens = [];
    this.endCutscene();
  }

  // --- camera --------------------------------------------------------------

  /** Place + scale the painting so its focus point sits at screen center. */
  private applyCamera(): void {
    const info = this.lastInfo;
    if (!info) return;
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
    this.layoutEndCard();
    card.alpha = 0;
    this.track(tween({ duration: 0.5, onUpdate: (e) => { if (!card.destroyed) card.alpha = e; } }));
    // Keep references to position children on resize.
    (card as Container & { _glow?: Graphics; _title?: Container; _btn?: Container })._glow = glow;
    (card as Container & { _title?: Container })._title = title;
    (card as Container & { _btn?: Container })._btn = btn;
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
    this.layoutEndCard();
    const { safe } = info;
    this.skipBtn.position.set(safe.x + safe.width - 52, safe.y + 52);
  }

  override update(dt: number): void {
    this.dialogue?.tick(dt);
  }
}
