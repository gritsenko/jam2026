# jam2026 — «Synergy Grid TD» (прототип)

Tower-defense / merge-карточная игра. На платформе есть поле слотов `3×3`, в них
ставятся карты-турели; карты баффают ортогональных соседей по сетке, мерджатся
в грейды и реагируют по таблице стихийных синергий (резонансов). Дизайн карт и
баланс — в [docs/cards.json](docs/cards.json) (список карт) и таблицах статов
[src/config/cards.ts](src/config/cards.ts). Полное ТЗ каркаса — [BRIEF.md](BRIEF.md).
Визуальный референс — [docs/style_ref.png](docs/style_ref.png).

## Текущее состояние (ВАЖНО)

Полноценный бой реализован поверх каркаса. Работает headless-симуляция в
[src/game/BattleSim.ts](src/game/BattleSim.ts) (без Pixi), которую сцена только
рендерит: **волны врагов** — у каждого уровня **свой** скрипт волн и тир сложности
(`hpScale`/`bountyScale`) в [src/config/levelCombat.ts](src/config/levelCombat.ts)
(`combatForLevel`; общий [src/config/waves.ts](src/config/waves.ts) — дефолтный
фоллбек). Враги **выходят из-за края экрана** и идут по дороге, чья **форма зависит
от уровня**: шаблоны `ENEMY_PATHS` (`bottom`/`top`/`left`/`right`) в
[src/config/combatRules.ts](src/config/combatRules.ts), выбор — `LevelCombat.pathId`
([src/game/path.ts](src/game/path.ts)); перед волной направление подсвечивается
([src/ui/WaveTelegraph.ts](src/ui/WaveTelegraph.ts)). **Атака башен** — у каждой
атакующей карты свой **радиус в клетках** (`rangeCells`), бьёт ближнюю дорогу по
«лидеру» (энергоболты, цепь, пробивающий луч). Грейд апает у разных карт разный стат
(`upgrade`: `power`/`tempo`/`range` — урон/темп/радиус, см. `towerStats`); радиус
показывается эллипсом при перетаскивании. Есть HP/смерть/награда, утечка → урон
**Core Integrity**, победа/поражение с баннером (с **оценкой ★ по остатку Core**).

Реализованы и **ключевые механики v3** (всегда сверяйся с кодом, не с этим списком):

- **Синергия по сетке** ([src/game/synergy.ts](src/game/synergy.ts)) — карта баффает
  ортогональных соседей; «разные источники» включают **резонанс** (с Grade II+).
- **Резонансные реакции** ([src/config/resonance.ts](src/config/resonance.ts)) — 3 в
  коде: Паровой Выброс (Fire+Water), Сверхпроводимость (Water+Electricity), Шрапнель
  (Fire+Physical).
- **Мердж** карт в грейды — на поле II+II→III и в руке I+I→II ([src/scenes/BattleScene.ts](src/scenes/BattleScene.ts)).
- **Фьюжн** в руке — 6 гибридов ([src/config/fusion.ts](src/config/fusion.ts)).
- **Карты-поддержка** — барьер Щита (держит лидера, в BattleSim) и модификатор
  темпа соседних **башен** от Стабилизатора (через synergy.ts).
- **Энергосеть** — перегрузка режет темп каждой башни пропорционально её нагрузке;
  Overdrive (сжигание карты) временно поднимает ёмкость. Сжигание **стоит золота**,
  цена **растёт за каждый разгон за бой** (накопительно, без сброса по волнам;
  `OVERDRIVE_BASE_COST`/`OVERDRIVE_STEP` в `battleRules.ts`); показывается на слоте
  Реактора и в индикаторе стоимости при перетаскивании.
- **Экономика** — золото (килл/волна) **и кристаллы**: Perfect Clear даёт кристаллы,
  **элитные враги роняют кристаллы на килле** (поле `crystalBounty`, пока на диверсанте);
  реролл руки и фьюжн их тратят; сжигание карт в Реакторе тратит золото (растущая цена).
- **Диверсант (Disruptor)** — глушит/станит башни в радиусе; защита соседнего Щита гасит
  прерывание **градуированно** (`defense` башни: один Щит — вдвое, два / центр — иммунитет).
