# Редактор геймдизайна (dev-инструмент)

> **Статус реализации (обновлено):** PR-E1 РЕАЛИЗОВАН и проверен. Подстраница
> `editor.html` + `src/editor/` (dev-only, в прод-сборку не попадает — гейт
> `BUILD_EDITOR=1`); dev-эндпоинты чтения/записи конфигов — `src/editor/devPlugin.ts`
> (`/__editor/game_configs|game_config/<name>|save`, `apply:'serve'`). Редактирование: таблицы
> **врагов** (ключевые статы) и **уровней**, формы **levelCombat** (hpScale/bountyScale/
> pathId + waves-JSON), **карт** (скаляры + грейды-JSON), и raw-JSON для
> reactions/recipes/progression. Кнопки **save** (пишет JSON-конфиг на диск, без
> перезагрузки — `server.watch.ignored` на `src/data/game_configs`), **new (copy)**, **play
> this config ▶** (открывает игру `?game_config=<name>`). **PR-E2 добавил:** грейды карт
> формами, **визуальный билдер волн** (add/remove волн и групп, enemy-select/count/gap),
> **валидацию перед save** (`collectGameConfigIssues` из `src/data/validate.ts` блокирует
> битый конфиг), и кнопку **run bot ▶** (`POST /__editor/run-bot` спавнит `sim/bot/run.ts`
> с `GAME_CONFIG`, пушит в бэкенд через `INGEST_URL=VITE_TELEMETRY_URL`, показывает сводку
> winrate). Проверено: эндпоинты, save-round-trip, рендер (15 карт/7 уровней/40 волн),
> валидация, прод-сборка без редактора, run-bot возвращает сводку, typecheck.
> **Обновление 2026-06-26:** run-bot принимает **policy** (smart/seeded/greedyFill/
> randomBoard/all) и **seeds** (1–1000) из UI редактора → `POLICY`/`SEEDS` в харнессе.

**Статус:** план реализации (без кода). **Зависит от**
[config-as-data.md](config-as-data.md) — без JSON-слоя редактору нечего читать/писать.
Связан с [бот-тестером](autotest-system-impl-plan.md) и [аналитикой](analytics-and-backend.md).

## Контекст

Нужен интерфейс настройки геймдизайна — **уровни, башни, монстры** (и числовые правила),
с возможностью **тестировать разные варианты конфига** в игре и ботом. Игра — «чистый Pixi»,
поэтому редактор делаем **отдельным dev-инструментом**, который не попадает в продакшн-билд
и не тянет UI-фреймворки в игру.

После [config-as-data](config-as-data.md) дизайн живёт в `src/data/game_configs/<name>/*.json`, а
формы типов — в [types.ts](../../src/config/types.ts). Редактор — это типизированный CRUD
поверх `ConfigSet`.

## Хост: Vite multi-page подстраница

- Отдельная точка входа `editor.html` + код в `src/editor/` (раздел `build.rollupOptions.input`
  в [vite.config.ts](../../vite.config.ts)). Открывается на `/editor.html` в dev.
- **Dev-only:** исключаем из продакшн-сборки игры (отдельный input не входит в дефолтный
  `index.html`; либо отдельный build-таргет). Игра остаётся «pure Pixi + TS».
- Чистый HTML/TS (нативные `<form>`/`<table>`/`<input>`), без новых рантайм-зависимостей игры.
  Допустимы dev-only зависимости, как `tsx`/`vite` (если понадобится лёгкий UI-хелпер — по
  согласованию, но цель — обойтись нативом).

## Что редактируется

Редактор грузит выбранный `ConfigSet` и даёт типобезопасные формы/таблицы:

- **Башни** (`CARDS: Record<string, CardDef>`): id, name, element, baseLoad, costGold/Crystals,
  cooldown, category, buffStat, signature kind, slotElements/slotEffects, флаг hybrid, и
  **3 грейда** (`CardGrade`: damage/rangeCells/buff/sig/sig2/bonusDamage/diagonal). Подсказки
  по смыслу `sig` зависят от карты (урон/слоу%/цепь/пробитие/барьер/выход энергии).
- **Монстры** (`ENEMIES: EnemyDef[]`): id, name, element, maxHp, speed, bounty, coreDamage,
  archetype, поля прерывания (`interruptInterval/Chance/Crit`), `crystalBounty`, ауры
  (`auraRadiusFrac/auraHastePct/auraHealPerSec/allyShieldHp`).
- **Уровни** (`LEVELS: LevelNode[]` + `LEVEL_COMBAT`): узел карты (nx/ny), и боевой профиль —
  `waves` (группы `{enemyId,count,gap}`), `hpScale`, `bountyScale`, `pathId`.
- **Прогрессия** (`LEVEL_UNLOCKS`, `STARTING_TOWERS`), **резонанс** (`REACTIONS`), **фьюжн**
  (`RECIPES`), **числовые правила** (`combatRules`/`battleRules`).

Валидация при сохранении — через `src/data/validate.ts` (кросс-ссылки waves↔enemies,
recipes↔cards, unlocks↔levels; длины/диапазоны). Ошибки показываются в UI до записи.

## Поток работы

1. **Выбрать сет** (`default`/`variant-*`) или «создать вариант копией».
2. **Править** в формах/таблицах (живой in-memory `ConfigSet`).
3. **Валидация** (`validate.ts`) → список проблем; сохранение блокируется до их устранения.
4. **Сохранить** как существующий/новый конфиг → запись `src/data/game_configs/<name>/*.json`.

**Сохранение (развилка, рекомендация):** маленький **dev-эндпоинт записи файлов** —
плагин Vite dev-server (`configureServer`, middleware на `POST /__editor/save`), пишущий JSON
в `src/data/game_configs/`. Это даёт сохранение «в один клик» в dev. Фолбэк/альтернатива —
**экспорт-скачивание JSON** и ручной коммит (нулевая инфраструктура, ручной шаг). Dev-эндпоинт
живёт только в dev-конфиге Vite и в прод-игру не попадает.

## Тестирование варианта

- **«Играть этот конфиг»** → открыть игру с `?game_config=<name>` (резолвер `resolveGameConfigName()` из
  [config-as-data](config-as-data.md) подхватит сет).
- **«Прогнать ботом»** → запустить sim-харнесс с `GAME_CONFIG=<name>` (см.
  [autotest-system-impl-plan.md](autotest-system-impl-plan.md)); в UI редактора выбираются
  **политика** (`smart` / baseline / `all`) и **число сидов** (1–1000; для детерминированных
  политик сид игнорируется). Результат смотреть на дашборде (см.
  [analytics-and-backend.md](analytics-and-backend.md)), сравнивая `meta.balanceVersion`/сет
  с дефолтом.

## Критические файлы

- [vite.config.ts](../../vite.config.ts) — multi-page input `editor.html`, dev-плагин записи.
- [src/config/types.ts](../../src/config/types.ts) — формы для UI.
- `src/data/{load,validate}.ts` — загрузка/валидация сетов (из config-as-data).
- Новые: `editor.html`, `src/editor/` (страница, формы, сохранение).

## Верификация

1. `/editor.html` открывается в dev; грузит `default`, показывает башни/монстры/уровни.
2. Правка + сохранение пишет валидный JSON-сет; невалидный — блокируется с понятной ошибкой.
3. «Играть этот конфиг» открывает игру с применённым балансом (`?game_config=<name>`); «прогнать
   ботом» наполняет дашборд по этому сету.
4. Прод-сборка игры (`npm run build`) **не содержит** редактор и не тянет его зависимости.
