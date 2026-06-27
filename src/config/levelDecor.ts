/**
 * Per-level decorative props painted onto the arena (parked vans «буханка», and
 * any future scenery). Pure tuning data — BattleScene reads it and spawns sprites.
 *
 * Coordinates and scale are authored against a fixed **reference resolution**
 * ({@link DECOR_REF_SIZE} — the pixel size every `bg_<levelId>` currently ships
 * at) and re-scaled at runtime to the level's actual arena-texture size. So a
 * point you pick in an image editor over the 1024² level art lands in the exact
 * same spot even if a level's background is later exported at a different
 * resolution — the placement always follows the texture's scale.
 *
 * `x`/`y` is the CENTER of the sprite in reference space.
 */
export interface DecorObject {
  /** Asset key (file name without extension): 'buhanka_1' or 'buhanka'. */
  readonly texture: string;
  /** Center X in reference space (0..DECOR_REF_SIZE). */
  readonly x: number;
  /** Center Y in reference space (0..DECOR_REF_SIZE). */
  readonly y: number;
  /** Scale at the reference resolution (auto-adjusted to the real texture size). */
  readonly scale: number;
  /**
   * If set, `texture` is an **animated WebP** (`assets/sprites/<texture>.webp`)
   * played on a loop instead of a still PNG. Decoded frame-by-frame at runtime
   * (see {@link ../ui/AnimatedDecor}); the `scale` is applied to the frame size.
   */
  readonly animated?: boolean;
  /**
   * Draw a soft grounded shadow ellipse under the prop (same look as the enemy
   * tokens). Currently honoured for animated props (see {@link ../ui/AnimatedDecor}).
   */
  readonly shadow?: boolean;
  /**
   * Draw order **relative to enemies**. The prop is sorted into the same layer as
   * the enemies, whose sort key is their board Y (≈0 at the top of the map ..
   * ≈DECOR_REF_SIZE at the bottom). Higher = closer to the camera. Omit for the
   * default {@link DECOR_Z_FRONT} (in front of every enemy). Use
   * {@link DECOR_Z_BACK} to sit behind every enemy — e.g. a prop parked at the
   * top of the map that marching enemies should pass in front of. Or set it to
   * the prop's own `y` to depth-sort it among the enemies.
   */
  readonly z?: number;
}

/**
 * Resolution the `x`/`y`/`scale` numbers below are authored against. Every level
 * background is 1024×1024, so pixels picked over that art map 1:1 here. At
 * runtime BattleScene multiplies by `arenaW / DECOR_REF_SIZE`.
 */
export const DECOR_REF_SIZE = 1024;

/** `z` value that draws a prop in front of every enemy (the default). */
export const DECOR_Z_FRONT = 1_000_000;
/** `z` value that draws a prop behind every enemy (top-of-map scenery). */
export const DECOR_Z_BACK = -1;

/** Shared default van placement, reused by every level entry below. */
const DEFAULT_BUHANKA: DecorObject = { texture: 'buhanka_1', x: 733, y: 923, scale: 0.6 };

/**
 * One list of decor objects per campaign level. Add more entries to a level's
 * array to place several props; an empty array (or a missing level) means none.
 * Example with two props, one behind the enemies at the top of the map:
 *   lvl_3: [
 *     { texture: 'buhanka_1', x: 693, y: 923, scale: 0.6 },                    // front (default)
 *     { texture: 'buhanka',   x: 300, y: 180, scale: 0.4, z: DECOR_Z_BACK },   // behind enemies
 *   ],
 */
export const LEVEL_DECOR: Record<string, DecorObject[]> = {
  lvl_1: [{ ...DEFAULT_BUHANKA }],
  // Level 2 also parks a looping animated character (decor.webp) beside the van.
  lvl_2: [
    { texture: 'decor', x: 875, y: 845, scale: 0.35, animated: true, shadow: true },
    { ...DEFAULT_BUHANKA },
  ],
  lvl_3: [{ ...DEFAULT_BUHANKA }],
  lvl_4: [{ ...DEFAULT_BUHANKA }],
  lvl_5: [{ ...DEFAULT_BUHANKA }],
  lvl_6: [{ ...DEFAULT_BUHANKA }],
  lvl_7: [{ ...DEFAULT_BUHANKA }],
  lvl_8: [{ ...DEFAULT_BUHANKA }],
  lvl_9: [{ ...DEFAULT_BUHANKA }],
  lvl_10: [{ ...DEFAULT_BUHANKA }],
  lvl_11: [{ ...DEFAULT_BUHANKA }],
  lvl_12: [{ ...DEFAULT_BUHANKA }],
};

/** Decor objects for a level, or the shared default van for any unlisted id. */
export function decorForLevel(levelId: string): DecorObject[] {
  return LEVEL_DECOR[levelId] ?? [{ ...DEFAULT_BUHANKA }];
}