- **Мета-кампания** ([src/config/progression.ts](src/config/progression.ts) +
  [src/game/progress.ts](src/game/progress.ts)) — линейный гейт 7 уровней,
  перманентные разблокировки башен/механик за уровень, **Admin mode** (чекбокс на
  карте мира), прогресс в `localStorage`.
- **Звёзды за уровень** — 1–3★ по остатку Core (★ пройден, ★★ Core ≥ 50%,
  ★★★ Core не тронут): расчёт/сохранение — `starsForClear`/`recordClear`
  (`progression.ts`/`progress.ts`); показ на узлах карты и рядом из 3 звёзд на
  баннере победы (спрайт `icon_star`, [src/ui/BattleBanner.ts](src/ui/BattleBanner.ts)).

Рука по умолчанию **3 слота** (расширяемо позже). Тюнинги — в `combatRules.ts`,
`battleRules.ts`, `enemies.ts`, `cards.ts`. Стартовая раскладка платформы и ресурсы
по-прежнему берутся из мока [src/config/battleState.ts](src/config/battleState.ts).

**Очков синергии (SP) в игре нет** — установка карт гейтится только свободным слотом
(реальная «цена» — нагрузка на энергосеть).

**Ещё НЕ реализовано** (проверяй по коду): карты **глобальной модернизации** (флаг
`mod_cards` уже капает в лестнице, но самих карт нет); **продажа** башен
([docs/planned/sell-towers.md](docs/planned/sell-towers.md)); **per-wave смена
направления** входа внутри уровня — направление пока **пер-левел** (вся партия с
одной стороны), per-wave требует мульти-пути в симе («Инкремент 3»,
[docs/done/directional-entry.md](docs/done/directional-entry.md)); внутрисессионное
**SP-дерево и трата «Чертежей»** — стретчи мета-кампании
([docs/done/progression-and-tech-tree.md](docs/done/progression-and-tech-tree.md));
3 новых монстра из [docs/planned/enemy-roster-design.md](docs/planned/enemy-roster-design.md)
(в коде 5 врагов + архетип диверсанта).

## Документация по статусу (ВАЖНО)

`docs/` разложен по статусу относительно кода — карта и подробности в
[docs/README.md](docs/README.md):

- `docs/working/` — **рабочие**: зеркало текущего кода (`current-state.md`,
  `enemy-balance.md`). Описывают «как есть сейчас» (список карт — `docs/cards.json`).
- `docs/done/` — **выполненные**: спеки реализованных фич (заморожены).
- `docs/planned/` — **планируемые**: спроектировано, но в коде ещё нет.
- `docs/backlog/` — **беклог**: идеи и заменённые ревизии.

**Правило синхронизации:** меняешь логику боя/экономики/правил так, что меняется
наблюдаемое поведение → в том же изменении обнови соответствующий док в
`docs/working/` (минимум [docs/working/current-state.md](docs/working/current-state.md)).
Реализовал фичу из `planned/` → перенеси её спеку в `done/` и отрази в
`working/current-state.md`. При переносе файла правь относительные ссылки внутри
него, кросс-ссылки из других доков и внешние ссылки из кода/этого файла.

## Стек и команды

- **Vite 7 + TypeScript 5.9** (strict, `noUncheckedIndexedAccess`) + **PixiJS v8.19**
  (запинено в [package.json](package.json)). Пакетный менеджер — **npm**.
- **Единственная рантайм-зависимость — `pixi.js`.** Никаких фреймворков, твин- и
  layout-библиотек: «чистый Pixi + TS». Свои мини-реализации твина и адаптива — в `core/`.
