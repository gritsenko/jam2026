# Спека: Туториал-модалки по уровням (онбординг механик)

Модальные «обучающие карточки», которые всплывают **на входе в уровень, где игроку
впервые становится доступна новая механика** (или новая башня): заголовок, короткое
описание и **иллюстрация/анимация**. Цель — гасить кривую сложности кампании: каждая
новая система объясняется ровно там, где ей начинают пользоваться.

> **Статус: выполнено (заморожено в `done/`, 2026-06).** MVP реализован: реестр
> уроков [tutorial.ts](../../src/config/tutorial.ts), «виденность» в прогрессе
> [progress.ts](../../src/game/progress.ts), компонент [TutorialModal.ts](../../src/ui/TutorialModal.ts)
> + скриптовые демки [TutorialDemos.ts](../../src/ui/TutorialDemos.ts), отложенный старт
> симуляции в [BattleScene.ts](../../src/scenes/BattleScene.ts) (волны ждут закрытия модалки).
> Стретчи §6.1/§8 (отдельные PNG-иллюстрации, реплей урока, «пропустить всё»,
> reduced-motion) — не делались. Поведение зеркалится в [current-state.md](../working/current-state.md).

Зеркальный конец-боя — баннер «TECH UNLOCKED» (см. ниже §0) — уже есть; этот док про
**начало** следующего боя.

---

## 0. Контекст: что уже есть, и почему модалка садится на «начало боя»

Кампания — линейный гейт 7 уровней. Прохождение уровня N даёт **перманентную
разблокировку** башни и/или механики, и эта разблокировка становится играбельной **со
следующего уровня** (модель в [src/config/progression.ts](../../src/config/progression.ts)):

- `LEVEL_UNLOCKS` — что открывает клир каждого уровня (`towers` / `mechanics`-флаги);
- `unlockedMechanicsForLevel(levelId)` / `unlockedTowersForLevel(levelId)` — **кумулятивный**
  набор, доступный *на* уровне (из всех уровней строго до него).

Отсюда «**что нового на входе в уровень L**» = разница наборов уровней `L` и `L−1`.
Именно по этой дельте и срабатывает туториал.

Парность с финалом боя: баннер победы уже показывает реверс — «TECH UNLOCKED» с
карточками башен, которые этот клир открыл для следующего уровня (`firstClear` ветка в
`BattleScene.showBanner`, [src/ui/BattleBanner.ts](../../src/ui/BattleBanner.ts)). То есть:
**конец lvl_N** празднует «ты открыл X», **начало lvl_(N+1)** объясняет «вот как X
работает». Туториал-модалка — недостающая половина этой пары.

---

## 1. Когда и где показывать (триггер)

- **Где:** в [src/scenes/BattleScene.ts](../../src/scenes/BattleScene.ts), в `onEnter`,
  **до старта волн**. Сейчас `onEnter` сразу зовёт `this.sim.start()` (стр. ~381).
  Туториал **откладывает старт симуляции**: пока модалка открыта — враги не выходят,
  телеграф не тикает. По закрытию (игрок пролистал все страницы) — `sim.start()`.
- **Когда:** один раз на «урок» (lesson). Показанные уроки помнятся в прогрессе (§4),
  поэтому реплей уровня модалку не повторяет. На входе собираем **непоказанные** уроки
  уровня и проигрываем их каруселью (§5).
- **Гранулярность — по уроку, не по уровню.** Уровень может вводить несколько вещей
  (lvl_5 = две башни + овердрайв; lvl_6 = башня + прерывание + карты модернизации).
  Каждая — отдельная страница-урок со своим `id`, чтобы добавление/перестановка уроков
  не сбрасывала «виденность» соседних.
- **Базовый онбординг (lvl_1)** механикой-флагом не описывается (на первом уровне
  предыдущих клиров нет) — задаётся в реестре явно как уроки типа `basics`.

> Settings-панель ([src/ui/SettingsPanel.ts](../../src/ui/SettingsPanel.ts)) бой **не
> ставит на паузу** — она просто оверлей поверх живого боя. Туториалу пауза нужна, но
> добывается она дешевле: **не стартуем `sim`, пока модалка жива**, а не вводим общий
> флаг паузы.

---

## 2. Расписание уроков по уровням (дельта прогрессии)

