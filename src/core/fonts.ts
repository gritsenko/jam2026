/**
 * Bundled web fonts. PixiJS canvas Text renders with whatever the browser has
 * registered in `document.fonts`, so every family referenced by FONTS
 * (theme.ts) must be loaded here BEFORE the first Text is created — otherwise it
 * silently falls back to a system face.
 *
 * Files live in /assets/fonts and are resolved to hashed URLs by Vite (the same
 * glob trick the sprite loader uses). The filename is incidental; the `family`
 * string is what theme.ts references.
 */

interface FontSpec {
  /** font-family string used by theme.ts FONTS. */
  family: string;
  /** Filename inside assets/fonts/. */
  file: string;
  /**
   * FontFace descriptors. Declaring a wide `weight` range makes the single
   * file serve every fontWeight our presets request (700–900), so the browser
   * never synthesizes a faux-bold on top of an already-chunky display face.
   */
  descriptors?: FontFaceDescriptors;
}

const FONT_SPECS: readonly FontSpec[] = [
  { family: 'Lilita One', file: 'LilitaOne-Regular.ttf', descriptors: { weight: '100 900' } },
  // Lilita One has no Cyrillic glyphs, so Russian text would silently fall back to
  // a flat system sans. Russo One is a heavy display face with full Cyrillic — it
  // sits *after* Lilita One in the FONTS stacks (theme.ts), so Latin keeps Lilita's
  // rounded cartoon look and only the missing (Cyrillic) glyphs borrow Russo One.
  { family: 'Russo One', file: 'RussoOne-Regular.ttf', descriptors: { weight: '100 900' } },
];

/** Hashed URLs for every font file in assets/fonts/, resolved by Vite at build time. */
const FONT_URLS = import.meta.glob('/assets/fonts/*.{ttf,otf,woff,woff2}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/**
 * Loads and registers all bundled fonts. Resolves once every face is ready (or
 * has failed — a missing/broken font just falls back to the next family in the
 * stack, so we never block boot on it).
 */
export async function loadFonts(): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return;

  await Promise.all(
    FONT_SPECS.map(async (spec) => {
      const url = FONT_URLS[`/assets/fonts/${spec.file}`];
      if (!url) {
        console.warn(`[fonts] file not found for "${spec.family}": ${spec.file}`);
        return;
      }
      try {
        const face = new FontFace(spec.family, `url(${url})`, spec.descriptors);
        await face.load();
        document.fonts.add(face);
      } catch (err) {
        console.warn(`[fonts] failed to load "${spec.family}"`, err);
      }
    }),
  );
}
