import type { ElementId } from '../theme';

/**
 * Per-level onboarding lessons (docs/done/tutorial-modals.md). Data lives apart
 * from rendering (project rule): the registry below is hand-authored (texts +
 * art are curated), while its order/composition mirrors the progression delta in
 * §2 of the spec — each level introduces a tower and/or a mechanic, and the
 * lesson is shown the first time that thing becomes playable.
 */

/** How to illustrate a lesson: a ready sprite by key, or a scripted in-engine demo (§6). */
export type LessonArt =
  | { kind: 'sprite'; assetKey: string }
  | {
      kind: 'demo';
      demoId: TutorialDemoId;
      /** Thematic sprite shown if the demo can't be built (defensive fallback). */
      fallbackKey?: string;
    };

export type TutorialDemoId = 'merge' | 'synergy' | 'resonance' | 'energy';

export interface TutorialLesson {
  /** Stable id — the "seen" key in progress AND the i18n key. DO NOT reuse after release. */
  readonly id: string;
  readonly type: 'basics' | 'mechanic' | 'tower';
  readonly art: LessonArt;
  /** Element used to tint the frame / glow (optional). */
  readonly accent?: ElementId;
}

/**
 * Lessons per level, in show order. Key = levelId from levels.ts.
 *
 * Titles and bodies are NOT stored here — they're localized strings keyed by the
 * lesson `id` in the i18n catalog (`tutorial.<id>.title` / `.body`, see
 * core/i18n.strings.ts). The modal resolves them via tutorialTitle/tutorialBody.
 */
export const TUTORIALS: Record<string, readonly TutorialLesson[]> = {
  lvl_1: [
    { id: 'basics_place', type: 'basics', art: { kind: 'sprite', assetKey: 'plasma_shutter' }, accent: 'Fire' },
    { id: 'basics_synergy', type: 'basics', art: { kind: 'demo', demoId: 'synergy', fallbackKey: 'plasma_shutter' } },
    { id: 'basics_energy', type: 'basics', art: { kind: 'demo', demoId: 'energy', fallbackKey: 'icon_reactor' }, accent: 'Fire' },
  ],
  lvl_2: [
    { id: 'tower_storm_coil', type: 'tower', art: { kind: 'sprite', assetKey: 'storm_coil' }, accent: 'Electricity' },
  ],
  lvl_3: [
    { id: 'mech_merge', type: 'mechanic', art: { kind: 'demo', demoId: 'merge', fallbackKey: 'storm_coil' } },
    { id: 'mech_crystals', type: 'mechanic', art: { kind: 'sprite', assetKey: 'icon_crystal' }, accent: 'Water' },
    { id: 'mech_reroll', type: 'mechanic', art: { kind: 'sprite', assetKey: 'icon_crystal' } },
  ],
  lvl_4: [
    { id: 'mech_resonance', type: 'mechanic', art: { kind: 'demo', demoId: 'resonance', fallbackKey: 'enemy_disruptor' } },
  ],
  lvl_5: [
    { id: 'tower_railgun', type: 'tower', art: { kind: 'sprite', assetKey: 'railgun' }, accent: 'Physical' },
    { id: 'tower_grid_stabilizer', type: 'tower', art: { kind: 'sprite', assetKey: 'grid_stabilizer' }, accent: 'Energy' },
    { id: 'mech_overload', type: 'mechanic', art: { kind: 'sprite', assetKey: 'icon_reactor' }, accent: 'Fire' },
  ],
  lvl_6: [
    { id: 'tower_shield_generator', type: 'tower', art: { kind: 'sprite', assetKey: 'shield_generator' }, accent: 'Energy' },
    { id: 'mech_interrupt', type: 'mechanic', art: { kind: 'sprite', assetKey: 'enemy_disruptor' } },
    { id: 'mech_mod_cards', type: 'mechanic', art: { kind: 'sprite', assetKey: 'isolation_circuit' }, accent: 'Energy' },
  ],
  lvl_7: [
    { id: 'mech_fusion', type: 'mechanic', art: { kind: 'sprite', assetKey: 'steam_cannon' } },
  ],
};

/**
 * Lessons for a level that have not been shown yet. Purely "seen"-gated: a lesson
 * is dropped once the player has acknowledged it, and never reappears — Admin mode
 * does NOT force replays (only RESET PROGRESS clears `seen` and re-arms them).
 */
export function pendingLessons(
  levelId: string,
  seen: ReadonlySet<string>,
): readonly TutorialLesson[] {
  const all = TUTORIALS[levelId] ?? [];
  return all.filter((l) => !seen.has(l.id));
}
