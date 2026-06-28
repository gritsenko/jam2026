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
  /**
   * Background asset key shown full-bleed (cover-fit). Omit for a shot with no
   * painting — a `credits` roll, or a dialogue beat over a plain dark backdrop.
   */
  readonly image?: string;
  /** Shot kind. `'credits'` rolls config/credits.ts instead of a painting. */
  readonly kind?: 'image' | 'credits';
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
  /**
   * Music key to play (looped, crossfaded) while the cutscene runs. Omit to stop
   * music for the duration. Registered in config/audioManifest.ts.
   */
  readonly music?: string;
  /**
   * Route the music to the master output instead of the music-volume bus, so it
   * plays at the overall (master / mute) volume and ignores the in-game "music"
   * slider. Use for cinematic theme moments (the intro / finale share
   * `music_theme`) that are scored sequences, not background game music.
   * Default false.
   */
  readonly musicAtMaster?: boolean;
}

export const CUTSCENES: Record<string, CutsceneDef> = {
  // 1) Campaign intro — first an establishing beat on the My.Games office (so the
  //    matriarch's portrait doesn't cover the sign), then she briefs the heroes,
  //    then the van is shown fueled and the heroes roll out. Theme music plays.
  intro: {
    id: 'intro',
    music: 'music_theme',
    musicAtMaster: true, // cinematic theme — plays at overall volume, not the music slider
    shots: [
      // Establishing: glide down onto the My.Games marquee, no dialogue.
      { image: 'cutscene_intro', camera: 'descend', focus: { x: 0.5, y: 0.56 }, durationSec: 6, holdSec: 1.4 },
      // The matriarch briefs the heroes (her portrait now slides in over the office).
      { image: 'cutscene_intro', camera: 'zoomIn', focus: { x: 0.5, y: 0.42 }, durationSec: 24, dialogue: 'intro' },
      // The Buhanka 3000, fueled and ready.
      { image: 'cutscene_intro2', camera: 'zoomIn', focus: { x: 0.5, y: 0.5 }, durationSec: 12, dialogue: 'intro_fueled' },
      // The heroes aboard, rolling out.
      { image: 'cutscene_in_car', camera: 'zoomIn', focus: { x: 0.5, y: 0.45 }, durationSec: 12, dialogue: 'intro_go' },
    ],
    next: { route: 'worldmap' },
  },

  // 2) Finale — the heroes drive home with the rescued Senior, a wide beauty shot,
  //    the credits roll, then a post-credits sting: the silent passenger was a spy
  //    for rival studio Pixonic, who vibecodes a walking robot from the stolen
  //    blueprints. Ends on a "THE END" card back to the menu. Theme music plays.
  finale: {
    id: 'finale',
    music: 'music_theme',
    musicAtMaster: true, // same cinematic theme as the intro — overall volume, not the music slider
    shots: [
      // Epilogue conversation, driving home with the Senior aboard.
      { image: 'cutscene_final1', camera: 'zoomIn', focus: { x: 0.5, y: 0.5 }, durationSec: 24, dialogue: 'finale' },
      // Wide beauty shot — the van crossing the desert toward the rebuilt base.
      { image: 'cutscene_final2', camera: 'zoomOut', focus: { x: 0.5, y: 0.5 }, durationSec: 9, holdSec: 1.5 },
      // Credits roll (config/credits.ts) over a dark backdrop.
      { kind: 'credits', camera: 'static' },
      // Post-credits sting — the spy debriefs his employer (no painting; dark room).
      { camera: 'static', dialogue: 'finale_secret' },
      // The battle-truck Pixonic built from the stolen blueprints.
      { image: 'cutscene_final3', camera: 'zoomIn', focus: { x: 0.5, y: 0.5 }, durationSec: 10, dialogue: 'finale_robot1' },
      // …it sprouts legs and walks. The spy gets the last (wordless) beat.
      { image: 'cutscene_final4', camera: 'zoomIn', focus: { x: 0.5, y: 0.55 }, durationSec: 12, dialogue: 'finale_robot2' },
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
