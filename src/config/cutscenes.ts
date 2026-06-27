import type { RouteId, SceneParams } from '../core/scene';

/**
 * Cutscene scripts (the "where it plays"): a full-screen painting with a slow
 * camera move, optionally with a visual-novel dialogue running over it. Rendered
 * by {@link import('../scenes/CutsceneScene').CutsceneScene}; dialogue ids point
 * into config/dialogue.ts; characters into config/storyCharacters.ts.
 *
 * A cutscene is a list of shots played in order. Each shot picks an image and a
 * camera move (the brief's "camera function — zoom-in, or descend from the top to
 * a focus point"). When a shot has a `dialogue`, the shot holds until the player
 * finishes that dialogue; otherwise it auto-advances after the camera move
 * (+ optional `holdSec`). When the whole cutscene ends, the scene navigates to
 * `next` (or shows a "THE END" card first when `endCard` is set).
 */

/** Named camera moves. The scene resolves these to start/end keyframes. */
export type CameraMove =
  | 'static' //   no movement
  | 'zoomIn' //   slow push toward the focus point
  | 'zoomOut' //  slow pull back from the focus point
  | 'descend' //  start high above the focus, glide down onto it
  | 'panUp'; //   start low, glide up onto the focus

/** Easing names mirrored from core/tween.ts (kept decoupled from the config). */
export type EasingName = 'linear' | 'outCubic' | 'inOutCubic' | 'outBack' | 'inOutSine';

export interface CutsceneShot {
  /** Background asset key shown full-bleed (cover-fit). */
  readonly image: string;
  /** Camera move applied over the shot. */
  readonly camera: CameraMove;
  /** Focus point the move centers on, as a fraction of the image (default center). */
  readonly focus?: { readonly x: number; readonly y: number };
  /** Seconds the camera move takes (it then holds). Default 18. */
  readonly durationSec?: number;
  /** Easing for the camera move (default inOutSine — gentle ease-in-out). */
  readonly easing?: EasingName;
  /** Dialogue script id played over this shot; the shot waits for it to finish. */
  readonly dialogue?: string;
  /** With no dialogue: seconds to hold after the camera move before advancing. */
  readonly holdSec?: number;
}

export interface CutsceneDef {
  readonly id: string;
  readonly shots: readonly CutsceneShot[];
  /** Where to go when the cutscene ends. Omit to just fade out (caller decides). */
  readonly next?: { readonly route: RouteId; readonly params?: SceneParams };
  /** Show a centered "THE END" card with a Continue button before {@link next}. */
  readonly endCard?: boolean;
}

export const CUTSCENES: Record<string, CutsceneDef> = {
  // 1) Campaign intro — slow push-in on the Buhanka poster while the matriarch
  //    briefs the heroes. Plays after the menu's START, then opens the world map.
  intro: {
    id: 'intro',
    shots: [
      { image: 'cutscene_intro', camera: 'zoomIn', focus: { x: 0.5, y: 0.5 }, durationSec: 26, dialogue: 'intro' },
    ],
    next: { route: 'worldmap' },
  },

  // 2) Finale — glide down over the whole world while the last Senior laces up the
  //    red sneakers, then a "THE END" card back to the menu.
  finale: {
    id: 'finale',
    shots: [
      { image: 'bg_worldmap', camera: 'descend', focus: { x: 0.5, y: 0.55 }, durationSec: 26, dialogue: 'finale' },
    ],
    next: { route: 'menu' },
    endCard: true,
  },
};

export function getCutscene(id: string): CutsceneDef | undefined {
  return CUTSCENES[id];
}

/** Start/end camera keyframes (scale + focus fraction) for a named move. */
export interface CameraKeyframe {
  /** Zoom factor over the cover-fit baseline (1 = image just covers the screen). */
  readonly scale: number;
  /** Focus point kept at screen center, as a fraction of the image. */
  readonly fx: number;
  readonly fy: number;
}

/** Resolve a {@link CameraMove} to its from/to keyframes for a focus point. */
export function cameraKeyframes(
  move: CameraMove,
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { from: CameraKeyframe; to: CameraKeyframe } {
  const fx = focus.x;
  const fy = focus.y;
  switch (move) {
    case 'zoomIn':
      return { from: { scale: 1.0, fx, fy }, to: { scale: 1.2, fx, fy } };
    case 'zoomOut':
      return { from: { scale: 1.22, fx, fy }, to: { scale: 1.0, fx, fy } };
    case 'descend':
      return { from: { scale: 1.16, fx, fy: 0.12 }, to: { scale: 1.06, fx, fy } };
    case 'panUp':
      return { from: { scale: 1.12, fx, fy: 0.9 }, to: { scale: 1.12, fx, fy } };
    case 'static':
    default:
      return { from: { scale: 1.04, fx, fy }, to: { scale: 1.04, fx, fy } };
  }
}
