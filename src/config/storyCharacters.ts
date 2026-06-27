import type { ElementId } from '../theme';
import { tData } from '../core/i18n';

/**
 * Story characters + per-level mission cast (the "who" of the cutscene/dialogue
 * subsystem; the "what they say" lives in config/dialogue.ts, the "where it
 * plays" in config/cutscenes.ts).
 *
 * Project rule (data ≠ rendering): this is hand-authored content, like
 * config/tutorial.ts — the visual-novel DialogueOverlay and CutsceneScene only
 * read it. Add a new speaker here, then reference its `id` from a dialogue line.
 *
 * Localization: display names are routed through {@link characterName} →
 * `tData('story.char.<id>', name)`. The `name` below is the source string (RU,
 * the default locale); a future English pass adds `story.char.<id>` overrides to
 * the i18n catalog. Line text is localized the same way (see config/dialogue.ts).
 */

/** Where a portrait stands on screen in the dialogue box. */
export type Side = 'left' | 'right' | 'center';

export interface StoryCharacter {
  /** Stable id referenced by dialogue lines + MISSION_CHARACTERS. */
  readonly id: string;
  /** Display name shown on the speaker plate (RU source; localizable). */
  readonly name: string;
  /** Sprite asset key (a transparent cut-out figure). Omit for the narrator. */
  readonly assetKey?: string;
  /** Side this character stands on by default (a line may override it). */
  readonly homeSide: Side;
  /** Element accent that tints the name plate + portrait rim glow. */
  readonly accent?: ElementId;
  /**
   * Narrator: no portrait, name plate hidden, text shown as detached narration.
   * Used for scene-setting lines inside a cutscene.
   */
  readonly narrator?: boolean;
}

/** Special id for narration lines (no portrait / no name plate). */
export const NARRATOR_ID = 'narrator';

export const STORY_CHARACTERS: Record<string, StoryCharacter> = {
  // --- core cast ---
  narrator: { id: 'narrator', name: '', homeSide: 'center', narrator: true },
  mech: { id: 'mech', name: 'Механик', assetKey: 'char_mech', homeSide: 'right', accent: 'Physical' },
  coder: { id: 'coder', name: 'Кодер', assetKey: 'char_coder', homeSide: 'right', accent: 'Fire' },
  matriarch: { id: 'matriarch', name: 'Матриарх', assetKey: 'char_matriarch', homeSide: 'left', accent: 'Energy' },
  // The last human who codes without AI; reuses the tutorial-advisor portrait.
  senior: { id: 'senior', name: 'Последний Сеньор', assetKey: 'advisor_klodouglas', homeSide: 'center', accent: 'Water' },

  // --- per-level division heads (full-body NPC portraits) ---
  boss_main: { id: 'boss_main', name: 'Мейн', assetKey: 'enemy_boss_main', homeSide: 'left', accent: 'Physical' },
  boss_duck: { id: 'boss_duck', name: 'Дакки', assetKey: 'enemy_boss_duck', homeSide: 'left', accent: 'Water' },
  boss_olivia: { id: 'boss_olivia', name: 'Оливия', assetKey: 'enemy_boss_olivia', homeSide: 'left', accent: 'Electricity' },
  boss_fijin: { id: 'boss_fijin', name: 'Фиджин', assetKey: 'enemy_boss_fijin', homeSide: 'left', accent: 'Energy' },
  boss_tacticool: { id: 'boss_tacticool', name: 'Тактикул', assetKey: 'enemy_boss_tacticool', homeSide: 'left', accent: 'Fire' },
  boss_hotel: { id: 'boss_hotel', name: 'Хотэл', assetKey: 'enemy_boss_hotel', homeSide: 'left', accent: 'Water' },
  boss_rr: { id: 'boss_rr', name: 'Эр-Эр', assetKey: 'enemy_boss_rr', homeSide: 'left', accent: 'Physical' },
};

/** Look up a character (falls back to a bare narrator-less stub for unknown ids). */
export function getStoryCharacter(id: string): StoryCharacter {
  return STORY_CHARACTERS[id] ?? { id, name: id, homeSide: 'center' };
}

/** Localized display name for a character id. */
export function characterName(id: string): string {
  const c = STORY_CHARACTERS[id];
  if (!c) return id;
  return tData(`story.char.${id}`, c.name);
}

/**
 * Per-level mission cast — the division head(s) the heroes meet on each level
 * (the brief asks for these to be pulled "from mission_characters"). The
 * mission-brief / victory dialogue scripts (config/dialogue.ts) reference these
 * ids. A level with no entry simply plays no mission dialogue.
 *
 * Flavor: each head runs some department of the old world that the heroes must
 * save from monsters leaking out of unpatched games (klevak's vibecoded virus).
 */
export const MISSION_CHARACTERS: Record<string, string[]> = {
  lvl_1: ['boss_main'], // главный сервер района
  lvl_2: ['boss_duck'], // отдел тестирования (rubber-duck debug)
  lvl_3: ['boss_olivia'], // комьюнити и локализация
  lvl_4: ['boss_fijin'], // нетокод и серверы
  lvl_5: ['boss_tacticool'], // боевой отдел / шутерный полигон
  lvl_6: ['boss_hotel'], // хостинг и дата-центр
  lvl_7: ['boss_rr'], // релизы и откаты
};

/** The primary division head for a level, or undefined if the level has none. */
export function missionBoss(levelId: string): string | undefined {
  return MISSION_CHARACTERS[levelId]?.[0];
}
