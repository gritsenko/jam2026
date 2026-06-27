import { Container, Graphics, ImageSource, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../theme';

/**
 * A looping animated-WebP decoration with an optional grounded shadow.
 *
 * PixiJS (like a `<img>` uploaded to WebGL) only ever shows the **first frame**
 * of an animated WebP — the GPU upload is a single still. So we decode every
 * frame up front with the platform `ImageDecoder` (WebCodecs), bake each into a
 * `Texture`, and swap the inner sprite's texture over time to replay it.
 *
 * It's a `Container` (not a bare `Sprite`) so a soft shadow ellipse can be drawn
 * *under* the frame — a Sprite renders its own texture before its children, so a
 * child shadow would otherwise sit on top. Layout (anchor/position/scale) is set
 * by the owner on this container; the frame sprite is centred inside it.
 *
 * The container does **not** self-tick: the owner advances it from its own update
 * loop via {@link advance} (seconds), so it honours the scene's lifecycle and
 * never leaks a ticker subscription. Frames are freed in {@link destroy}.
 *
 * Browsers without `ImageDecoder` (older Safari) simply stay empty — {@link load}
 * resolves having done nothing.
 */

/** WebP source URLs by basename — Vite emits/fingerprints each on build. */
const WEBP_URLS = import.meta.glob('/assets/sprites/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Fallback per-frame hold when a frame reports no duration (microseconds → ms). */
const DEFAULT_FRAME_MS = 1000 / 30;

function webpUrl(key: string): string | undefined {
  for (const path of Object.keys(WEBP_URLS)) {
    const base = (path.split('/').pop() ?? '').replace(/\.webp$/i, '');
    if (base === key) return WEBP_URLS[path];
  }
  return undefined;
}

interface DecodedWebp {
  readonly frames: Texture[];
  /** Per-frame hold in milliseconds (parallel to `frames`). */
  readonly durationsMs: number[];
}

/** Decode an animated WebP to one Texture per frame, or null if unsupported/failed. */
async function decodeAnimatedWebp(url: string): Promise<DecodedWebp | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  let decoder: ImageDecoder | undefined;
  try {
    const data = await (await fetch(url)).arrayBuffer();
    decoder = new ImageDecoder({ data, type: 'image/webp' });
    await decoder.tracks.ready;
    const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
    const frames: Texture[] = [];
    const durationsMs: number[] = [];
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const holdMs = image.duration && image.duration > 0 ? image.duration / 1000 : DEFAULT_FRAME_MS;
      // Bake into a stable, GPU-friendly ImageBitmap so the heavy VideoFrame can
      // be released immediately (keeping 48 VideoFrames open would be wasteful).
      const bitmap = await createImageBitmap(image);
      image.close();
      frames.push(new Texture({ source: new ImageSource({ resource: bitmap }) }));
      durationsMs.push(holdMs);
    }
    return { frames, durationsMs };
  } catch (err) {
    console.warn('[AnimatedDecor] WebP decode failed:', err);
    return null;
  } finally {
    decoder?.close();
  }
}

export class AnimatedDecor extends Container {
  private readonly sprite = new Sprite(Texture.EMPTY);
  private readonly shadow?: Graphics;
  private frames: Texture[] = [];
  private durationsMs: number[] = [];
  private totalMs = 0;
  private elapsedMs = 0;
  private frameIndex = 0;
  private disposed = false;

  constructor(opts: { shadow?: boolean } = {}) {
    super();
    this.sprite.anchor.set(0.5); // frame centred on the container origin
    if (opts.shadow) {
      this.shadow = new Graphics();
      this.addChild(this.shadow); // drawn first → sits under the frame
    }
    this.addChild(this.sprite);
  }

  /**
   * Decode the WebP asset (by file basename, e.g. `'decor'`) and begin playing.
   * Safe to call once; resolves when frames are ready (or silently if the format
   * can't be decoded). Frees its work if the node was destroyed mid-decode.
   */
  async load(key: string): Promise<void> {
    const url = webpUrl(key);
    if (!url) {
      console.warn(`[AnimatedDecor] no WebP asset for key "${key}"`);
      return;
    }
    const decoded = await decodeAnimatedWebp(url);
    if (!decoded || decoded.frames.length === 0 || this.disposed) {
      decoded?.frames.forEach((t) => t.destroy(true));
      return;
    }
    this.frames = decoded.frames;
    this.durationsMs = decoded.durationsMs;
    this.totalMs = this.durationsMs.reduce((a, b) => a + b, 0);
    this.sprite.texture = this.frames[0]!;
    this.drawShadow();
  }

  /** Draw the grounded shadow once the frame size is known (feet, near the base). */
  private drawShadow(): void {
    const g = this.shadow;
    if (!g) return;
    const { width: w, height: h } = this.sprite.texture;
    if (w <= 1 || h <= 1) return;
    // A flat ellipse under the feet, matching the enemy-token shadow. Offsets are
    // traced from the art: the foot stance sits ~centred (a touch left) at the
    // sole contact line, which is right at the bottom of the frame (~0.49·h), so
    // the ellipse straddles the soles and reads as a ground shadow.
    g.clear();
    g.ellipse(-w * 0.05, h * 0.485, w * 0.28, w * 0.09).fill({ color: COLORS.black, alpha: 0.3 });
  }

  /** Advance playback by `dtSec` seconds, looping. */
  advance(dtSec: number): void {
    if (this.disposed || this.frames.length < 2 || this.totalMs <= 0) return;
    this.elapsedMs = (this.elapsedMs + dtSec * 1000) % this.totalMs;
    let acc = 0;
    for (let i = 0; i < this.frames.length; i++) {
      acc += this.durationsMs[i] ?? DEFAULT_FRAME_MS;
      if (this.elapsedMs < acc) {
        if (i !== this.frameIndex) {
          this.frameIndex = i;
          this.sprite.texture = this.frames[i]!;
        }
        return;
      }
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.disposed = true;
    const frames = this.frames;
    this.frames = [];
    if (!this.sprite.destroyed) this.sprite.texture = Texture.EMPTY; // detach before freeing
    super.destroy(options);
    for (const t of frames) t.destroy(true); // free each frame's GPU source
  }
}
