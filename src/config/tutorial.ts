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
  /** Stable id — the "seen" key in progress. DO NOT reuse after release. */
  readonly id: string;
  readonly type: 'basics' | 'mechanic' | 'tower';
  readonly title: string;
  /** 1–3 short paragraphs. No filler — the modal reads in a couple of seconds. */
  readonly body: readonly string[];
  readonly art: LessonArt;
  /** Element used to tint the frame / glow (optional). */
  readonly accent?: ElementId;
}

/** Lessons per level, in show order. Key = levelId from levels.ts. */
export const TUTORIALS: Record<string, readonly TutorialLesson[]> = {
  lvl_1: [
    {
      id: 'basics_place',
      type: 'basics',
      title: 'Ставь турели',
      body: ['Перетащи карту из руки на пустой слот платформы 3×3.'],
      art: { kind: 'sprite', assetKey: 'plasma_shutter' },
      accent: 'Fire',
    },
    {
      id: 'basics_synergy',
      type: 'basics',
      title: 'Соседи усиливают',
      body: ['Башня баффает ортогональных соседей по сетке. Ставь рядом — не вразброс.'],
      art: { kind: 'demo', demoId: 'synergy', fallbackKey: 'plasma_shutter' },
    },
    {
      id: 'basics_energy',
      type: 'basics',
      title: 'Энергия и ядро',
      body: [
        'Каждая башня грузит энергосеть (шкала сверху).',
        'Прорвавшийся враг бьёт Core Integrity — потеряешь ядро, проиграешь.',
      ],
      art: { kind: 'demo', demoId: 'energy', fallbackKey: 'icon_reactor' },
      accent: 'Fire',
    },
  ],
  lvl_2: [
    {
      id: 'tower_storm_coil',
      type: 'tower',
      title: 'Гроза',
      body: ['Цепная молния — бьёт по группе врагов, перепрыгивая между целями.'],
      art: { kind: 'sprite', assetKey: 'storm_coil' },
      accent: 'Electricity',
    },
  ],
  lvl_3: [
    {
      id: 'mech_merge',
      type: 'mechanic',
      title: 'Мердж',
      body: ['Две одинаковые карты сливаются в грейд повыше: I+I→II в руке, II+II→III на поле.'],
      art: { kind: 'demo', demoId: 'merge', fallbackKey: 'storm_coil' },
    },
    {
      id: 'mech_crystals',
      type: 'mechanic',
      title: 'Кристаллы',
      body: ['Идеальная зачистка волны и элитные враги роняют кристаллы — премиум-валюта.'],
      art: { kind: 'sprite', assetKey: 'icon_crystal' },
      accent: 'Water',
    },
    {
      id: 'mech_reroll',
      type: 'mechanic',
      title: 'Реролл руки',
      body: ['Не нравится добор? Перекрути руку за кристаллы. Цена растёт за волну.'],
      art: { kind: 'sprite', assetKey: 'icon_crystal' },
    },
  ],
  lvl_4: [
    {
      id: 'mech_resonance',
      type: 'mechanic',
      title: 'Резонанс',
      body: [
        'Соседи Grade II+ разных стихий запускают реакцию:',
        'Паровой Выброс (Огонь+Вода), Сверхпроводимость (Вода+Ток), Шрапнель (Огонь+Физика).',
      ],
      art: { kind: 'demo', demoId: 'resonance', fallbackKey: 'enemy_disruptor' },
    },
  ],
  lvl_5: [
    {
      id: 'tower_railgun',
      type: 'tower',
      title: 'Рельсотрон',
      body: ['Пробивающий луч — шьёт всю линию врагов насквозь.'],
      art: { kind: 'sprite', assetKey: 'railgun' },
      accent: 'Physical',
    },
    {
      id: 'tower_grid_stabilizer',
      type: 'tower',
      title: 'Стабилизатор',
      body: ['Поддержка: разгоняет темп соседних башен.'],
      art: { kind: 'sprite', assetKey: 'grid_stabilizer' },
      accent: 'Energy',
    },
    {
      id: 'mech_overload',
      type: 'mechanic',
      title: 'Перегрузка и Реактор',
      body: [
        'Слишком большая нагрузка режет темп всех башен.',
        'Сожги карту в Реакторе — временно поднимешь ёмкость (Overdrive). Сжигание стоит золота.',
      ],
      art: { kind: 'sprite', assetKey: 'icon_reactor' },
      accent: 'Fire',
    },
  ],
  lvl_6: [
    {
      id: 'tower_shield_generator',
      type: 'tower',
      title: 'Генератор Щита',
      body: ['Вешает барьер на лидера волны и защищает соседние башни от прерывания.'],
      art: { kind: 'sprite', assetKey: 'shield_generator' },
      accent: 'Energy',
    },
    {
      id: 'mech_interrupt',
      type: 'mechanic',
      title: 'Диверсант',
      body: [
        'Враг-глушитель станит башни в радиусе.',
        'Соседний Щит гасит прерывание: один — вдвое, два или центр — иммунитет.',
      ],
      art: { kind: 'sprite', assetKey: 'enemy_disruptor' },
    },
    {
      id: 'mech_mod_cards',
      type: 'mechanic',
      title: 'Модернизация',
      body: ['Редкие карты применяются ко всей платформе, а не в слот: тащи на платформу и отпускай.'],
      art: { kind: 'sprite', assetKey: 'isolation_circuit' },
      accent: 'Energy',
    },
  ],
  lvl_7: [
    {
      id: 'mech_fusion',
      type: 'mechanic',
      title: 'Фьюжн',
      body: ['Соедини две разные карты в руке по рецепту — получишь гибрид. Стоит золота и кристаллов.'],
      art: { kind: 'sprite', assetKey: 'plasma_shutter' },
    },
  ],
};

/**
 * Lessons for a level that have not been shown yet. Admin mode returns them all
 * (so texts/art can be re-checked by jumping around the world map; §4).
 */
export function pendingLessons(
  levelId: string,
  seen: ReadonlySet<string>,
  admin: boolean,
): readonly TutorialLesson[] {
  const all = TUTORIALS[levelId] ?? [];
  return admin ? all : all.filter((l) => !seen.has(l.id));
}
