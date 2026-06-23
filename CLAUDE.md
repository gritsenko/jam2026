# jam2026 — «Synergy Grid TD» (прототип)

Tower-defense / merge-карточная игра. На платформе есть поле слотов `3×3`, в них
ставятся карты-турели; карты транслируют баффы соседям по направлениям, мерджатся
в грейды и взаимодействуют по таблице стихийных синергий. Дизайн карт и баланс —
в [docs/cards.md](docs/cards.md) и [docs/cards.json](docs/cards.json). Полное ТЗ
каркаса — [BRIEF.md](BRIEF.md). Визуальный референс — [docs/style_ref.png](docs/style_ref.png).

## Текущее состояние (ВАЖНО)

Сейчас это **играбельный каркас**, а не игра: навигируемая оболочка из трёх сцен
с полностью свёрстанным боевым HUD на **замоканных данных**. Архитектура подготовлена
под геймплей, но самого геймплея ещё нет.

**Боевой логики НЕТ** — синергия стихий, мердж карт, расчёт нагрузки/перегрузки
энергии, волны и экономика не реализованы. HUD реагирует на ввод (drag&drop,
тапы), но все цифры статичны и берутся из мока `src/config/battleState.ts`;
действия вроде «положить карту в слот» или «сжечь в Реакторе» только пишут лог в
консоль. Не считай, что какая-то боевая механика уже работает — проверяй по коду.

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
  ui/                   # переиспользуемые компоненты (Button, BattleCard, EnergyGauge,
                        #   PlatformGrid, SlotView, ReactorZone, HeroAvatar, ResourceChip,
                        #   WaveBadge, EnemySprite, WorldMapNode, SceneBackground, helpers)
  scenes/               # MainMenuScene, WorldMapScene, BattleScene
  config/               # ДАННЫЕ отдельно от логики: types, cards, enemies, levels,
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
(28 из 30 ключей манифеста): все фоны, платформа, логотип, аватар + рамка, иконки
ресурсов, UI-чром, все 6 карт-турелей, 4 врага и узлы карты уровней. Плейсхолдерами
остаются только `decor_pylon` (декор, нигде не подключён) и `icon_reactor` (намеренно
берёт `ui_button_overdrive` через `ASSET_FALLBACKS`). Полный список ключей с промптами —
в [src/config/assetManifest.ts](src/config/assetManifest.ts) (комментарий «status note»
в его шапке устарел — сверяйся с диском).
