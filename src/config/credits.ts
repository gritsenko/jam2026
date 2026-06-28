/**
 * End-credits roll content (the scrolling list shown between the finale beats and
 * the post-credits sting). Rendered by {@link import('../scenes/CutsceneScene').CutsceneScene}
 * when a cutscene shot has `kind: 'credits'` (see config/cutscenes.ts).
 *
 * Data ≠ rendering: this is hand-authored content like config/dialogue.ts — the
 * scene only reads it. Edit the lines below to taste; the roll auto-sizes to fit.
 *
 * Line kinds:
 *  - `title`  — big gold heading (the game name).
 *  - `header` — section label (e.g. КОД / АРТ).
 *  - `name`   — a credited line under a header.
 *  - `note`   — small dim aside (italic).
 *  - `gap`    — vertical spacing (optional `size`, in design px).
 *
 * NB: text is RU (the game's default locale), matching config/dialogue.ts sources.
 * ↓↓↓ EDIT THE TEAM SECTION with the real names. ↓↓↓
 */
export type CreditLine =
  | { readonly kind: 'title'; readonly text: string }
  | { readonly kind: 'header'; readonly text: string }
  | { readonly kind: 'name'; readonly text: string }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'gap'; readonly size?: number };

export const CREDITS: readonly CreditLine[] = [
  { kind: 'gap', size: 40 },
  { kind: 'title', text: 'BUHANKA 3000 TOWER DEFENSE' },
  { kind: 'note', text: '«Буханка 3000» — в поисках последнего сеньора' },

  { kind: 'gap' },
  { kind: 'header', text: 'КОД' },
  { kind: 'name', text: 'КЛОД' },
  { kind: 'name', text: '(вообще без вайба)' },

  { kind: 'gap' },
  { kind: 'header', text: 'АРТ' },
  { kind: 'name', text: 'AssetLab Magic Studio и куча ручного труда' },

  { kind: 'gap' },
  { kind: 'header', text: 'ЗВУК' },
  { kind: 'name', text: 'Украден или сгенерён' },

  { kind: 'gap' },
  { kind: 'header', text: 'ИСТОРИЯ И ДИЗАЙН' },
  { kind: 'name', text: 'Команда «Буханки»' },

  // ↓↓↓ EDIT ME — впишите реальную команду и роли ↓↓↓
  { kind: 'gap' },
  { kind: 'header', text: 'КОМАНДА' },
  { kind: 'name', text: 'ДобровSky, PapleVKa, GritsenOK, NikitKING' },
  // ↑↑↑ EDIT ME ↑↑↑

  { kind: 'gap' },
  { kind: 'header', text: 'ОСОБАЯ БЛАГОДАРНОСТЬ' },
  { kind: 'name', text: 'Последнему Сеньору — за то, что вернулся' },
  { kind: 'name', text: 'Ивана Клевакичева — за то, что всё сломал' },
  { kind: 'name', text: 'Челу на заднем сиденье' },

  { kind: 'gap' },
  { kind: 'note', text: 'Сделано на PixiJS + TypeScript' },
  { kind: 'note', text: 'для Game Jam 2026 © MY.GAMES' },
  { kind: 'note', text: 'Ни облака. Ни вайба. По-человечески.' },

  { kind: 'gap', size: 80 },
  { kind: 'title', text: 'Спасибо, что играли' },
  { kind: 'gap', size: 120 },
];
