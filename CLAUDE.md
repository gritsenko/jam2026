# jam2026 — «Synergy Grid TD» (прототип)

Tower-defense / merge-карточная игра. На платформе есть поле слотов `3×3`, в них
ставятся карты-турели; карты баффают ортогональных соседей по сетке, мерджатся
в грейды и реагируют по таблице стихийных синергий (резонансов). Дизайн карт и
баланс — в [docs/cards.json](docs/cards.json) (список карт) и таблицах статов
[src/config/cards.ts](src/config/cards.ts). Полное ТЗ каркаса — [BRIEF.md](BRIEF.md).
Визуальный референс — [docs/visual_refs/new_style.jpg](docs/visual_refs/new_style.jpg)
(мастер-эталон стиля) + скриншоты Iron Marines в [docs/visual_refs/](docs/visual_refs/).
Стиль — плоский флеш-флэт Iron Marines / Kingdom Rush: тёмный дизельпанк-металл с
заклёпками + тёплая база со светящимися энерго-акцентами, болдовый контур, плоские тени.

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
«лидеру» (энергоболты, цепь, пробивающий луч). **Вращающиеся турели** (Огневая
`plasma_shutter` и Гаусс/Рельсотрон `railgun`) **доворачиваются на лидера-врага**: 8
направлений нарезаются из ручного **3×3 спрайт-шита** `<iconKey>_dirs` (периметр =
стороны света) — `BattleSim.towerAim` кэширует цель, `SlotView` доворачивается к ней
**неспеша, по одному октанту за `ROT_STEP_SEC` (~0.11с) жёсткой сменой кадра** (без
кроссфейда — бленд двух соседних кадров мигает). **Стрельба от направления не зависит**
(сим бьёт по КД/радиусу; `displayOctant` — косметика). Поворот **дебаунсится**
(`AIM_DEBOUNCE_SEC`): `setAim` пишет сырое `desiredOctant`, `tickAim` коммитит его в
`targetOctant` только если направление постояло стабильно (быстро скачущий лидер не дёргает
голову), затем шагает `displayOctant`. При постройке смотрит на **SE**; без врага **держит
последнее направление**. Две раскладки шита (`COMPOSED_AIM_SHEETS` в
[src/config/cards.ts](src/config/cards.ts)): **композитный** (`plasma_shutter` и `railgun`) —
центр = **неподвижная база** (рисуется один раз под головой), периметр = **только
поворотная голова** (один спрайт, меняет кадр); **старый** (сейчас ни одна башня) — каждая
ячейка целая турель (центр = idle), крутится весь спрайт. Остальные башни
(`frost_pulse`/`storm_coil`/`shield_generator`/`grid_stabilizer`) статичны (без `_dirs`);
гибриды берут шит родителя по `iconKey`.
Грейд апает у разных карт разный стат
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
- **Карты глобальной модернизации** ([src/ui/ModOverlay.ts](src/ui/ModOverlay.ts) +
  [src/scenes/BattleScene.ts](src/scenes/BattleScene.ts)) — категория `modernization`:
  не ставятся в слот, а применяются **ко всей платформе** (при перетаскивании платформа
  под голослоем, отпускание над ней применяет). Три карты: Изоляционный Контур (+2 базовой
  ёмкости на бой), Элементальный Фокус (+25% урона выбранной стихии до конца волны — выбор
  на ряду из 5 стихий) и Экстренный Овердрайв (разгон Реактора 10с за кристаллы). Гейт —
  флаг `mod_cards` (ур.5), редкий вес в доборе (`MOD_DRAW_CHANCE`); числа `MOD_*` в
  `battleRules.ts`. Спека — [docs/done/modernization-cards.md](docs/done/modernization-cards.md).
- **Диверсант (Disruptor)** — глушит/станит башни в радиусе; защита соседнего Щита гасит
  прерывание **градуированно** (`defense` башни: один Щит — вдвое, два / центр — иммунитет).
- **Мобы поддержки** ([docs/done/support-enemies.md](docs/done/support-enemies.md)) — «тёмное
  зеркало синергии»: Resonance Mote (хейст-аура), Coolant Mender (хил-аура), Aegis Beacon
  (щит союзникам). Поля ауры в `EnemyDef` + архетип `support`, обсчёт — `BattleSim.tickAuras`;
  спавнятся в `levelCombat`, спрайты `enemy_resonance_mote`/`enemy_coolant_mender`/`enemy_aegis_beacon`.
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

**Ещё НЕ реализовано** (проверяй по коду): **продажа** башен
([docs/backlog/sell-towers.md](docs/backlog/sell-towers.md)); **per-wave смена
направления** входа внутри уровня — направление пока **пер-левел** (вся партия с
одной стороны), per-wave требует мульти-пути в симе («Инкремент 3»,
[docs/done/directional-entry.md](docs/done/directional-entry.md)); внутрисессионное
**SP-дерево и трата «Чертежей»** — стретчи мета-кампании
([docs/done/progression-and-tech-tree.md](docs/done/progression-and-tech-tree.md));
беклог §9 ростера ([docs/done/enemy-roster-design.md](docs/done/enemy-roster-design.md)) —
моб-сплиттер, само-реген-щит, «сухой» анти-Wet — **не реализованы**, а боссы
(`enemy_boss_warden`/`enemy_boss_titan`) заведены в данных, но **ни в одной волне не
спавнятся** (спрайтов нет). **3 моба поддержки уже в коде** (см. ниже).

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
  В `devDependencies` есть **`sharp`** — он только build-тайм (пережимает спрайты при
  сборке, см. ниже), в рантайм-бандл не попадает, правило «один рантайм-dep» не нарушает.
