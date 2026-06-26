import type { Plugin } from 'vite';
import sharp from 'sharp';

/**
 * Build-only asset shrinker. Re-encodes every sprite PNG that Vite emits into
 * `dist/` as lossy WebP so the deployed build is a fraction of the source weight,
 * while the committed PNG masters in `assets/sprites/` stay untouched.
 *
 * WebP wins on both opaque backgrounds and alpha sprites here (lossy WebP beats
 * palette PNG on size, and sharp keeps the alpha plane near-lossless by default,
 * so cut-outs stay crisp). The `Math.min` guard keeps the original PNG in the
 * rare case WebP comes out larger (tiny already-tight icons), so a file is never
 * made bigger.
 *
 * Because the game references assets only by key (see AssetLoader's glob), the
 * only thing a PNG→WebP rename touches is the resolved URL string baked into the
 * JS chunks — which this plugin rewrites in place. PixiJS picks its loader from
 * the `.webp`/`.png` extension, so swapping the extension is enough.
 */

const WEBP_QUALITY = 82; // lossy RGB; alpha stays at sharp's default alphaQuality 100

function mib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function optimizeSpritesPlugin(): Plugin {
  return {
    name: 'optimize-sprites',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const renames = new Map<string, string>();
      let before = 0;
      let after = 0;
      let webpCount = 0;
      let keptCount = 0;

      for (const fileName of Object.keys(bundle)) {
        const output = bundle[fileName];
        if (!output || output.type !== 'asset' || !/\.png$/i.test(fileName)) continue;

        const src = output.source;
        const input = typeof src === 'string' ? Buffer.from(src) : Buffer.from(src);
        before += input.length;

        try {
          // effort 4, not 6: effort 6 is ~40× slower on this asset set for only ~4%
          // smaller output — a bad trade for a step that runs on every deploy.
          const webp = await sharp(input).webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
          if (webp.length < input.length) {
            const newName = fileName.replace(/\.png$/i, '.webp');
            delete bundle[fileName];
            output.fileName = newName;
            output.source = webp;
            bundle[newName] = output;
            renames.set(fileName, newName);
            after += webp.length;
            webpCount++;
          } else {
            // WebP came out heavier — keep the (already optimized) PNG untouched.
            after += input.length;
            keptCount++;
          }
        } catch (err) {
          after += input.length;
          this.warn(`optimize-sprites: skipped ${fileName} (${(err as Error).message})`);
        }
      }

      // Repoint every reference to a renamed (PNG→WebP) asset. Vite emits asset URLs
      // as `new URL("<basename>-<hash>.png", import.meta.url)` (base-relative, so just
      // the basename — no `assets/` prefix). The content hash makes each basename a
      // globally-unique string, so a plain substring swap is safe across chunks/HTML/CSS.
      if (renames.size > 0) {
        const swaps: Array<[string, string]> = [];
        for (const [oldName, newName] of renames) {
          const oldBase = oldName.split('/').pop()!;
          const newBase = newName.split('/').pop()!;
          swaps.push([oldName, newName]); // absolute/base-prefixed form
          if (oldBase !== oldName) swaps.push([oldBase, newBase]); // base-relative form (the one Vite emits)
        }
        for (const fileName of Object.keys(bundle)) {
          const output = bundle[fileName];
          if (!output) continue;
          if (output.type === 'chunk') {
            for (const [oldStr, newStr] of swaps) {
              if (output.code.includes(oldStr)) output.code = output.code.split(oldStr).join(newStr);
            }
          } else if (/\.(html|css|json|webmanifest)$/i.test(fileName) && typeof output.source === 'string') {
            let text = output.source;
            for (const [oldStr, newStr] of swaps) {
              if (text.includes(oldStr)) text = text.split(oldStr).join(newStr);
            }
            output.source = text;
          }
        }
      }

      if (before > 0) {
        const saved = before - after;
        const pct = ((saved / before) * 100).toFixed(0);
        this.info(
          `optimize-sprites: ${mib(before)} → ${mib(after)} (−${pct}%, ${saved > 0 ? mib(saved) : '0'} saved) · ${webpCount} webp${keptCount ? `, ${keptCount} png kept` : ''}`,
        );
      }
    },
  };
}
