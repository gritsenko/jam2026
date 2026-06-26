/**
 * Tiny dependency-free localization layer ("pure Pixi + TS" — no i18n library).
 *
 * Design:
 *  - The active language is fixed at module load from localStorage (default `ru`);
 *    changing it persists the choice and reloads the page. Pixi Text objects are
 *    built once per scene, so a reload is the simplest way to re-render everything
 *    in the new language without threading reactivity through every component.
 *  - `t(key, params)` looks up a UI string in the active catalog, falling back to
 *    English then to the key itself, and substitutes `{name}` placeholders.
 *  - `tData(key, fallback)` localizes *content* strings that live in the game
 *    config JSON (card names/blurbs, level names, reaction names, element labels).
 *    English is the source language for that data, so `en` simply returns the
 *    JSON `fallback`; only Russian overrides are stored in the catalog below.
 *
 * Only this module depends on the catalog; everything else calls `t`/`tData` and
 * the typed helpers (elementLabel, cardShortName, …) at the bottom of the file.
 */

import { ELEMENTS, type ElementId } from '../theme';
import { STRINGS } from './i18n.strings';

export type Lang = 'ru' | 'en';

/** Selectable languages, in picker order. `label` is shown in the language switch. */
export const LANGS: { readonly id: Lang; readonly label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
];

const STORAGE_KEY = 'sgtd.lang';
const DEFAULT_LANG: Lang = 'ru';

function isLang(v: unknown): v is Lang {
  return v === 'ru' || v === 'en';
}

/** Read the persisted choice (browser only). Returns null if none/unavailable. */
function storedLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

let current: Lang = storedLang() ?? DEFAULT_LANG;

/** The active language for this load (fixed until a reload). */
export function getLang(): Lang {
  return current;
}

/** True once the player has made an explicit choice (vs. running on the default). */
export function hasChosenLang(): boolean {
  return storedLang() !== null;
}

/**
 * Persist a language choice and (by default) reload so every scene re-renders in
 * it. Pass `reload = false` only when the caller will navigate/rebuild itself.
 */
export function setLang(lang: Lang, reload = true): void {
  current = lang;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private mode — keep the in-memory choice for this session */
    }
    if (reload) window.location.reload();
  }
}

/** Interpolate `{name}` placeholders from `params` into `s`. */
function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  let out = s;
  for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Localize a UI string by key (active lang → English → key), with interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  const s = STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key;
  return interpolate(s, params);
}

/**
 * Localize a *content* string that lives in the config JSON. English is the source
 * (returns `fallback`); other languages return their catalog override or fall back
 * to the source value when a translation is missing.
 */
export function tData(key: string, fallback: string): string {
  if (current === 'en') return fallback;
  return STRINGS[current]?.[key] ?? fallback;
}

// --- Typed content helpers (used by config accessors + UI) -------------------

/** Element brand label (FIRE / FROST / …) localized; falls back to theme label. */
export function elementLabel(e: ElementId): string {
  return tData(`element.${e}`, ELEMENTS[e].label);
}

/** Stat abbreviation shown in tower readouts (DMG / RNG / SPD / DEF). */
export function statLabel(stat: string): string {
  return t(`stat.${stat}`);
}

/** Merge-grade tag, e.g. "Lv2" / "Ур2". */
export function gradeLabel(n: number): string {
  return t('grade.lv', { n });
}

export function cardShortName(id: string, fallback: string): string {
  return tData(`card.${id}.short`, fallback);
}

export function cardBlurb(id: string, fallback: string): string {
  return tData(`card.${id}.blurb`, fallback);
}

/** Localize a synergy-slot effect label (keyed by its English label). */
export function slotEffectLabel(label: string): string {
  return tData(`fx.slot.${label}`, label);
}

export function levelName(id: string, fallback: string): string {
  return tData(`level.${id}`, fallback);
}

export function reactionName(id: string, fallback: string): string {
  return tData(`reaction.${id}.name`, fallback);
}

export function reactionBlurb(id: string, fallback: string): string {
  return tData(`reaction.${id}.blurb`, fallback);
}

/** Onboarding lesson title for a lesson id (see config/tutorial.ts). */
export function tutorialTitle(id: string): string {
  return t(`tutorial.${id}.title`);
}

/** Onboarding lesson body (paragraphs already joined with blank lines). */
export function tutorialBody(id: string): string {
  return t(`tutorial.${id}.body`);
}