- Требуется Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173 (Vite dev-сервер, HMR)
npm run build      # tsc --noEmit + verify-configs + продакшн-сборка в dist/ (+ WebP-оптимизация спрайтов)
npm run preview    # предпросмотр собранного билда
npm run typecheck  # только проверка типов
```

После любого изменения кода прогоняй `npm run typecheck` — `build` падает на ошибках типов.

**Оптимизация ассетов на сборке.** Vite-плагин `optimize-sprites`
([src/build/optimizeSpritesPlugin.ts](src/build/optimizeSpritesPlugin.ts), подключён в
[vite.config.ts](vite.config.ts), только `apply:'build'`) в хуке `generateBundle`
пережимает **каждый** эмитнутый в `dist/` спрайт-PNG в **lossy WebP** (`sharp`, quality 82,
effort 4; альфа — `alphaQuality 100`, т.е. вырезы без потерь) и переписывает `.png→.webp`
в ссылках JS-бандла (Vite пишет их как `new URL("<basename>-<hash>.png", import.meta.url)`).
Исходные PNG в `assets/sprites/` **не трогаются** — это мастера. Итог: `dist/`-арт ~**−89%**
(≈29 МБ → ≈3 МБ). Защита `Math.min`: если WebP вышел крупнее исходника — остаётся PNG.
**Работает на GitHub Actions** ([.github/workflows/static.yml](.github/workflows/static.yml),
`npm ci` на ubuntu/Node 20): `sharp` тянет prebuilt-бинарь `@img/sharp-linux-x64` из
optional-deps — он зафиксирован в `package-lock.json` (нужно его коммитить).

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
  build/                # build-тайм тулинг: optimizeSpritesPlugin (PNG→WebP в dist/)
assets/sprites/         # готовые PNG-мастера (подключаются по ключу = имени файла; в dist/ → WebP)
tools/                  # gen_sprite.py + assets.manifest.json (см. tools/README.md)
```

`README.md` — человекочитаемый разбор тех же решений; этот файл — рабочие правила для агента.

## Архитектура и правила работы

При добавлении кода держись существующих паттернов:

- **Данные отдельно от отрисовки.** Все игровые данные (карты, враги, уровни,
  стоимости, мок-состояние боя) живут в `src/config/` как типизированные структуры
  ([types.ts](src/config/types.ts) — источник всех типов). Рендер-компоненты их
  только читают. Новую игровую сущность заводи там, а не в сцене/компоненте.
  **Контент-дизайн вынесен в JSON** (config-as-data): карты/враги/уровни/levelCombat/
  волны/резонанс/рецепты/прогрессия лежат в `src/data/game_configs/<name>/*.json` и грузятся
  через `activeGameConfig` ([src/data/load.ts](src/data/load.ts)); `src/config/*.ts` остались
  точками входа (читают `activeGameConfig.*`) с теми же экспортами + вычисляемыми функциями.
  Правишь баланс этих сущностей → правь JSON (или через будущий редактор), не TS-литерал.
  Переключение конфигов: `?game_config=<name>` / `localStorage['sgtd.gameConfig']` / `GAME_CONFIG`.
  Числовые tunables тоже в JSON (`combatRules`/`battleRules`/`battleSeed` — ключи = имена
  TS-экспортов); вычисляемые функции/производные остаются в TS.
  Спека и статус — [docs/backlog/config-as-data.md](docs/backlog/config-as-data.md).

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

- **Локализация — никаких хардкод-строк в UI.** Любая видимая игроку строка идёт
  через свой мини-i18n ([core/i18n.ts](src/core/i18n.ts)): `t('key', params)` для
  UI-текста (добавляй ключ в **обе** локали `en`/`ru` в [i18n.strings.ts](src/core/i18n.strings.ts),
  интерполяция `{name}`), `tData('key', fallback)` для **контентных** строк из JSON
  game-config (имена/блёрбы карт, уровни, резонансы) — английский это исходник (fallback),
  в каталоге только русские оверрайды. Хелперы `cardShortName`/`cardBlurb`/`levelName`/
  `elementLabel`/`reactionName`/`slotEffectLabel`/`statLabel`/`gradeLabel`. Язык по
  умолчанию **`ru`**, выбор в `localStorage['sgtd.lang']`, смена — перезагрузка;
  переключатель ([ui/LangSwitch.ts](src/ui/LangSwitch.ts)) в меню и настройках боя.
  Кириллица рендерится шрифтом **«Russo One»** ([core/fonts.ts](src/core/fonts.ts)) —
  он стоит после «Lilita One» в `FONTS`, поэтому латиница в Lilita, кириллица в Russo One.

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
- **Стиль держится единым** автоматически: преамбула в `tools/sprite_style.py` (плоский
  флеш-флэт Iron Marines / Kingdom Rush, тёмный дизельпанк-металл + тёплая база со
  светящимися энерго-акцентами) + авто-референс `docs/visual_refs/new_style.jpg`. Чтобы
  новые ассеты подгонять под уже принятый спрайт — передавай его через
  `--ref assets\sprites\<эталон>.png`. Скрипт печатает `style ref: <путь>` в лог и
  громко предупреждает, если референс не найден (раньше молча генерил без якоря).