- Требуется Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173 (Vite dev-сервер, HMR)
npm run build      # tsc --noEmit + продакшн-сборка в dist/
npm run preview    # предпросмотр собранного билда
npm run typecheck  # только проверка типов
```

После любого изменения кода прогоняй `npm run typecheck` — `build` падает на ошибках типов.

## Структура

```
index.html              # full-screen canvas, safe-area, no-zoom, #boot-заглушка
src/
  main.ts               # точка входа: карта маршрутов RouteId→SceneFactory → Game.boot()
  theme.ts              # дизайн-токены: COLORS, ELEMENTS (стихии), FONTS, DESIGN, RADIUS, hex()
  core/
    Game.ts             # bootstrap: Application.init, ассеты, layout, ресайз, тикер
    SceneManager.ts     # активная сцена + fade-переходы (оверлей в экранных пикселях)
    ResponsiveLayout.ts # адаптив: маппит портретное дизайн-пространство на canvas → LayoutInfo
    AssetLoader.ts      # текстуры по КЛЮЧУ: реальный PNG или плейсхолдер из манифеста
    scene.ts            # базовый класс Scene + SceneServices
    tween.ts            # свой твин на app.ticker (tween/Easings/lerp), без зависимостей
  game/                 # ЛОГИКА боя без Pixi: BattleSim, synergy, path (кольцо), progress (прогресс)
  ui/                   # переиспользуемые компоненты (Button, BattleCard, EnergyGauge,
                        #   PlatformGrid, SlotView, ReactorZone, HeroAvatar, ResourceChip,
                        #   WaveBadge, CoreBadge, EnemySprite, Projectile, BattleBanner,
                        #   WorldMapNode, Checkbox, SceneBackground, helpers)
  scenes/               # MainMenuScene, WorldMapScene, BattleScene
  config/               # ДАННЫЕ отдельно от логики: types, cards, enemies, levels, waves,
                        #   battleRules, combatRules, resonance, fusion, progression,
                        #   battleState (мок), assetManifest
