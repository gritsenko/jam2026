# Конфиг как данные: JSON ConfigSet + переключаемые варианты

> **Статус реализации (обновлено):** контент-слайс РЕАЛИЗОВАН и проверен.
> На JSON переведены **карты, враги, уровни, levelCombat, волны, резонанс, рецепты,
> прогрессия-анлоки** (`src/data/game_configs/<name>/*.json`); инфраструктура — `src/data/`
> (`schema.ts`/`registry.ts`/`load.ts` с `activeGameConfig`, dev-`validate.ts`). Существующие
> `src/config/*.ts` остались точками входа (читают `activeGameConfig.*`), вычисляемые функции/
> кэши не тронуты. Есть второй конфиг `game_config_id000001` (копия) + переключение `?game_config=` /
> `localStorage` / `GAME_CONFIG`. Проверено: typecheck зелёный, JSON byte-в-byte
> (round-trip дампа), игра грузится и играет идентично, dev-валидатор проходит.
> **Обновление:** числовые tunables `combatRules`/`battleRules` и стартовый `battleSeed`
> ТЕПЕРЬ тоже в JSON (ключи = имена TS-экспортов, byte-в-byte через дамп; `ENEMY_PATH`/
> `overdriveCost`/`rollHandCard`/`DRAW_POOL` остаются производными в TS). Дамп —
> `tools/dump_config.ts`. **config-as-data полностью покрыл игровые данные.**

**Статус:** план реализации (без кода). Фундамент для
[редактора геймдизайна](design-editor.md), [аналитики/бэкенда](analytics-and-backend.md)
и [бот-тестера](autotest-system-impl-plan.md).

## Контекст

Весь игровой дизайн сейчас захардкожен в TS-константах в [src/config/](../../src/config/):
`CARDS` ([cards.ts](../../src/config/cards.ts)), `ENEMIES`
([enemies.ts](../../src/config/enemies.ts)), `LEVELS` ([levels.ts](../../src/config/levels.ts)),
`LEVEL_COMBAT` ([levelCombat.ts](../../src/config/levelCombat.ts)), `WAVES`
([waves.ts](../../src/config/waves.ts)), `REACTIONS`
([resonance.ts](../../src/config/resonance.ts)), `RECIPES`
([fusion.ts](../../src/config/fusion.ts)), `LEVEL_UNLOCKS`
([progression.ts](../../src/config/progression.ts)) и числовые наборы
([combatRules.ts](../../src/config/combatRules.ts)/[battleRules.ts](../../src/config/battleRules.ts)).
`docs/cards.json` — **легаси**, игрой не читается (другая модель данных).

Чтобы редактор мог сохранять правки, а бот — гонять разные балансы, данные нужно вынести
из кода в **редактируемый JSON**, не сломав игру и не нарушив правило «единственная
рантайм-зависимость = `pixi.js`».

**Опора:** в [tsconfig.json](../../tsconfig.json) уже включён `resolveJsonModule` →
статический `import x from './x.json'` работает и в Vite, и в `tsx` (Node-харнесс).

## Решение

- Чистые **данные** → JSON в `src/data/game_configs/<name>/`. Чистые **функции/производные**
  остаются в TS и работают поверх загруженных данных.
- Существующие `src/config/*.ts` **остаются точками входа** с теми же экспортами — меняется
  только источник значения (`CARDS = activeGameConfig.cards`). Консьюмеры (12 файлов, `BattleSim`,
  `BattleScene`, `synergy`, UI…) **не трогаем**.
- **Синхронный eager-импорт** JSON через статический реестр → порядок инициализации
  ES-модулей сохраняется, top-level производные (`DRAW_POOL`, `BY_PAIR`, `LEVEL_ORDER`,
  `CARD_LIST`, `ENEMY_BY_ID`) продолжают считаться как раньше. **Никакого async** — иначе
  производные посчитаются раньше, чем приедут данные.
- Несколько **ConfigSet** (`default`, `variant-*`) + резолвер активного сета → один и тот же
  баланс переключается в игре, редакторе и боте.

## Раскладка

