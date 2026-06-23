import type { LevelNode } from './types';

/**
 * World-map nodes (mock). Positions are normalized 0..1 in portrait design space
 * and traced as a winding canyon path. State drives node art + interactivity.
 */
export const LEVELS: LevelNode[] = [
  { id: 'lvl_1', name: 'Sunbaked Gulch', nx: 0.28, ny: 0.82, state: 'cleared' },
  { id: 'lvl_2', name: 'Rusted Spillway', nx: 0.62, ny: 0.72, state: 'cleared' },
  { id: 'lvl_3', name: 'Static Mesa', nx: 0.4, ny: 0.6, state: 'available' },
  { id: 'lvl_4', name: 'Ember Hollow', nx: 0.7, ny: 0.49, state: 'locked' },
  { id: 'lvl_5', name: 'Glass Dunes', nx: 0.34, ny: 0.39, state: 'locked' },
  { id: 'lvl_6', name: 'Coolant Ridge', nx: 0.64, ny: 0.28, state: 'locked' },
  { id: 'lvl_7', name: 'Overload Spire', nx: 0.46, ny: 0.16, state: 'locked' },
];
