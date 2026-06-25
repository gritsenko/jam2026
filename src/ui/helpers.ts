import { Graphics, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import { COLORS, FONTS, hex } from '../theme';

/**
 * Scale a sprite to fit (contain) or fill (cover) a boxW×boxH area, anchored and
 * centered on its parent origin (0,0). Callers that want it elsewhere set
 * `sprite.position` afterwards.
 */
export function fitSprite(
  sprite: Sprite,
  boxW: number,
  boxH: number,
  mode: 'contain' | 'cover' = 'contain',
): void {
  const tex = sprite.texture;
  const tw = tex.width || 1;
  const th = tex.height || 1;
  const s = mode === 'contain' ? Math.min(boxW / tw, boxH / th) : Math.max(boxW / tw, boxH / th);
  sprite.width = tw * s;
  sprite.height = th * s;
  sprite.anchor.set(0.5);
  sprite.position.set(0, 0);
}

export interface PanelOptions {
  radius?: number;
  fill?: number;
  fillAlpha?: number;
  edge?: number;
  edgeWidth?: number;
  /** Inner highlight for a beveled, machined-metal feel. */
  bevel?: boolean;
  /** Rivets in the corners. */
  rivets?: boolean;
}

/**
 * Draws a brass-edged metal panel into `g` at (x,y,w,h). Shared by HUD chrome
 * so every panel reads as the same machined-steampunk material.
 */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOptions = {},
): void {
  const {
    radius = 18,
    fill = COLORS.metalMid,
    fillAlpha = 0.96,
    edge = COLORS.brass,
    edgeWidth = 4,
    bevel = true,
    rivets = false,
  } = opts;

  g.roundRect(x, y, w, h, radius).fill({ color: fill, alpha: fillAlpha });
  if (bevel) {
    // Glossy top band + deeper bottom shade read as machined dieselpunk plate.
    g.roundRect(x + edgeWidth, y + edgeWidth, w - edgeWidth * 2, (h - edgeWidth * 2) * 0.5, radius)
      .fill({ color: COLORS.white, alpha: 0.07 });
    g.roundRect(x + edgeWidth, y + h * 0.5, w - edgeWidth * 2, h * 0.5 - edgeWidth, radius)
      .fill({ color: COLORS.black, alpha: 0.18 });
  }
  // Dark steel keyline under the brass edge for depth, then the brass edge itself.
  g.roundRect(x, y, w, h, radius).stroke({ width: edgeWidth + 2, color: COLORS.black, alpha: 0.4, alignment: 1 });
  g.roundRect(x, y, w, h, radius).stroke({ width: edgeWidth, color: edge, alignment: 0.5 });
  // Thin inner machined highlight, a hair inside the edge.
  const inset = edgeWidth + 3;
  g.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(2, radius - 4))
    .stroke({ width: 1.5, color: COLORS.brassLight, alpha: 0.22 });

  if (rivets) {
    const r = 4;
    const pad = 14;
    for (const [rx, ry] of [
      [x + pad, y + pad],
      [x + w - pad, y + pad],
      [x + pad, y + h - pad],
      [x + w - pad, y + h - pad],
    ] as const) {
      g.circle(rx, ry, r).fill({ color: COLORS.rivet });
      g.circle(rx, ry, r).stroke({ width: 1.5, color: COLORS.brassLight, alpha: 0.5 });
    }
  }
}

export type TextPreset = 'display' | 'title' | 'label' | 'value' | 'small' | 'micro';

const PRESETS: Record<TextPreset, TextStyleOptions> = {
  display: { fontFamily: FONTS.display, fontSize: 84, fontWeight: '900', fill: hex(COLORS.textBright) },
  title: { fontFamily: FONTS.display, fontSize: 44, fontWeight: '800', fill: hex(COLORS.textBright) },
  label: { fontFamily: FONTS.display, fontSize: 30, fontWeight: '800', fill: hex(COLORS.textDim) },
  value: { fontFamily: FONTS.display, fontSize: 34, fontWeight: '800', fill: hex(COLORS.textBright) },
  small: { fontFamily: FONTS.body, fontSize: 22, fontWeight: '700', fill: hex(COLORS.textBright) },
  micro: { fontFamily: FONTS.body, fontSize: 18, fontWeight: '700', fill: hex(COLORS.textDim) },
};

/** Make a Text using a shared preset, with optional overrides. */
export function makeText(text: string, preset: TextPreset, overrides: TextStyleOptions = {}): Text {
  const t = new Text({
    text,
    style: {
      ...PRESETS[preset],
      stroke: { color: hex(COLORS.black), width: 3, alpha: 0.45 },
      ...overrides,
    },
  });
  return t;
}

/**
 * A centered element-symbol sprite (the `sym_<element>` motif) sized to fit a
 * `diameter`×`diameter` box, anchored at its middle. Origin (0,0); callers set
 * `position`. Pass `tint` to recolor a light emblem for contrast on a bright dot.
 */
export function makeElementSymbol(tex: Texture, diameter: number, tint?: number): Sprite {
  const s = new Sprite(tex);
  fitSprite(s, diameter, diameter);
  if (tint !== undefined) s.tint = tint;
  return s;
}

/** A soft radial glow disc, useful behind icons and energy beams. */
export function glowCircle(radius: number, color: number, alpha = 0.5): Graphics {
  const g = new Graphics();
  const rings = 6;
  for (let i = rings; i >= 1; i--) {
    const t = i / rings;
    g.circle(0, 0, radius * t).fill({ color, alpha: (alpha * (1 - t + 0.2)) / rings * 2 });
  }
  return g;
}
