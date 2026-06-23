import type { Container } from 'pixi.js';
import { DESIGN } from '../theme';

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Everything a scene needs to lay itself out. All coordinates except `offset*`
 * and `screen*` are expressed in the design/logical space the scene draws in.
 */
export interface LayoutInfo {
  /** 'portrait' = frame fills the canvas; 'wide' = framed area centered with decor sides. */
  mode: 'portrait' | 'wide';
  /** design -> screen scale applied to the scene root. */
  scale: number;
  /** Logical size of the portrait "game frame" (width is fixed at DESIGN.width). */
  width: number;
  height: number;
  /** Screen-pixel placement of the scaled scene root. */
  offsetX: number;
  offsetY: number;
  /** Canvas size in CSS logical pixels. */
  screenW: number;
  screenH: number;
  /** Safe-area insets, converted into logical units. */
  insets: SafeInsets;
  /** The whole canvas expressed in logical coords (covers the decor margins too). */
  full: Rect;
  /** The game frame minus safe-area insets — anchor HUD to this. */
  safe: Rect;
}

type LayoutListener = (info: LayoutInfo) => void;

/**
 * Resolution-independent layout. The renderer fills the window (Pixi handles
 * devicePixelRatio via autoDensity); this maps a fixed-width portrait design
 * space onto it:
 *
 *  - Tall/portrait screens: fit to width, let the logical height flex so the
 *    HUD can anchor to the true top/bottom edges (no wasted letterbox).
 *  - Wide/short screens: center a reference portrait frame and let scenes paint
 *    thematic decor into the side margins (never black bars).
 *
 * Safe-area insets (notches, rounded corners) are read from CSS env() and fed
 * back in logical units so the HUD can dodge them.
 */
export class ResponsiveLayout {
  private listeners = new Set<LayoutListener>();
  private probe: HTMLElement | null = null;
  info: LayoutInfo;

  constructor(private root: Container) {
    this.info = this.compute(window.innerWidth, window.innerHeight);
    this.applyToRoot();
  }

  onChange(fn: LayoutListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Recompute for a new canvas size (CSS logical pixels). */
  resize(screenW: number, screenH: number): LayoutInfo {
    this.info = this.compute(screenW, screenH);
    this.applyToRoot();
    for (const fn of this.listeners) fn(this.info);
    return this.info;
  }

  private applyToRoot(): void {
    this.root.scale.set(this.info.scale);
    this.root.position.set(this.info.offsetX, this.info.offsetY);
  }

  private compute(screenW: number, screenH: number): LayoutInfo {
    const insetPx = this.readSafeAreaPx();

    const fitWidthScale = screenW / DESIGN.width;
    const logicalH = screenH / fitWidthScale;

    let mode: 'portrait' | 'wide';
    let scale: number;
    const width = DESIGN.width;
    let height: number;
    let offsetX: number;
    let offsetY: number;

    if (logicalH >= DESIGN.minHeight) {
      // Portrait: fit width, flex (and cap) the height.
      mode = 'portrait';
      scale = fitWidthScale;
      height = Math.min(logicalH, DESIGN.maxHeight);
      const contentPxH = height * scale;
      offsetX = 0;
      offsetY = Math.round((screenH - contentPxH) / 2); // 0 unless height was capped
    } else {
      // Wide / short: fit the reference portrait frame by height, center it.
      mode = 'wide';
      height = DESIGN.height;
      scale = screenH / DESIGN.height;
      const contentPxW = width * scale;
      offsetX = Math.round((screenW - contentPxW) / 2);
      offsetY = 0;
    }

    const insets: SafeInsets = {
      top: insetPx.top / scale,
      right: insetPx.right / scale,
      bottom: insetPx.bottom / scale,
      left: insetPx.left / scale,
    };

    const full: Rect = {
      x: -offsetX / scale,
      y: -offsetY / scale,
      width: screenW / scale,
      height: screenH / scale,
    };

    // Only the part of a physical inset that exceeds the decor margin actually
    // intrudes into the play frame. In portrait (offsets 0) this equals `insets`;
    // in wide/clamped modes the margins usually absorb the notch entirely.
    const eff = (px: number, margin: number) => Math.max(0, px - margin) / scale;
    const sl = eff(insetPx.left, offsetX);
    const sr = eff(insetPx.right, offsetX);
    const st = eff(insetPx.top, offsetY);
    const sb = eff(insetPx.bottom, offsetY);
    const safe: Rect = {
      x: sl,
      y: st,
      width: width - sl - sr,
      height: height - st - sb,
    };

    return { mode, scale, width, height, offsetX, offsetY, screenW, screenH, insets, full, safe };
  }

  /** Read env(safe-area-inset-*) in CSS pixels via a hidden probe element. */
  private readSafeAreaPx(): SafeInsets {
    if (!this.probe) {
      const p = document.createElement('div');
      p.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
        'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
      document.body.appendChild(p);
      this.probe = p;
    }
    const cs = getComputedStyle(this.probe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  destroy(): void {
    this.listeners.clear();
    this.probe?.remove();
    this.probe = null;
  }
}