assets/sprites/         # готовые PNG (подключаются по ключу = имени файла)
tools/                  # gen_sprite.py + assets.manifest.json (см. tools/README.md)
```

`README.md` — человекочитаемый разбор тех же решений; этот файл — рабочие правила для агента.

## Архитектура и правила работы

При добавлении кода держись существующих паттернов:

- **Данные отдельно от отрисовки.** Все игровые данные (карты, враги, уровни,
  стоимости, мок-состояние боя) живут в `src/config/` как типизированные структуры
  ([types.ts](src/config/types.ts) — источник всех типов). Рендер-компоненты их
  только читают. Новую игровую сущность заводи там, а не в сцене/компоненте.

- **Ассеты — по ключу, никогда по пути.** Код всегда обращается через
  `services.assets.get('<key>')`. [AssetLoader](src/core/AssetLoader.ts) грузит
  `assets/sprites/<key>.png` через `import.meta.glob`; если файла нет — строит
  тематический плейсхолдер из манифеста. **Имя PNG-файла = ключ ассета.** Добавил
  новый спрайт на диск → перезапусти dev-сервер (glob резолвится на старте). Мягкие
  подмены (взять близкий по смыслу спрайт вместо плейсхолдера) — в `ASSET_FALLBACKS`.

- **Новый ассет = сначала запись в манифесте.** Добавь `AssetSpec` (ключ, категория,
  size, англ. промпт, плейсхолдер) в [src/config/assetManifest.ts](src/config/assetManifest.ts)
  и зеркально — в [tools/assets.manifest.json](tools/assets.manifest.json). Только
  потом генерируй PNG (см. ниже). Без записи в манифесте плейсхолдера не будет.

- **Дизайн-координаты, а не экранные пиксели.** Весь UI верстается в портретном
  пространстве `DESIGN` (ширина `1080`). [ResponsiveLayout](src/core/ResponsiveLayout.ts)
  передаёт в `layout(info)` структуру `LayoutInfo`: `mode` (`portrait`/`wide`),
  `scale`, `safe`/`full` (прямоугольники), `insets` (safe-area). **Якори HUD к `info.safe`**,
  фон — к `info.full`. Не хардкодь координаты под конкретный экран; верстай от `safe`.

- **Сцены.** Наследуй [`Scene`](src/core/scene.ts) (это `Container`). Хуки:
  `onEnter(params)` → `layout(info)` (вызывается на входе и на каждый ресайз) →
  `update(dt)` (секунды) → `onExit()`. Зарегистрируй маршрут в [main.ts](src/main.ts)
  (`RouteId` = `'menu' | 'worldmap' | 'battle'`). Переходы — `services.navigate(route, params)`
  (делает fade через `SceneManager`). Сервисы (`app`, `assets`, `navigate`, `getLayout`)
  приходят в конструктор — не лезь в глобалы.

- **Анимации — только через [core/tween.ts](src/core/tween.ts)** (`tween`, `Easings`,
  `lerp`), без внешних либ. Каждый твин, запущенный сценой, обязательно останавливай
  в `onExit()` — смотри паттерн `this.tweens` / `track()` в [BattleScene](src/scenes/BattleScene.ts).
  Внутри `onUpdate` проверяй `if (target.destroyed) return`.

- **Тема и хелперы.** Цвета/шрифты/радиусы — из [theme.ts](src/theme.ts) (`COLORS`,
  `ELEMENTS` — палитра стихий, `FONTS`, `RADIUS`). Не вписывай магические hex в
  компоненты. Текст — `makeText(text, preset)`, панели — `drawPanel`, вписывание
  спрайта — `fitSprite`, свечение — `glowCircle` (всё в [ui/helpers.ts](src/ui/helpers.ts)).

- **PixiJS v8 API.** Новый Graphics-API (fluent `.roundRect(...).fill({color})`),
  `Application.init`, `Assets`, `Text({ text, style })`. Версия запинена осознанно —
  не обновляй мажор без явной причины. Рендер — WebGL (`preference: 'webgl'`), DPR
  капается на `MAX_DPR = 2.5`.

- **`noUncheckedIndexedAccess` включён:** индексация массива/Record даёт `T | undefined`.
  Обрабатывай явно (`?.`, проверки, либо `!` там, где инвариант гарантирован — как в коде).

## Графика (ВАЖНО)

Для любых визуальных ассетов (спрайты, иконки карт, турели, враги, тайлы, фоны, fx)
**НЕ** используй эмодзи, Unicode-символы, CSS-фигуры или цветные заглушки. Вместо
этого генерируй настоящий PNG через инструмент в [tools/](tools/):

```powershell
tools\.venv\Scripts\python.exe tools\gen_sprite.py "<английское описание>" assets\sprites\<имя>.png --category <тип> --size <px>
```

Затем подключай готовый файл из `assets/sprites/` в коде игры (по ключу = имени файла).

Правила:
- **Описание промпта — на английском.** Стиль и плоский фон скрипт добавляет сам;
  пиши только сам объект (например `"plasma shutter turret, glowing orange core"`).
- **Указывай `--category`**: `card_icon`, `tower`/`turret`, `enemy`, `prop`, `fx`,
  `tile`, `background`. Для `tile`/`background` фон не вырезается (непрозрачный ассет).
- **Указывай `--size`** под назначение: иконки `256`, турели/враги `512`, фоны `1024`.
  Скрипт только уменьшает — в игру не попадут исходные 1–2K картинки.
- **Стиль держится единым** автоматически: преамбула в `tools/sprite_style.py` +
  авто-референс `docs/style_ref.png`. Чтобы новые ассеты подгонять под уже принятый
  спрайт — передавай его через `--ref assets\sprites\<эталон>.png`.
- Готовый спрайт — это PNG с альфа-каналом, обрезанный по объекту.
- id карт для имён файлов бери из `docs/cards.json` (`plasma_shutter`, `frost_pulse`,
  `storm_coil`, `railgun`, `shield_generator`, `grid_stabilizer`).

Подробности, опции и переобработка без нового вызова API — в [tools/README.md](tools/README.md).
Если скрипт ругается на отсутствие ключа — ключ кладётся в `tools/.gemini_key`
(см. `tools/.gemini_key.example`), это делает пользователь вручную.

**Статус ассетов.** Почти весь арт уже сгенерирован и лежит в `assets/sprites/`
(29 PNG на диске): все фоны, платформа, логотип, аватар + рамка, иконки
ресурсов, UI-чром, все 6 карт-турелей, 5 врагов (включая диверсанта) и узлы карты
уровней. Плейсхолдерами остаются `decor_pylon` (декор, нигде не подключён),
`icon_reactor` (намеренно берёт `ui_button_overdrive` через `ASSET_FALLBACKS`) и
**`icon_star`** (звезда оценки уровня — заведена в манифесте, но PNG ещё не
сгенерирован: до генерации рисуется звёздчатый плейсхолдер). Полный список ключей с
промптами — в [src/config/assetManifest.ts](src/config/assetManifest.ts) (комментарий
«status note» в его шапке устарел — сверяйся с диском).