- **8-направленные турели**: вращающиеся башни рендерятся из ручного **3×3 спрайт-шита**
  `<iconKey>_dirs.png` (прозрачный фон; периметр = 8 сторон света от центра). Две раскладки
  (см. `COMPOSED_AIM_SHEETS` в [src/config/cards.ts](src/config/cards.ts)): **композитная**
  (`plasma_shutter` и `railgun`) — **центр = неподвижная база** (рисуется один раз), периметр = **только
  поворотная голова** (крутится; база на месте); **старая** (сейчас ни одна башня) — каждая ячейка
  целая турель (центр = idle, крутится весь спрайт). Поворот — неспеша, **жёсткой сменой
  кадра** (без кроссфейда — мигает), с дебаунсом направления; стрельба от направления не
  зависит. Перерисовал шит в композитной раскладке → добавь `iconKey` в `COMPOSED_AIM_SHEETS`.
  Код режет шит на лету ([SlotView.sliceSheet3x3](src/ui/SlotView.ts)) — никакого инструмента
  не нужно: положи новый 3×3-шит как `assets/sprites/<iconKey>_dirs.png` и перезапусти
  dev-сервер. Будущие состояния (idle/attack/loading) и грейд-версии — отдельными шитами
  `<iconKey>_*`. Базовый спрайт `<iconKey>.png` — арт для карточки в руке.
- Готовый спрайт — это PNG с альфа-каналом, обрезанный по объекту.
- id карт для имён файлов бери из `docs/cards.json` (`plasma_shutter`, `frost_pulse`,
  `storm_coil`, `railgun`, `shield_generator`, `grid_stabilizer`).

Подробности, опции и переобработка без нового вызова API — в [tools/README.md](tools/README.md).
Если скрипт ругается на отсутствие ключа — ключ кладётся в `tools/.gemini_key`
(см. `tools/.gemini_key.example`), это делает пользователь вручную.

**Статус ассетов.** Весь геймплейный арт пересобран в едином стиле (плоский флеш-флэт
Iron Marines / Kingdom Rush + тёмный дизельпанк-металл; якорь — `docs/visual_refs/new_style.jpg`).
На диске: все фоны (дизельпанк/пустыня) + **7 пер-левел арен** (`bg_lvl_1…bg_lvl_7`,
каждая с дорогой, **запечённой под форму пути уровня**: кольцо для `bottom`, L-скоба
для `top`/`left`/`right`; BattleScene берёт `bg_<levelId>`, фоллбек на `bg_level`),
**тематическая карта мира** (`bg_worldmap`, 9:16: 7 биомов уровней полосами снизу
вверх под серпантин узлов),
**боевая доска** (`platform_board` — топ-даун плита, чьи 9 утопленных сокетов = слоты
постройки; `PlatformGrid` рисует её вместо процедурной плиты, `SlotView` сокеты больше
не рисует; геометрия слотов трассирована из арта в `gridMetrics`), логотип, аватар + рамка,
иконки ресурсов, **6 башен** (ручные спрайты) + **6 фьюжн-гибридов**
(`steam_cannon`/`cryo_discharge`/`ion_volley`/`thermo_spear`/`icebreaker`/`gauss_coil`) +
**2 направленных 3×3-шита** (`plasma_shutter_dirs`/`railgun_dirs` — поворот вращающихся
турелей; остальные башни статичны), **8 врагов** (5 базовых + диверсант + 3 моба поддержки
`enemy_resonance_mote`/`enemy_coolant_mender`/`enemy_aegis_beacon`), узлы карты, **звезда оценки**
(`icon_star`), **3 карты модернизации** (`isolation_circuit`/`elemental_focus`/
`emergency_overdrive`) и **5 символов стихий** (`sym_*`, см.
[docs/done/tower-readability.md](docs/done/tower-readability.md) §3). HUD-чром
(панели/кнопки/бейджи) рисуется **процедурно** (`drawPanel` — тёмный металл + заклёпки +
фаска); боевая плита и сокеты слотов теперь из спрайта `platform_board` (см. выше),
legacy-спрайты `ui_panel`/`ui_button`/`ui_card_frame` в коде не подключены. Плейсхолдерами остаются `decor_pylon` (нигде не подключён) и
`icon_reactor` (намеренно берёт `ui_button_overdrive` через `ASSET_FALLBACKS`). Полный
список ключей — в [src/config/assetManifest.ts](src/config/assetManifest.ts).
