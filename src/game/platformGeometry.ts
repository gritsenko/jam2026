// Pure platform/grid geometry — no Pixi. Single source for the 3×3 slot layout so
// the headless bot (sim/bot) reasons about tower positions/range identically to the
// rendered PlatformGrid. Mirrors how BattleScene places the grid: a grid built at
// GRID_BASE_SIZE, centered in the arena, scaled to span PLATFORM_FRAC of arenaW.

/** Size the PlatformGrid is constructed at (BattleScene: `new PlatformGrid(assets, 720)`). */
export const GRID_BASE_SIZE = 720;

/** Fraction of arena width the platform spans (BattleScene `PLATFORM_FRAC`). */
export const PLATFORM_FRAC = 0.5;

export interface GridMetrics {
  gap: number;
  cell: number;
  step: number;
}

/** Cell/gap/step for a grid built at `size` (matches PlatformGrid constructor). */
export function gridMetrics(size: number): GridMetrics {
  const gap = size * 0.035;
  const cell = (size * 0.78 - gap * 2) / 3;
  return { gap, cell, step: cell + gap };
}

/** Slot center offset from the grid center, in grid-local space. */
export function slotLocalOffset(index: number, step: number): { x: number; y: number } {
  const c = index % 3;
  const r = Math.floor(index / 3);
  return { x: (c - 1) * step, y: (r - 1) * step };
}

export interface PlatformLayout {
  cellWorldSize: number;
  slotPos(index: number): { x: number; y: number };
}

/**
 * Resolve the in-arena platform layout for a given arena width/height, exactly as
 * BattleScene does: grid centered at (arenaW/2, arenaH/2), scaled so the base-720
 * grid spans PLATFORM_FRAC·arenaW. Returns the world cell size and slot centers in
 * arena-pixel space (the same space BattleSim's path lives in).
 */
export function platformLayout(arenaW: number, arenaH: number): PlatformLayout {
  const { cell, step } = gridMetrics(GRID_BASE_SIZE);
  const scale = (arenaW * PLATFORM_FRAC) / GRID_BASE_SIZE;
  const cx = arenaW * 0.5;
  const cy = arenaH * 0.5;
  return {
    cellWorldSize: cell * scale,
    slotPos(index: number) {
      const o = slotLocalOffset(index, step);
      return { x: cx + o.x * scale, y: cy + o.y * scale };
    },
  };
}