Ниже — **что нового открывается на входе** в каждый уровень (имена — из
[src/config/levels.ts](../../src/config/levels.ts), флаги/башни — из `LEVEL_UNLOCKS`).
Башни помечены `tower`, системные механики — `mechanic`, базовый онбординг — `basics`.

| Уровень | Новое на входе | Тип | Чему учим |
| --- | --- | --- | --- |
| **lvl_1** Sunbaked Gulch | — (стартовый ростер Plasma + Frost) | `basics` | (1) ставь башню перетаскиванием в слот; (2) **сетевая синергия** — башня баффает ортогональных соседей; (3) **энергосеть** (нагрузка/ёмкость на гейдже) и **Core Integrity** (утечка = урон ядру); (4) враги идут по дороге, направление телеграфится |
| **lvl_2** Rusted Spillway | `storm_coil` | `tower` | новая башня **Гроза** — цепная молния по группе |
| **lvl_3** Static Mesa | `merge`, `reroll`, `crystals` | `mechanic` ×3 | (1) **мердж** I+I→II в руке и II+II→III на поле; (2) **реролл** руки за кристаллы; (3) **кристаллы** — откуда берутся (Perfect Clear, элиты) и на что тратятся |
| **lvl_4** Ember Hollow | `resonance` | `mechanic` | **резонансные реакции** — соседи Grade II+ разных стихий дают Паровой Выброс / Сверхпроводимость / Шрапнель |
| **lvl_5** Glass Dunes | `railgun`, `grid_stabilizer`; `overload` | `tower` ×2 + `mechanic` | (1) **Рельсотрон** (пробивающий луч сквозь строй) и **Стабилизатор** (баффает темп соседних башен); (2) **перегрузка энергосети** режет темп; **Реактор/Овердрайв** (сжечь карту → временно поднять ёмкость) |
| **lvl_6** Coolant Ridge | `shield_generator`; `interrupt`, `mod_cards` | `tower` + `mechanic` ×2 | (1) **Генератор Щита** (барьер лидеру); (2) **Диверсант** — глушит/станит башни, соседний Щит гасит прерывание; (3) **карты модернизации** — применяются ко всей платформе, не в слот |
| **lvl_7** Overload Spire | `fusion` | `mechanic` | **фьюжн** в руке — гибридные карты по рецептам за золото/кристаллы |

Источник флагов-гейтов в коде (сверять реестр уроков с реальной доступностью):
`reroll` → видимость кнопки реролла (`refreshRerollButton`); `fusion` → ветки фьюжна в
`onDragMove`/`endDrag`; `mod_cards` → редкий добор модерн-карт (`rollHandCard`); см.
`this.mechanics.has(...)` в `BattleScene`.

> **Заметка по `merge`:** флаг `merge` открывается клиром lvl_2 (играбелен с lvl_3), но в
> текущем коде сам мердж жёстко флагом **не гейтится** (`canMerge` его не проверяет) —
> технически слить две одинаковые карты можно и раньше. Урок всё равно вешаем на дельту
> флага (это канон прогрессии и правильное место объяснения); см. §10.
>
> **Заметка по `fusion_recipes`:** клир lvl_7 открывает `fusion_recipes`, но восьмого
> уровня нет — этот флаг ни на каком уровне не «всплывает», урока для него нет.

---

## 3. Модель данных — `src/config/tutorial.ts` (новый файл)

Данные отдельно от отрисовки (правило проекта). Реестр **рукотворный** (тексты и арт
курируем), но порядок/состав сверяем с дельтой §2.

