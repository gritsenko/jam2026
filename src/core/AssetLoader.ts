import { Assets, Container, Graphics, Text, Texture, type Renderer } from 'pixi.js';
import { COLORS, FONTS, hex } from '../theme';
import {
  ASSETS,
  ASSET_BY_KEY,
  ASSET_FALLBACKS,
  type AssetSpec,
  type PlaceholderSpec,
} from '../config/assetManifest';

/**
 * Eagerly collected URLs of any PNG that actually exists in assets/sprites/.
 * Vite resolves this glob at build time, so:
 *   - generated sprites appear automatically (after a dev-server restart),
 *   - missing ones simply aren't here and fall back to a placeholder — no 404s.
 */
const SPRITE_URLS = import.meta.glob('/assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function basename(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.png$/i, '');
}

/**
 * Resolves every asset key to a Texture. Real sprite if present in
 * assets/sprites/, otherwise a themed placeholder built from the manifest.
 * The game only ever references keys, so dropping in a generated PNG swaps the
 * art with zero code changes.
 */
export class AssetLoader {
  private real = new Map<string, Texture>();
  private placeholders = new Map<string, Texture>();
  private renderer: Renderer;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  /**
   * Build all placeholders, then load whatever real sprites exist on disk.
   * `onProgress` (0–1) is forwarded from the texture loader so the boot splash
   * can show real download progress — this is the slow step on mobile.
   */
  async init(onProgress?: (fraction: number) => void): Promise<void> {
    for (const spec of ASSETS) {
      this.placeholders.set(spec.key, this.buildPlaceholder(spec.placeholder));
    }

    const entries = Object.entries(SPRITE_URLS);
    if (entries.length === 0) {
      onProgress?.(1);
      return;
    }
    const keys: string[] = [];
    for (const [path, url] of entries) {
      const key = basename(path);
      Assets.add({ alias: key, src: url });
      keys.push(key);
    }
    try {
      const loaded = (await Assets.load(keys, onProgress)) as Record<string, Texture>;
      for (const key of keys) {
        const tex = loaded[key];
        if (tex) this.real.set(key, tex);
      }
    } catch (err) {
      console.warn('[AssetLoader] some sprites failed to load; using placeholders.', err);
      onProgress?.(1);
    }
  }

  /** True if a real generated sprite is loaded for this key. */
  has(key: string): boolean {
    return this.real.has(key);
  }

  /** Always returns a usable Texture (real or placeholder). */
  get(key: string): Texture {
    const real = this.real.get(key);
    if (real) return real;
    // Borrow a thematically-close real sprite before giving up to a placeholder.
    const fallback = ASSET_FALLBACKS[key];
    if (fallback) {
      const fbReal = this.real.get(fallback);
      if (fbReal) return fbReal;
    }
    const ph = this.placeholders.get(key);
    if (ph) return ph;
    // Unknown key: build a generic placeholder once and cache it.
    const generic = this.buildPlaceholder({ shape: 'round', tint: 0xff00ff, label: key });
    this.placeholders.set(key, generic);
    console.warn(`[AssetLoader] unknown asset key "${key}" — using generic placeholder.`);
    return generic;
  }

  /** Manifest spec for a key, if any. */
  spec(key: string): AssetSpec | undefined {
    return ASSET_BY_KEY[key];
  }

  private buildPlaceholder(spec: PlaceholderSpec): Texture {
    const size = 256;
    const c = new Container();
    const g = new Graphics();

    if (spec.shape === 'rect') {
      // Full-bleed: a soft two-tone wash so stretched backgrounds aren't flat.
      g.rect(0, 0, size, size).fill({ color: spec.tint });
      g.rect(0, 0, size, size).fill({ color: COLORS.black, alpha: 0.0 });
      g.circle(size / 2, size * 0.42, size * 0.6).fill({ color: COLORS.white, alpha: 0.06 });
      g.rect(0, size * 0.7, size, size * 0.3).fill({ color: COLORS.black, alpha: 0.18 });
    } else if (spec.shape === 'disc') {
      const r = size / 2 - 8;
      g.circle(size / 2, size / 2, r).fill({ color: spec.tint });
      g.circle(size / 2, size / 2, r).stroke({ width: 6, color: COLORS.metalDark, alpha: 0.6 });
      g.circle(size / 2, size * 0.4, r * 0.7).fill({ color: COLORS.white, alpha: 0.1 });
    } else if (spec.shape === 'star') {
      // Five-point star: 10 vertices alternating outer/inner radius, from the top.
      const cx = size / 2;
      const cy = size / 2;
      const outer = size / 2 - 14;
      const inner = outer * 0.42;
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.poly(pts).fill({ color: spec.tint });
      g.poly(pts).stroke({ width: 6, color: COLORS.metalDark, alpha: 0.6 });
      g.circle(cx, cy - inner * 0.25, inner * 0.55).fill({ color: COLORS.white, alpha: 0.12 });
    } else {
      // round panel (cards, towers, props)
      g.roundRect(10, 10, size - 20, size - 20, 22).fill({ color: spec.tint });
      g.roundRect(10, 10, size - 20, size - 20, 22).stroke({ width: 6, color: COLORS.metalDark, alpha: 0.6 });
      g.roundRect(10, 10, size - 20, size * 0.45, 22).fill({ color: COLORS.white, alpha: 0.08 });
    }
    c.addChild(g);

    if (spec.label) {
      const label = new Text({
        text: spec.label,
        style: {
          fontFamily: FONTS.display,
          fontSize: 34,
          fontWeight: '800',
          fill: hex(COLORS.textDark),
          align: 'center',
          stroke: { color: hex(COLORS.white), width: 1, alpha: 0.25 },
        },
      });
      label.anchor.set(0.5);
      label.position.set(size / 2, size / 2);
      label.scale.set(Math.min(1, (size - 40) / Math.max(label.width, 1)));
      c.addChild(label);
    }

    const tex = this.renderer.generateTexture({ target: c, resolution: 2 });
    c.destroy({ children: true });
    return tex;
  }
}
