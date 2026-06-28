import { Application, Container, Graphics, type Text } from 'pixi.js';
import { COLORS, hex } from '../theme';
import { AssetLoader } from './AssetLoader';
import { AudioBus } from './AudioBus';
import { bootDone, bootProgress } from './boot';
import { loadFonts } from './fonts';
import { ResponsiveLayout } from './ResponsiveLayout';
import { SceneManager } from './SceneManager';
import { setTweenTicker } from './tween';
import { t } from './i18n';
import { makeText } from '../ui/helpers';
import { TapFeedback } from '../ui/TapFeedback';
import type { RouteId, SceneFactory, SceneServices } from './scene';
import * as Telemetry from '../telemetry/Telemetry';

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
  private audio!: AudioBus;
  private layout!: ResponsiveLayout;
  private scenes!: SceneManager;
  private resizeHandler = () => this.handleResize();
  /** Frozen while the window is unfocused / the tab is hidden (see setActive). */
  private paused = false;
  /**
   * Activity state derived from the events themselves, not re-queried at event
   * time: inside a `blur` handler `document.hasFocus()` often still reports true
   * (the focus change hasn't propagated yet), which previously left audio
   * playing after an alt-tab. `active = hasFocus && docVisible`.
   */
  private hasFocus = true;
  private docVisible = true;
  private pauseOverlay = new Container();
  private pauseDim = new Graphics();
  private pauseTitle!: Text;
  private pauseHint!: Text;

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
    bootProgress(8);

    // Register bundled web fonts before any Text is created (placeholders below
    // and every scene render rely on the families declared in FONTS).
    await loadFonts();
    bootProgress(20);

    // Loading the sprite PNGs is the slow step on mobile — drive the splash bar
    // with real download progress (mapped into the 20–92% band).
    this.assets = new AssetLoader(this.app.renderer);
    await this.assets.init((fraction) => bootProgress(20 + fraction * 72));
    bootProgress(92);

    this.app.stage.addChild(this.sceneRoot, this.overlayRoot);
    this.layout = new ResponsiveLayout(this.sceneRoot);
    this.audio = new AudioBus();
    // Warm the sound cache in the background: prefetch every clip's bytes now and
    // decode them once the first gesture unlocks the context, so gameplay SFX
    // don't stall on a first-play fetch + decode. Non-blocking — boot continues.
    this.audio.preload();

    const services: SceneServices = {
      app: this.app,
      assets: this.assets,
      audio: this.audio,
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

    // Global tap feedback (click sound on any press + ripple on short taps).
    // Added before the pause overlay so its ripple layer stays below the pause
    // dim (no ripples drawn over the paused screen; audio is muted there too).
    new TapFeedback(this.app.canvas, this.overlayRoot, this.audio);

    this.buildPauseOverlay();
    this.bindActivityListeners();

    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('orientationchange', this.resizeHandler);
    window.visualViewport?.addEventListener('resize', this.resizeHandler);

    // Guard the frame loop: an uncaught error in a scene's update would stop
    // PixiJS scheduling further frames (the app freezes black until reload).
    let errorReported = false; // emit runtime_error once, not every frame
    this.app.ticker.add((tick) => {
      // Backgrounded: hold the simulation so it doesn't advance unseen (and so a
      // long blur doesn't dump a huge time-step when focus returns). Rendering
      // continues so the dimmed pause overlay still shows.
      if (this.paused) return;
      try {
        this.scenes.update(tick.deltaMS / 1000);
      } catch (err) {
        console.error('[Game] scene update threw', err);
        if (!errorReported) {
          errorReported = true;
          Telemetry.track('runtime_error', { where: 'scene.update', message: String(err) });
        }
      }
    });

    this.handleResize();
    this.scenes.start(start);
    // Start paused if we booted into a background tab / unfocused window
    // (bindActivityListeners seeded hasFocus/docVisible and called applyActivity).
    this.applyActivity();

    bootProgress(100);
    bootDone();
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
    this.layoutPauseOverlay(w, h);
  }

  // --- Pause / mute on focus loss ------------------------------------------

  /**
   * Pause the simulation and silence audio whenever the game is in the
   * background — the window lost focus (desktop alt-tab) or the tab/screen went
   * away (mobile lock, tab switch). Both signals fold into one "is the game
   * actually in front of the player" check so the two never disagree.
   */
  private bindActivityListeners(): void {
    this.hasFocus = document.hasFocus();
    this.docVisible = !document.hidden;
    // Drive focus/visibility from the events directly — never re-query
    // document.hasFocus() inside a blur handler (it lies, see field comment).
    window.addEventListener('blur', () => this.setFocus(false));
    window.addEventListener('focus', () => this.setFocus(true));
    window.addEventListener('pagehide', () => this.setVisible(false));
    window.addEventListener('pageshow', () => this.setVisible(true));
    document.addEventListener('visibilitychange', () => this.setVisible(!document.hidden));
    this.applyActivity();
  }

  private setFocus(focused: boolean): void {
    this.hasFocus = focused;
    this.applyActivity();
  }

  private setVisible(visible: boolean): void {
    this.docVisible = visible;
    this.applyActivity();
  }

  /** Resume from the pause overlay: a tap means the window is focused + visible. */
  private resumeFromTap(): void {
    this.hasFocus = true;
    this.docVisible = true;
    this.applyActivity();
  }

  private applyActivity(): void {
    this.setActive(this.hasFocus && this.docVisible);
  }

  private setActive(active: boolean): void {
    if (this.paused === !active) return; // no change
    this.paused = !active;
    this.audio.setSuspended(this.paused);
    this.pauseOverlay.visible = this.paused;
    // While shown, the dim swallows the click that refocuses the window so it
    // can't leak through onto the board.
    this.pauseDim.eventMode = this.paused ? 'static' : 'none';
  }

  private buildPauseOverlay(): void {
    this.pauseOverlay.visible = false;
    this.pauseOverlay.eventMode = 'static';
    this.pauseDim.eventMode = 'none';
    // Tapping the dim is a manual resume fallback for browsers that don't fire a
    // clean focus event when the window comes back.
    this.pauseDim.on('pointertap', () => this.resumeFromTap());
    this.pauseTitle = makeText(t('common.paused'), 'display', { align: 'center' });
    this.pauseTitle.anchor.set(0.5);
    this.pauseHint = makeText(t('common.pausedHint'), 'small', {
      align: 'center',
      fill: hex(COLORS.textDim),
    });
    this.pauseHint.anchor.set(0.5);
    this.pauseOverlay.addChild(this.pauseDim, this.pauseTitle, this.pauseHint);
    this.overlayRoot.addChild(this.pauseOverlay);
  }

  private layoutPauseOverlay(w: number, h: number): void {
    if (!this.pauseTitle) return; // pre-boot resize
    this.pauseDim.clear();
    this.pauseDim.rect(0, 0, w, h).fill({ color: COLORS.bgDeep, alpha: 0.72 });
    this.pauseTitle.scale.set(1);
    const maxW = w * 0.9;
    if (this.pauseTitle.width > maxW) this.pauseTitle.scale.set(maxW / this.pauseTitle.width);
    this.pauseTitle.position.set(w / 2, h / 2 - 18);
    this.pauseHint.position.set(w / 2, h / 2 + 44);
  }
}