```ts
import type { ElementId } from '../theme';

/** Чем проиллюстрировать урок: готовый спрайт по ключу или скриптовая демка (§6). */
export type LessonArt =
  | { kind: 'sprite'; assetKey: string }   // переиспользуем арт карт/врагов/иконок
  | { kind: 'demo'; demoId: TutorialDemoId }; // мини-анимация в движке (стретч §6.2)

export type TutorialDemoId = 'merge' | 'synergy' | 'resonance' | 'energy';

export interface TutorialLesson {
  /** Стабильный id — ключ «виденности» в прогрессе. НЕ переиспользовать после релиза. */
  readonly id: string;
  readonly type: 'basics' | 'mechanic' | 'tower';
  readonly title: string;
  /** 1–3 коротких абзаца. Без «воды» — модалка читается за пару секунд. */
  readonly body: readonly string[];
  readonly art: LessonArt;
  /** Стихия для подкраски рамки/свечения (необязательно). */
  readonly accent?: ElementId;
}

/** Уроки по уровню в порядке показа. Ключ — levelId из levels.ts. */
export const TUTORIALS: Record<string, readonly TutorialLesson[]> = {
  lvl_1: [
    { id: 'basics_place',   type: 'basics', title: 'Ставь турели', body: ['Перетащи карту из руки на пустой слот платформы 3×3.'], art: { kind: 'sprite', assetKey: 'plasma_shutter' }, accent: 'Fire' },
    { id: 'basics_synergy', type: 'basics', title: 'Соседи усиливают', body: ['Башня баффает ортогональных соседей по сетке. Ставь рядом — не вразброс.'], art: { kind: 'demo', demoId: 'synergy' } },
    { id: 'basics_energy',  type: 'basics', title: 'Энергия и ядро', body: ['Каждая башня грузит энергосеть (шкала сверху). Прорвавшийся враг бьёт Core Integrity — потеряешь ядро, проиграешь.'], art: { kind: 'demo', demoId: 'energy' } },
  ],
  lvl_2: [
    { id: 'tower_storm_coil', type: 'tower', title: 'Гроза', body: ['Цепная молния — бьёт по группе врагов, перепрыгивая между целями.'], art: { kind: 'sprite', assetKey: 'storm_coil' }, accent: 'Electricity' },
  ],
  lvl_3: [
    { id: 'mech_merge',    type: 'mechanic', title: 'Мердж', body: ['Две одинаковые карты сливаются в грейд повыше: I+I→II в руке, II+II→III на поле.'], art: { kind: 'demo', demoId: 'merge' } },
    { id: 'mech_crystals', type: 'mechanic', title: 'Кристаллы', body: ['Идеальная зачистка волны и элитные враги роняют кристаллы — премиум-валюта.'], art: { kind: 'sprite', assetKey: 'icon_crystal' }, accent: 'Water' },
    { id: 'mech_reroll',   type: 'mechanic', title: 'Реролл руки', body: ['Не нравится добор? Перекрути руку за кристаллы. Цена растёт за волну.'], art: { kind: 'sprite', assetKey: 'icon_crystal' } },
  ],
  lvl_4: [
    { id: 'mech_resonance', type: 'mechanic', title: 'Резонанс', body: ['Соседи Grade II+ разных стихий запускают реакцию: Паровой Выброс (Огонь+Вода), Сверхпроводимость (Вода+Ток), Шрапнель (Огонь+Физика).'], art: { kind: 'demo', demoId: 'resonance' } },
  ],
  lvl_5: [
    { id: 'tower_railgun',        type: 'tower',    title: 'Рельсотрон', body: ['Пробивающий луч — шьёт всю линию врагов насквозь.'], art: { kind: 'sprite', assetKey: 'railgun' }, accent: 'Physical' },
    { id: 'tower_grid_stabilizer',type: 'tower',    title: 'Стабилизатор', body: ['Поддержка: разгоняет темп соседних башен.'], art: { kind: 'sprite', assetKey: 'grid_stabilizer' }, accent: 'Energy' },
    { id: 'mech_overload',        type: 'mechanic', title: 'Перегрузка и Реактор', body: ['Слишком большая нагрузка режет темп всех башен. Сожги карту в Реакторе — временно поднимешь ёмкость (Overdrive). Сжигание стоит золота.'], art: { kind: 'sprite', assetKey: 'icon_reactor' }, accent: 'Fire' },
  ],
  lvl_6: [
    { id: 'tower_shield_generator', type: 'tower',    title: 'Генератор Щита', body: ['Вешает барьер на лидера волны и защищает соседние башни от прерывания.'], art: { kind: 'sprite', assetKey: 'shield_generator' }, accent: 'Energy' },
    { id: 'mech_interrupt',         type: 'mechanic', title: 'Диверсант', body: ['Враг-глушитель станит башни в радиусе. Соседний Щит гасит прерывание: один — вдвое, два или центр — иммунитет.'], art: { kind: 'sprite', assetKey: 'enemy_disruptor' } },
    { id: 'mech_mod_cards',         type: 'mechanic', title: 'Модернизация', body: ['Редкие карты применяются ко всей платформе, а не в слот: тащи на платформу и отпускай.'], art: { kind: 'sprite', assetKey: 'isolation_circuit' }, accent: 'Energy' },
  ],
  lvl_7: [
    { id: 'mech_fusion', type: 'mechanic', title: 'Фьюжн', body: ['Соедини две разные карты в руке по рецепту — получишь гибрид. Стоит золота и кристаллов.'], art: { kind: 'sprite', assetKey: 'plasma_shutter' } },
  ],
};

/** Уроки уровня, которые ещё не показаны (Admin → все, для теста; §4). */
export function pendingLessons(levelId: string, seen: ReadonlySet<string>, admin: boolean): readonly TutorialLesson[] {
  const all = TUTORIALS[levelId] ?? [];
  return admin ? all : all.filter((l) => !seen.has(l.id));
}
```

