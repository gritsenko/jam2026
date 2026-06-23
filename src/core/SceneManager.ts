import { Container, Graphics } from 'pixi.js';
import { COLORS } from '../theme';
import { tween, Easings } from './tween';
import type { LayoutInfo } from './ResponsiveLayout';
import type { RouteId, Scene, SceneFactory, SceneParams, SceneServices } from './scene';

const FADE_SECONDS = 0.24;

/**
 * Owns the active scene and performs fade transitions between routes.
 * The fade overlay lives above the scaled scene-root, in raw screen pixels, so
 * it always covers the whole canvas regardless of layout mode.
 */
export class SceneManager {
  private current: Scene | null = null;
  private busy = false;
  private fade = new Graphics();

  constructor(
    private sceneRoot: Container,
    private overlayRoot: Container,
    private routes: Record<RouteId, SceneFactory>,
    private services: SceneServices,
    private getLayout: () => LayoutInfo,
  ) {
    this.fade.eventMode = 'none';
    this.fade.visible = false;
    this.overlayRoot.addChild(this.fade);
  }

  get activeScene(): Scene | null {
    return this.current;
  }

  /** Show the first scene with a quick fade-from-black. */
  start(route: RouteId, params?: SceneParams): void {
    this.mountScene(route, params);
    this.drawFade();
    this.fade.visible = true;
    this.fade.alpha = 1;
    this.fade.eventMode = 'static';
    tween({
      duration: FADE_SECONDS,
      easing: Easings.inOutSine,
      onUpdate: (e) => (this.fade.alpha = 1 - e),
      onComplete: () => {
        this.fade.visible = false;
        this.fade.eventMode = 'none';
      },
    });
  }

  navigate(route: RouteId, params?: SceneParams): void {
    if (this.busy) return;
    this.busy = true;
    this.drawFade();
    this.fade.visible = true;
    this.fade.alpha = 0;
    this.fade.eventMode = 'static'; // swallow input during the transition

    tween({
      duration: FADE_SECONDS,
      easing: Easings.inOutSine,
      onUpdate: (e) => (this.fade.alpha = e),
      onComplete: () => this.swapAndReveal(route, params),
    });
  }

  /**
   * Swap to the target scene behind the black cover, then always fade the cover
   * back off and release the navigation lock. A scene that fails to mount is
   * logged but never strands the app on a black, input-swallowing screen (which
   * previously forced a page reload).
   */
  private swapAndReveal(route: RouteId, params?: SceneParams): void {
    try {
      this.mountScene(route, params);
    } catch (err) {
      console.error(`[SceneManager] failed to mount scene "${route}"`, err);
    }
    tween({
      duration: FADE_SECONDS,
      easing: Easings.inOutSine,
      onUpdate: (e) => (this.fade.alpha = 1 - e),
      onComplete: () => {
        this.fade.visible = false;
        this.fade.eventMode = 'none';
        this.busy = false;
      },
    });
  }

  /** Forward a resize to the current scene and re-cover the canvas with the fade. */
  onResize(info: LayoutInfo): void {
    this.drawFade();
    this.current?.layout(info);
  }

  /** Pump per-frame updates into the active scene. */
  update(dt: number): void {
    this.current?.update(dt);
  }

  private mountScene(route: RouteId, params?: SceneParams): void {
    if (this.current) {
      this.current.onExit();
      this.current.destroy({ children: true });
      this.current = null;
    }
    const factory = this.routes[route];
    const scene = factory(this.services);
    this.sceneRoot.addChild(scene);
    this.current = scene;
    scene.onEnter(params);
    scene.layout(this.getLayout());
  }

  private drawFade(): void {
    const { full, offsetX, offsetY, scale } = this.getLayout();
    // The fade sits in the overlay root (screen pixels). Cover generously.
    this.fade.clear();
    this.fade
      .rect(
        full.x * scale + offsetX - 10,
        full.y * scale + offsetY - 10,
        full.width * scale + 20,
        full.height * scale + 20,
      )
      .fill({ color: COLORS.bgDeep });
  }
}