```
src/data/
  game_configs/
    default/
      cards.json   enemies.json   levels.json   levelCombat.json
      waves.json   resonance.json fusion.json   progression.json
      combatRules.json  battleRules.json  battleSeed.json
    game_config_id000001/   # копия default с другим балансом (пример; редактор
                            # автогенерит id вида game_config_id<N>)
  registry.ts           # статические импорты всех конфигов + доменные аннотации (валидация tsc)
  load.ts               # activeGameConfig, loadGameConfig(name), resolveGameConfigName()
  schema.ts             # тип GameConfig + DTO-нарроверы (tuple/union) + CombatRules/BattleRules
  validate.ts           # dev-only кросс-ссылочные ассерты (под import.meta.env.DEV)
```

Кладём в `src/data/` (а не корневой `data/`, где легаси `cards.json`): `src/` уже в
`include` tsconfig и резолвится Vite без возни с `publicDir`.

### `ConfigSet` (schema.ts)

```ts
export interface ConfigSet {
  cards: Record<string, CardDef>;
  enemies: EnemyDef[];
  levels: LevelNode[];
  levelCombat: Record<string, LevelCombat>;
  waves: WaveDef[];
  reactions: readonly Reaction[];
  recipes: Record<string, string>;
  levelUnlocks: Record<string, { towers: string[]; mechanics: string[] }>;
  startingTowers: readonly string[];
  combatRules: CombatRules;   // числовой набор из combatRules.ts
  battleRules: BattleRules;   // числовой набор из battleRules.ts
  battleSeed: BattleStateMock; // seed для createBattleState
}
```

Типы `CardDef`/`EnemyDef`/`WaveDef`/`BattleStateMock` берём из
[types.ts](../../src/config/types.ts); интерфейсы `Reaction`/`LevelCombat` рекомендуется
перенести в `types.ts` (единый источник типов), но это не блокер.

## Что в JSON / что в TS

**В JSON (чистые данные):** `CARDS`, `ENEMIES`, `LEVELS`, `LEVEL_COMBAT`, `WAVES`,
`REACTIONS`, `RECIPES`, `LEVEL_UNLOCKS`, `STARTING_TOWERS`, числовые наборы
`combatRules`/`battleRules`, seed из `battleState.ts`.

**Остаётся в TS (функции и производные):** `getCard`, `cardGrade`, `synergySlots`,
`cardLoad`, `getEnemy`, `pairKey`, `reactionFor`, `getReaction`, `fusionResult`,
`fusionGoldCost`, `overdriveCost`, `rollHandCard`, все `unlocked*`/`towersUnlockedByClearing`/
`starsForClear`, `combatForLevel`, `createBattleState`, и все кэши/индексы (`CARD_LIST`,
`ENEMY_BY_ID`, `BY_PAIR`/`BY_ID`, `DRAW_POOL`, `MOD_CARD_POOL`, `LEVEL_ORDER`, `ENEMY_PATH`).

**Тонкость `ENEMY_PATHS`:** в коде это `Record<PathId, readonly PointData[]>` (Pixi-тип). В
JSON храним `{x,y}[]` — структурно совместимо с `PointData[]`, присваивается без касты.
Бонус: данные перестают тянуть `pixi.js` → чище для headless-сима.

## Активный конфиг и переключение (load.ts)

`load.ts` экспортирует `const activeGameConfig: GameConfig` (вычислен **синхронно** на загрузке
модуля) и `loadGameConfig(name): GameConfig`. Имя активного конфига — `resolveGameConfigName()` по
приоритету:

1. явный параметр (`loadGameConfig('game_config_id000001')`) — для сима/бота/редактора;
2. браузер: `?game_config=game_config_id000001` → `localStorage['sgtd.gameConfig']` → `default`;
3. Node/tsx: `process.env.GAME_CONFIG` → `default`.

`registry.ts` импортирует все конфиги статически (eager) → `activeGameConfig` готов раньше любого
`config/*.ts`, который его читает. Резолвер не должен тянуть DOM на Node-пути (гард по
`typeof window`/`process`), чтобы tsx-сим импортировал `config/*` без браузера. **Не
используем `import.meta.glob`** на Node-пути — ручной реестр изоморфен (Vite + tsx).

После рефактора, например:
```ts
// src/config/cards.ts
import { activeGameConfig } from '../data/load';
export const CARDS = activeGameConfig.cards;   // было: литерал
export const CARD_LIST = Object.values(CARDS); // производное — без изменений
export function getCard(...) { /* без изменений */ }
```

Переключение в рантайме браузера = `localStorage.setItem('sgtd.gameConfig', x)` + reload
(конфиг фиксируется на загрузку — балансы переключают редко). Для сима — другой
`GAME_CONFIG`/параметр на старте процесса.