> Тексты — черновые, под редактуру геймдизайна. Главное — структура: **id ≠ копирайт**,
> арт ссылается на ключ ассета или demoId.

---

## 4. Персистентность «виденности» — `src/game/progress.ts`

Расширяем `ProgressData` (бэкенд — `localStorage`, ключ `sgtd.progress.v1`):

```ts
interface ProgressData {
  cleared: string[];
  stars: Record<string, number>;
  admin: boolean;
  seenTutorials: string[]; // НОВОЕ: id показанных уроков
}
```

- `fresh()` → `seenTutorials: []`; `read()` — мигрируем мягко:
  `Array.isArray(parsed.seenTutorials) ? parsed.seenTutorials.filter(s => typeof s === 'string') : []`
  (старые сейвы без поля просто получают пустой список — туториалы для них покажутся,
  это ок).
- Новые экспорты:
  ```ts
  export function seenTutorials(): ReadonlySet<string> { return new Set(state.seenTutorials); }
  export function markTutorialsSeen(ids: Iterable<string>): void {
    for (const id of ids) if (!state.seenTutorials.includes(id)) state.seenTutorials.push(id);
    write();
  }
  ```
- **Admin mode** (`isAdmin()`): `pendingLessons` показывает всё независимо от seen — удобно
  тестировать тексты/арт, прыгая по уровням с карты мира. (Опционально debug-сброс —
  `resetTutorials()` — стретч.)

---

## 5. UI-компонент — `src/ui/TutorialModal.ts` (новый)

Следует ровно паттерну существующих модалок ([SettingsPanel](../../src/ui/SettingsPanel.ts) /
[BattleBanner](../../src/ui/BattleBanner.ts)): скрим + центрированная латунная панель,
`drawPanel`/`makeText`/`Button`/`glowCircle`/`fitSprite` из
[ui/helpers.ts](../../src/ui/helpers.ts), токены из [theme.ts](../../src/theme.ts), твины
из [core/tween.ts](../../src/core/tween.ts).

**Состав панели (сверху вниз):**
- **Скрим** на весь `info.full` (как у SettingsPanel), но тапом **не закрывается** —
  закрытие только кнопкой, чтобы случайно не проскочить урок.
- **Заголовок** урока (`makeText('title')`), подкрашен `ELEMENTS[accent].glow` если задан.
- **Иллюстрация** — область фикс. размера по центру:
  - `art.kind === 'sprite'` → `new Sprite(assets.get(assetKey))`, вписать `fitSprite`,
    под ней `glowCircle(accent)` для «карточного» свечения.
  - `art.kind === 'demo'` → контейнер скриптовой демки (§6.2); MVP может рисовать
    статичный плейсхолдер-кадр.
- **Тело** — абзацы `body[]`, перенос по словам (ширина панели − паддинги). Если в проекте
  ещё нет word-wrap хелпера — задать `style.wordWrap`/`wordWrapWidth` у Pixi `Text`.
- **Индикатор страниц** — ряд точек (текущая/всего), если уроков уровня > 1.
- **Кнопка** — `NEXT →` пока есть следующая страница, `ПОНЯТНО` на последней. Опц.
  `ПРОПУСТИТЬ ВСЁ` (мелким) для повторных игроков (стретч).

