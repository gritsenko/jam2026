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
   * Voice-bark audio key played once when this character opens in a dialogue
   * (the first line of a speaker turn). File lives at assets/audio/heroes/<key>.mp3
   * (key = basename); registered in config/audioManifest.ts. Omit for silent ones.
   */
  readonly voiceKey?: string;
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
  mech: { id: 'mech', name: 'Механик', assetKey: 'char_mech', homeSide: 'left', accent: 'Physical' },
  coder: { id: 'coder', name: 'Кодер', assetKey: 'char_coder', homeSide: 'left', accent: 'Fire' },
  matriarch: { id: 'matriarch', name: 'Матриарх', assetKey: 'char_matriarch', homeSide: 'left', accent: 'Energy' },
  // The Last Senior — the human who codes by hand. He IS the lvl_7 boss: this
  // talking portrait (char_senior) shows in the lvl_7 taunt/victory + the finale
  // epilogue; his battle token uses the enemy_boss_main sprite (see enemies.json).
  senior: { id: 'senior', name: 'Последний Сеньор', assetKey: 'char_senior', homeSide: 'right', accent: 'Water' },
  // Lead-admin "tech support" — the intro-skip Easter egg guilt-trips you with him.
  support: { id: 'support', name: 'Доктор Фрост', assetKey: 'char_support', homeSide: 'center', accent: 'Physical', voiceKey: 'support' },
  // Defeat-screen Easter egg: a deadpan quote-author who consoles you on a loss
  // with a (cleaned) absurd aphorism (config/quotes.ts). Stands center, alone.
  jason: { id: 'jason', name: 'Джейсон Максютин', assetKey: 'char_jason', homeSide: 'center', accent: 'Physical' },

  // --- per-level division heads / briefers -----------------------------------
  // Run the mission brief and (mostly) thank the heroes on a clear. Portraits cut
  // from docs/visual_refs/visual_sources (see asset manifest). Distinct from the
  // level *bosses* (the villains below). klevak is the odd one out: the vibecoder
  // who caused the whole mess — he briefs lvl_1 sheepishly, not as a helper.
  klevak: { id: 'klevak', name: 'PRO Gamedev', assetKey: 'char_klevak', homeSide: 'right', accent: 'Fire', voiceKey: 'klevak' },
  finance: { id: 'finance', name: 'Казначей', assetKey: 'char_finance', homeSide: 'right', accent: 'Energy' },
  teodor: { id: 'teodor', name: 'Теодор Легенда', assetKey: 'char_teodor', homeSide: 'right', accent: 'Physical', voiceKey: 'TeodorLegenda' },
  // Freed from NPC duty — Доктор Сайенс is one of OUR heroes now (hero side: left).
  science: { id: 'science', name: 'Доктор Сайенс', assetKey: 'char_science', homeSide: 'left', accent: 'Water' },
  strateg: { id: 'strateg', name: 'Стратег', assetKey: 'char_strateg', homeSide: 'right', accent: 'Electricity' },
  voevoda: { id: 'voevoda', name: 'Воевода', assetKey: 'char_voevoda', homeSide: 'right', accent: 'Energy', voiceKey: 'war' },
  khatenkov: { id: 'khatenkov', name: 'Тактик', assetKey: 'char_khatenkov', homeSide: 'right', accent: 'Fire', voiceKey: 'khatenkoff' },
  vadim: { id: 'vadim', name: 'Вадим', assetKey: 'char_vadim', homeSide: 'right', accent: 'Water', voiceKey: 'vadim' },
  // president: freed — no longer a level head (kept for possible reuse).
  president: { id: 'president', name: 'Президент', assetKey: 'char_president', homeSide: 'right', accent: 'Physical' },

  // --- per-level bosses (the VILLAINS — monsters escaped from old games) -----
  // Reuse the enemy_boss_* battle art. They stay SILENT during the brief, taunt
  // the player when their finale wave spawns, and flee on death (config/dialogue.ts).
  // NB: the lvl_7 villain is the `senior` character above (the Last Senior). The
  // boss_main *enemy* (renamed "Senior" in enemies.json) is just his battle token,
  // so there is no boss_main story entry here. lvl_1's villain is now Эр-Эр.
  boss_duck: { id: 'boss_duck', name: 'Дакки', assetKey: 'enemy_boss_duck', homeSide: 'right', accent: 'Water' },
  boss_olivia: { id: 'boss_olivia', name: 'Оливия', assetKey: 'enemy_boss_olivia', homeSide: 'right', accent: 'Electricity', voiceKey: 'olivia' },
  boss_fijin: { id: 'boss_fijin', name: 'Фиджин', assetKey: 'enemy_boss_fijin', homeSide: 'right', accent: 'Energy' },
  boss_tacticool: { id: 'boss_tacticool', name: 'Тактикул', assetKey: 'enemy_boss_tacticool', homeSide: 'right', accent: 'Fire' },
  boss_hotel: { id: 'boss_hotel', name: 'Хотэл', assetKey: 'enemy_boss_hotel', homeSide: 'right', accent: 'Water' },
  boss_rr: { id: 'boss_rr', name: 'Эр-Эр', assetKey: 'enemy_boss_rr', homeSide: 'right', accent: 'Physical' },
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
 * Per-level division head — the positive NPC the heroes HELP on each level. Runs
 * the mission brief and thanks the player on a clear (config/dialogue.ts). A
 * level with no entry simply plays no head dialogue.
 *
 * Flavor: each head runs some department of the old world that the heroes must
 * save from monsters leaking out of unpatched games (klevak's vibecoded virus).
 */
export const MISSION_CHARACTERS: Record<string, string> = {
  lvl_1: 'klevak', // вайбкодер, который всё и сломал — кается на брифе
  lvl_2: 'finance', // казначей — последний ручной бюджет мира
  lvl_3: 'strateg', // комьюнити и локализация
  lvl_4: 'voevoda', // оборона нетокода / фронт серверов
  lvl_5: 'khatenkov', // боевой отдел / шутерный полигон
  lvl_6: 'vadim', // хостинг и дата-центр
  lvl_7: 'teodor', // держит дверь к Последнему Сеньору
};

/**
 * The villain boss the heroes FIGHT on each level (silent at brief, taunts + flees).
 * Most reuse their enemy_boss_* sprite as the talking portrait; the lvl_7 villain is
 * the Last Senior (`senior`, portrait char_senior), whose battle token is boss_main.
 */
export const LEVEL_VILLAINS: Record<string, string> = {
  lvl_1: 'boss_rr',
  lvl_2: 'boss_duck',
  lvl_3: 'boss_olivia',
  lvl_4: 'boss_fijin',
  lvl_5: 'boss_tacticool',
  lvl_6: 'boss_hotel',
  lvl_7: 'senior', // talking head = the Last Senior; battle enemy = boss_main
};

/** The division head for a level, or undefined if the level has none. */
export function missionHead(levelId: string): string | undefined {
  return MISSION_CHARACTERS[levelId];
}

/** The boss villain for a level, or undefined if the level has none. */
export function levelVillain(levelId: string): string | undefined {
  return LEVEL_VILLAINS[levelId];
}
