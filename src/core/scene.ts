import { Container, type Application } from 'pixi.js';
import type { AssetLoader } from './AssetLoader';
import type { AudioBus } from './AudioBus';
import type { LayoutInfo } from './ResponsiveLayout';

export type RouteId = 'menu' | 'worldmap' | 'battle';

export type SceneParams = Record<string, unknown>;

/** Services injected into every scene. */
export interface SceneServices {
  readonly app: Application;
  readonly assets: AssetLoader;
  /** Music + SFX. Silent no-op until audio files are dropped into assets/audio/. */
  readonly audio: AudioBus;
  /** Navigate to another scene (with a fade transition). */
  navigate(route: RouteId, params?: SceneParams): void;
  /** Current layout snapshot (also delivered via `layout()` on resize). */
  getLayout(): LayoutInfo;
}

export type SceneFactory = (services: SceneServices) => Scene;

/**
 * Base class for the three scenes. A scene is a Container living in the scaled
 * scene-root (design coordinate space). Override the lifecycle hooks as needed.
 */
export abstract class Scene extends Container {
  protected services: SceneServices;

  constructor(services: SceneServices) {
    super();
    this.services = services;
    this.label = this.constructor.name;
  }

  /** Called once after the scene is added, before the first layout. */
  abstract onEnter(params?: SceneParams): void;

  /** Called on enter and on every resize. Lay out children against `info`. */
  layout(_info: LayoutInfo): void {}

  /** Per-frame update; `dt` is seconds since last frame. */
  update(_dt: number): void {}

  /** Called right before the scene is destroyed. */
  onExit(): void {}
}