**Поведение / API:**
```ts
export class TutorialModal extends Container {
  constructor(lessons: readonly TutorialLesson[], assets: AssetLoader, onDone: () => void);
  layout(info: LayoutInfo): void; // скрим на full, панель по центру safe (как SettingsPanel)
  tick(dt: number): void;         // idle-анимация иллюстрации (плавание/пульс) + demo-тик
}
```
- Карусель: внутренний `pageIndex`, кнопка перелистывает; на последней — `onDone()`.
- Появление: fade-in панели (tween 0.3s), лёгкий рост (`Easings.outCubic`), как баннер.
- **Idle-анимация** (всегда, дёшево): иллюстрация мягко «плавает» (sin по Y) и пульсирует
  свечение — модалка «живая» даже со статичным спрайтом.
- Звук: `sfx_click` на кнопке (через переданный колбэк/сервис), как везде.

---

## 6. Иллюстрации и анимации

### 6.1. MVP — статичный арт + idle-движение

Большую часть уроков иллюстрируем **уже существующим артом** (нулевая стоимость ассетов):

| Урок | Готовый ключ ассета |
| --- | --- |
| tower_* (все башни) | `plasma_shutter`, `storm_coil`, `railgun`, `grid_stabilizer`, `shield_generator` |
| mech_interrupt | `enemy_disruptor` |
| mech_crystals / mech_reroll | `icon_crystal` |
| mech_overload | `icon_reactor` (фоллбек `ui_button_overdrive`) |
| mech_mod_cards | `isolation_circuit` (карта модернизации) |

Плюс idle-движение из §5 — этого достаточно, чтобы модалка не была «мёртвой картинкой».

**Новые иллюстрации** (по желанию — там, где готового спрайта нет): синергия-сетка,
мердж, резонанс, энергосеть, фьюжн. Заводим как ассеты по правилу проекта — **сначала
запись в манифесте** ([src/config/assetManifest.ts](../../src/config/assetManifest.ts) +
зеркало [tools/assets.manifest.json](../../tools/assets.manifest.json)), потом PNG через
[tools/gen_sprite.py](../../tools/README.md). Категория `prop`, size `256`. До генерации
движок рисует тематический плейсхолдер из манифеста.

```ts
// Примеры записей в ASSETS[] (assetManifest.ts):
{ key: 'tut_synergy',  category: 'prop', size: 256,
  prompt: 'glowing 3x3 grid of energy tiles, central tile beaming buff arrows to four orthogonal neighbors, schematic diagram style',
  placeholder: { shape: 'round', tint: N, label: 'SYN' } },
{ key: 'tut_merge',    category: 'prop', size: 256,
  prompt: 'two identical glowing turret cards sliding together and fusing into one larger upgraded card, motion arrows',
  placeholder: { shape: 'round', tint: F, label: 'MERGE' } },
{ key: 'tut_resonance',category: 'prop', size: 256,
  prompt: 'two adjacent elemental cores fire and water emitting a bright reaction burst between them, steam shockwave',
  placeholder: { shape: 'disc', tint: W, label: 'RES' } },
{ key: 'tut_fusion',   category: 'prop', size: 256,
  prompt: 'two different element cards merging into a hybrid dual-element card, alchemical glow',
  placeholder: { shape: 'round', tint: E, label: 'FUSE' } },
```

### 6.2. Стретч — скриптовые мини-демки в движке (`demoId`)

Вместо статичной картинки самые «процессные» механики показываем крошечной анимацией на
`core/tween` внутри иллюстрационной области (зацикленной). Никаких новых ассетов — рисуем
`Graphics` + уже имеющиеся иконки карт:

- **`synergy`** — мини-сетка 3×3; центральная клетка периодически «пульсирует» и шлёт
  стрелки-баффы в 4 соседей.
- **`merge`** — две мини-карты съезжаются и «схлопываются» в одну с лейблом `Lv2`
  (повторяет `mergeBurst` из BattleScene в миниатюре).
- **`resonance`** — два стихийных диска рядом, между ними периодический разряд-вспышка.
- **`energy`** — шкала энергии наполняется в «жёлтую/красную» зону и сбрасывается
  (демонстрирует перегрузку).

Демки — отдельные классы/функции (напр. `TutorialDemos[demoId](container, assets)`),
управляются `tick(dt)`; чистятся при `destroy()` модалки. Это **стретч** — MVP может
рендерить для `demo`-уроков статический плейсхолдер-кадр.

---

## 7. Интеграция в `BattleScene`

В [src/scenes/BattleScene.ts](../../src/scenes/BattleScene.ts):

