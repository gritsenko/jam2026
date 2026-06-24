import type { LevelNode } from './types';

/**
 * World-map nodes. Positions are normalized 0..1 in portrait design space and
 * traced as a winding canyon path. Order here is the campaign order (the linear
 * gate). Lock/clear state + stars are computed live from saved progress (see
 * src/game/progress.ts) — not stored on the node.
 */
export const LEVELS: LevelNode[] = [
  { id: 'lvl_1', name: 'Sunbaked Gulch', nx: 0.28, ny: 0.82 },
  { id: 'lvl_2', name: 'Rusted Spillway', nx: 0.62, ny: 0.72 },
  { id: 'lvl_3', name: 'Static Mesa', nx: 0.4, ny: 0.6 },
  { id: 'lvl_4', name: 'Ember Hollow', nx: 0.7, ny: 0.49 },
  { id: 'lvl_5', name: 'Glass Dunes', nx: 0.34, ny: 0.39 },
  { id: 'lvl_6', name: 'Coolant Ridge', nx: 0.64, ny: 0.28 },
  { id: 'lvl_7', name: 'Overload Spire', nx: 0.46, ny: 0.16 },
];
