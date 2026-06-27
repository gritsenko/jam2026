// App-wide admin DOM tools (config picker). Survives scene transitions.

import type { LayoutInfo, Rect } from '../core/ResponsiveLayout';
import { GameConfigPicker } from './GameConfigPicker';
import * as progress from '../game/progress';

/** Approximate CONFIG block height in logical px (caption + gap + select). */
export const CONFIG_BLOCK_H = 72;
/** Checkbox row height + gap in logical px. */
export const ADMIN_ROW_H = 46;
/** Inset from safe-area edges in logical px. */
export const ADMIN_EDGE = 16;

/**
 * Horizontal origin of the world-map admin column (logical px).
 * Increase to move right; decrease to move left.
 */
export const WORLDMAP_ADMIN_X = ADMIN_EDGE + 8;

let picker: GameConfigPicker | null = null;

/** Singleton config picker — not tied to a single scene lifecycle. */
export function getConfigPicker(): GameConfigPicker {
  if (!picker) picker = new GameConfigPicker();
  return picker;
}

/** Left edge of ADMIN / Sell Towers / CONFIG on the world-map screen. */
export function worldMapAdminColumnX(safe: Rect): number {
  return safe.x + WORLDMAP_ADMIN_X;
}

export function hideConfigPicker(): void {
  getConfigPicker().setVisible(false);
}

/**
 * Clamps to the viewport so the dropdown never spills off-screen.
 */
export function layoutConfigPickerAt(info: LayoutInfo, logicalX: number, logicalY: number): void {
  const p = getConfigPicker();
  const admin = progress.isAdmin();
  p.setVisible(admin);
  if (!admin) return;

  const { scale, offsetX, offsetY, screenW, screenH, safe } = info;
  const x = logicalX * scale + offsetX;
  const y = logicalY * scale + offsetY;
  p.layout(x, y);
  p.clampToViewport(screenW, screenH, safeBoundsInScreenPx(safe, scale, offsetX, offsetY));
}

/**
 * World-map placement for the config picker: top-right corner, just below the
 * mute button. {@link layoutConfigPickerAt} clamps to the safe area, so pushing
 * the origin past the right edge right-aligns the block — i.e. higher and to the
 * right of the admin checkbox column.
 */
export function layoutWorldMapConfigPicker(info: LayoutInfo): void {
  const { safe } = info;
  layoutConfigPickerAt(info, safe.x + safe.width, safe.y + 96);
}

function safeBoundsInScreenPx(
  safe: Rect,
  scale: number,
  offsetX: number,
  offsetY: number,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: safe.x * scale + offsetX,
    top: safe.y * scale + offsetY,
    right: (safe.x + safe.width) * scale + offsetX,
    bottom: (safe.y + safe.height) * scale + offsetY,
  };
}

export function destroyConfigPicker(): void {
  picker?.destroy();
  picker = null;
}