## Валидация JSON против типов (без рантайм-зависимостей)

- **Слой 1 — compile-time (главный, бесплатный):** в `registry.ts` каждый импортированный
  JSON присваиваем переменной с явной доменной аннотацией
  (`const cards: Record<string, CardDef> = cardsRaw`). `tsc --noEmit` (уже в
  `build`/`typecheck`) ловит структурные расхождения и узкие union'ы (`ElementId`,
  `PathId`). TS типизирует JSON широко (string вместо литерала, array вместо tuple) →
  для `grades:[g,g,g]` и подобного нужны DTO-нарроверы в `schema.ts`.
- **Слой 2 — dev-only `validate.ts`:** лёгкие ручные ассерты (без zod), вызов один раз из
  `load.ts` под `import.meta.env.DEV` (в prod tree-shake'ится). Проверяет то, что tsc не
  ловит: `grades.length === 3`, `element ∈ ELEMENT_IDS`, и **ссылочную целостность** — каждый
  `enemyId` в waves есть в `ENEMIES`, результаты `RECIPES` есть в `CARDS`, ключи
  `LEVEL_UNLOCKS` ⊆ `LEVELS`. Бросает с понятным сообщением — ловит балансные опечатки в
  variant-сетах рано.

Разовый перенос данных TS→JSON делаем вручную (данных немного); опционально —
одноразовый помощник `tools/dump_config.ts` (tsx), печатающий текущие константы в JSON.

## Миграция по шагам (на каждом `npm run typecheck` зелёный + игра работает)

0. `schema.ts` с типами `ConfigSet`/`CombatRules`/`BattleRules` (ничего не подключено).
1. **proof:** вынести `enemies.json` (простой массив), создать `registry.ts`+`load.ts` с одним
   полем, в `enemies.ts` заменить литерал на `activeGameConfig.enemies` с аннотацией.
2. Лёгкие наборы: `levels`, `waves`, `reactions`, `recipes`, `levelUnlocks`, `startingTowers`,
   числовые `combatRules`/`battleRules`/`battleSeed` — каждый мини-коммитом.
3. **Риск:** `cards` (tuple `grades` + union-литералы) — через нарроверы `schema.ts` +
   ассерт `grades.length===3` в `validate.ts`. Сверить `DRAW_POOL`/`MOD_CARD_POOL`/
   `createBattleState` (самые eager-зависимые).
4. `levelCombat` (фоллбек `combatForLevel`→`WAVES` сохранить).
5. Дописать кросс-ссылочные ассерты в `validate.ts`, дернуть из `load.ts` под DEV.
6. **Мульти-конфиг:** `resolveGameConfigName()` (query/localStorage/env) + второй конфиг `game_config_id000001`.
7. **sim-готовность:** убедиться, что `load.ts` не тянет браузер-специфику на Node-пути.

## Критические файлы

- [src/config/types.ts](../../src/config/types.ts) — источник типов (+ возможно `Reaction`/
  `LevelCombat`).
- [src/config/cards.ts](../../src/config/cards.ts) — самый рискованный перенос (tuple/union).
- [src/config/combatRules.ts](../../src/config/combatRules.ts),
  [src/config/battleRules.ts](../../src/config/battleRules.ts) — числовые наборы.
- [src/config/battleState.ts](../../src/config/battleState.ts) — seed-фабрика.
- Новые: `src/data/{registry,load,schema,validate}.ts`, `src/data/game_configs/<name>/*.json`.

## Верификация

1. `npm run typecheck` зелёный после каждого шага.
2. **«Байт-в-байт»:** при дефолт-конфиге поведение не меняется; разовый dev-ассерт
   `JSON.stringify(activeGameConfig.cards) === JSON.stringify(OLD_CARDS)` локально подтверждает
   точность сериализации.
3. **Варианты:** `?game_config=game_config_id000001` (игра) и `GAME_CONFIG=game_config_id000001`
   (сим) дают другой баланс без правки кода.

## Открытые развилки

- Авто-обнаружение сетов через `import.meta.glob` (удобно, но Vite-only) vs ручной
  `registry.ts` (изоморфно) — **рекомендация: ручной реестр**, glob опционально только в браузере.
- Перенос `Reaction`/`LevelCombat` в `types.ts` — рекомендуется, не блокер.
