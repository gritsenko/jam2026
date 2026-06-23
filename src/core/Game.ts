import { Application, Container } from 'pixi.js';
import { COLORS } from '../theme';
import { AssetLoader } from './AssetLoader';
import { loadFonts } from './fonts';
import { ResponsiveLayout } from './ResponsiveLayout';
import { SceneManager } from './SceneManager';
import { setTweenTicker } from './tween';
import type { RouteId, SceneFactory, SceneServices } from './scene';

/** Cap DPR — beyond this the perf cost outweighs the sharpness gain on mobile. */
const MAX_DPR = 2.5;

/**
 * Top-level bootstrap: owns the PixiJS Application, the asset loader, the
 * responsive layout and the scene manager, and drives resize + the frame loop.
 */
export class Game {
  readonly app = new Application();
  private sceneRoot = new Container();
  private overlayRoot = new Container();
  private assets!: AssetLoader;
  private layout!: ResponsiveLayout;
  private scenes!: SceneManager;
  private resizeHandler = () => this.handleResize();

  async boot(routes: Record<RouteId, SceneFactory>, start: RouteId): Promise<void> {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: COLORS.bgDeep,
      antialias: true,
      resolution: dpr,
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });

    const mount = document.getElementById('app') ?? document.body;
    mount.appendChild(this.app.canvas);
    setTweenTicker(this.app.ticker);

    // Register bundled web fonts before any Text is created (placeholders below
    // and every scene render rely on the families declared in FONTS).
    await loadFonts();

    this.assets = new AssetLoader(this.app.renderer);
    await this.assets.init();

    this.app.stage.addChild(this.sceneRoot, this.overlayRoot);
    this.layout = new ResponsiveLayout(this.sceneRoot);

    const services: SceneServices = {
      app: this.app,
      assets: this.assets,
      navigate: (route, params) => this.scenes.navigate(route, params),
      getLayout: () => this.layout.info,
    };

    this.scenes = new SceneManager(
      this.sceneRoot,
      this.overlayRoot,
      routes,
      services,
      () => this.layout.info,
    );

    this.layout.onChange((info) => this.scenes.onResize(info));

    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('orientationchange', this.resizeHandler);
    window.visualViewport?.addEventListener('resize', this.resizeHandler);

    // Guard the frame loop: an uncaught error in a scene's update would stop
    // PixiJS scheduling further frames (the app freezes black until reload).
    this.app.ticker.add((t) => {
      try {
        this.scenes.update(t.deltaMS / 1000);
      } catch (err) {
        console.error('[Game] scene update threw', err);
      }
    });

    this.handleResize();
    this.scenes.start(start);

    document.getElementById('boot')?.remove();
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (this.app.renderer.resolution !== dpr) {
      this.app.renderer.resolution = dpr;
    }
    this.app.renderer.resize(w, h);
    this.layout.resize(w, h);
  }
}