1. **`onEnter`** (после построения поля/HUD/симуляции, **вместо безусловного**
   `this.sim.start()` на стр. ~381):
   ```ts
   const lessons = pendingLessons(this.levelId, progress.seenTutorials(), progress.isAdmin());
   if (lessons.length > 0) {
     this.tutorial = new TutorialModal(lessons, this.services.assets, () => {
       progress.markTutorialsSeen(lessons.map((l) => l.id));
       this.closeTutorial();
       this.sim.start(); // волны стартуют только после онбординга
     });
     this.addChild(this.tutorial); // top-most, как settings
     this.tutorial.layout(this.services.getLayout());
   } else {
     this.sim.start();
   }
   ```
2. **`update(dt)`**: `this.tutorial?.tick(dt)` (idle/demo-анимация). Симуляция и так не
   тикает осмысленно, пока `sim.status !== 'running'` (не стартовали) — отдельный флаг
   паузы не нужен.
3. **`layout(info)`**: `this.tutorial?.layout(info)` (как `this.settings?.layout(info)`).
4. **`onExit`**: `this.closeTutorial()` (destroy + null), по аналогии с `closeSettings()`.
5. Новые поля: `private tutorial: TutorialModal | null = null;` и `closeTutorial()`.

Карта мира / навигация не трогаются: модалка живёт целиком в бою.

---

## 8. Доступность и реплей (стретч)

- **Повторный просмотр.** Раз показанный урок больше не всплывает. Чтобы освежить —
  кнопка-«?» рядом с шестерёнкой или пункт в Settings → список механик уровня → открыть
  модалку в режиме «реплей» (seen игнорируется, ничего не пишем).
- **Пропуск.** Кнопка `ПРОПУСТИТЬ ВСЁ` на первой странице сразу зовёт `onDone` (помечает
  все уроки уровня виденными) — для опытных игроков/повторных прохождений демо.
- **Reduced-motion.** Если позже появится тумблер «меньше анимации» — idle/demo замирают
  на первом кадре.

---

## 9. Порядок реализации

**MVP (статичные иллюстрации, без новых ассетов):**
1. `progress.ts` — `seenTutorials` + `markTutorialsSeen`/`seenTutorials()` + миграция `read()`.
2. `src/config/tutorial.ts` — типы, `TUTORIALS` (на готовом арте), `pendingLessons`.
   Для `demo`-уроков временно подставить `sprite`-плейсхолдеры (напр. `plasma_shutter`).
3. `src/ui/TutorialModal.ts` — скрим + панель + заголовок/тело/иллюстрация + карусель +
   кнопка + idle-движение.
4. `BattleScene` — отложенный `sim.start()`, `tutorial?.tick/layout`, `closeTutorial`.
5. `npm run typecheck`. Прогон кампании lvl_1→lvl_7 (Admin), проверить тексты/виденность.

**Стретч:**
6. Новые иллюстрации `tut_*` (манифест → PNG) для механик без готового спрайта.
7. Скриптовые демки `demoId` (`synergy`/`merge`/`resonance`/`energy`).
8. Реплей-доступ (кнопка-«?» / Settings) + «Пропустить всё».

**Документация (правило синхронизации, [docs/README.md](../README.md)):** при реализации —
перенести эту спеку в `docs/done/` и отразить поведение в
[docs/working/current-state.md](../working/current-state.md); добавить новый ассет-статус,
если генерировались `tut_*`.

---

## 10. Открытые вопросы

1. **`merge` не гейтится флагом в коде** (§2): урок вешаем на дельту `merge` (lvl_3) как
   на канон, но реально слить можно и раньше. Либо принять (учим там, где это
   «официально»), либо добавить гейт `mechanics.has('merge')` в `canMerge` — решение за
   геймдизайном, в этой спеке не трогаем.
2. **Контекстные триггеры vs вход в уровень.** MVP показывает всё на входе. Часть уроков
   логичнее ловить по **первому реальному событию** (резонанс — когда впервые сложился;
   диверсант — когда впервые вышел): это точнее, но дороже (нужны хуки в `BattleSim`
   колбэках) — оставлено стретчем.
3. **Объём lvl_1.** Базовый онбординг — 3 страницы (ставь / синергия / энергия+ядро).
   Если ощущается длинно — резать до 2 или дробить (синергию показать на lvl_1, энергию
   — позже). Калибруется на плейтесте.
4. **Тексты и арт** в §3/§6 — черновые, под редактуру геймдизайна перед генерацией PNG.
