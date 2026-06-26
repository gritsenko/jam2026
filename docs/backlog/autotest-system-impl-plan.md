# План реализации: Система автотеста и балансировки

**Статус:** план реализации (без кода) для спеки
[autotest-system.md](autotest-system.md)
**Подход:** общий `BattleCore` (единый источник правды) + seeded RNG + играбельная
тест-копия; полный замкнутый цикл (стадии 0–4).

**Часть кластера тулинга геймдизайна** — см. также:
[config-as-data.md](config-as-data.md) (JSON-данные + варианты конфига — **фундамент**,
бот читает данные через него), [design-editor.md](design-editor.md) (редактор сетов),
[analytics-and-backend.md](analytics-and-backend.md) (бэкенд `sim/server/` + телеметрия
реальных игроков; `runs.jsonl` и события игроков сходятся в единый `aggregate`).

> **Статус реализации (обновлено):** baseline-бот РЕАЛИЗОВАН (`sim/bot/`) и проверен —
> headless, **без полного `BattleCore`**: гоняет реальный `BattleSim` напрямую, собирая
> башни как сцена (`syncTowers`) через вынесенную чистую геометрию
> [src/game/platformGeometry.ts](../../src/game/platformGeometry.ts) (её же теперь
> использует `PlatformGrid` — единый источник). Детерминированно (фикс-dt 1/60, перегрузка
> подаётся по-тиково как в сцене), 2 политики (`seeded` / `greedyFill`), цикл
> levels × policies × seeds → `sim/out/runs.jsonl` + сводка winrate + опц. `POST /ingest/runs`.
> Рекордер маппит колбэки в Run record, совместимый с `aggregate` (`source:bot` рядом с
> `user`; проверено на дашборде). Запуск: `tsx sim/bot/run.ts` (или кнопка **run bot** в
> редакторе). **Обновление:** **seeded RNG** в `BattleSim` РЕАЛИЗОВАН (опц. `rng`,
> per-enemy sub-stream, дефолт = старый sin-хеш — прод неизменён; общий `src/game/rng.ts`).
> **`BattleCore` РЕАЛИЗОВАН** ([src/game/BattleCore.ts](../../src/game/BattleCore.ts)) —
> headless движок решений+экономики (place/merge/burn/reroll/fusion/modernization +
> энергосеть/синергия/tower-spec, обёртка над seeded `BattleSim`); бот переведён на него,
> паритет точный (SEEDS=10 и 1000 совпали байт-в-поведение). **Не сделано:** политики бота
> по действиям во времени + обучение/поиск, играбельный `SandboxScene`, миграция
> продакшн-`BattleScene` на `BattleCore`, анализатор коридоров/диагнозов и генератор
> change-request (стадии 2–4).

## Контекст

[autotest-system.md](autotest-system.md) описывает замкнутый агентный конвейер
балансировки: **headless-бот прогоняет сотни seeded-сессий → телеметрия `runs.jsonl` →
анализатор `aggregate.json` + диагнозы → генератор `change-request` → исполнитель-агент
правит конфиги под ревью → перепрогон.** Сейчас балансировка ручная; цель —
воспроизводимый цикл с метриками и целевыми коридорами.

**Что уже в нашу пользу:**
- [src/game/BattleSim.ts](../../src/game/BattleSim.ts) — **полностью headless** (без Pixi):
  `new BattleSim(opts)`, `.start()`, `.update(dt)`, `.setTowers(specs)`, богатые колбэки
  (`onEnemyKilled/Leaked/Damaged`, `onWaveStart/Cleared`, `onVictory/Defeat`), читаемое
  состояние (`coreHp`, `status`, `waveNumber`, `totalWaves`).
- Чистые хелперы уже извлечены: `buildTowerSpec` (BattleSim.ts:843), `computeSynergy`
  ([src/game/synergy.ts](../../src/game/synergy.ts)), `cardLoad`
  ([cards.ts:370](../../src/config/cards.ts)), цены реролла/овердрайва/фьюжна.
- Конфиг-слой ([src/config/](../../src/config/)) — чистые типизированные экспорты =
  готовые «семейства переменных» для `change-request`. После
  [config-as-data.md](config-as-data.md) эти данные живут в JSON-сетах
  (`src/data/game_configs/<name>/`): бот/сим читают активный конфиг через `src/data/load.ts`
  (`loadGameConfig(name)` / `GAME_CONFIG=<name>`) → **разные балансы тестируются «из
  коробки»**, а `change-request` правит JSON выбранного сета.

**Два препятствия:**
1. **Нет сидированного RNG.** Единственная случайность сима — `BattleSim.roll()`
   (BattleSim.ts:743) на `Math.sin(id*… + clock*…)`: детерминирована по (id, clock), но
   **зависит от FPS**; добор руки на `Math.random()` (battleRules.ts:85). §11 спеки делает
   детерминизм жёстким предусловием.
2. **Слой решений запутан в [BattleScene.ts](../../src/scenes/BattleScene.ts)** (~2755
   строк, Pixi hit-tests по экранным координатам) — бот не может его переиспользовать.

## Решения

- **Скоуп: полный цикл (стадии 0–4).**
- **Подход B — вынести общий `BattleCore`** (единый источник правды place/merge/reroll/
  экономики), чтобы убить дрифт между ботом и игрой.
- **Сидировать RNG безопасно, через изолированную тестовую копию**, которую можно
  **проиграть самому**, не ломая текущее состояние `main`.

**Реконсиляция** → ключевое архитектурное решение: `BattleCore` строится как **новый,
отдельный, seeded-движок**. Его потребляют **и headless-бот, и новая играбельная
`SandboxScene`**. **Продакшн [BattleScene.ts](../../src/scenes/BattleScene.ts) не
трогаем** до самого конца — он остаётся рабочим (текущее состояние не ломается). Только
финальной, отдельно ревьюимой стадией переводим продакшн-сцену на `BattleCore` — эта
миграция и обеспечивает обещанный «нулевой дрифт» подхода B. Вся работа — на ветке.

---

## Архитектура

```
                 ┌─────────────────────────────┐
                 │  BattleCore (новый, seeded)  │  единый источник правды
                 │  platform 9 слотов + ledger  │  (gold/crystals)
                 │  hand/deck (seeded draw)      │
                 │  actions: place/merge/fusion/ │
                 │    burn/reroll/modernization  │  ← чистые, валидируют легальность+цену
                 │  energy load/capacity/overload│
                 │  ⮑ оборачивает BattleSim      │  (seeded roll)
                 └──────┬───────────────┬────────┘
                        │               │
          ┌─────────────▼──┐      ┌─────▼───────────────┐
          │ Headless bot   │      │ SandboxScene (Pixi) │  ← играбельная тест-копия
          │ (sim/, policy) │      │ новый роут 'sandbox'│
          └───────┬────────┘      └─────────────────────┘
                  │ runs.jsonl
          ┌───────▼────────┐  aggregate.json   ┌───────────┐
          │ Анализатор     │ ────────────────▶ │ Дашборд   │
          │ + коридоры     │                   │ (HTML)    │
          └───────┬────────┘ diagnoses
                  │
          ┌───────▼────────────┐ change-request  ┌──────────────────┐
          │ Генератор ТЗ       │ ──────────────▶ │ balance-sim agent │ → HITL → перепрогон
          └────────────────────┘  sim/proposals/ └──────────────────┘
```

**Раскладка в репозитории** (по §5.4 спеки):
```
sim/
  core/
    rng.ts            mulberry32 seeded PRNG (+ fork для подпотоков)
    BattleCore.ts     движок: platform + ledger + hand + actions, оборачивает BattleSim
    recorder.ts       подписка на колбэки → Run record
  policies/           боты-стратегии: mono.ts, random.ts, synergyPair.ts, greedyDps.ts
  run.ts              прогон: levels × seeds × policies → out/runs.jsonl
  analyze/
    aggregate.ts      runs.jsonl → out/aggregate.json
    corridors.ts      целевые коридоры (значения из gamejam-spark)
    diagnose.ts       метрики вне коридора → diagnoses
    propose.ts        diagnoses → sim/proposals/<id>.json (с гардрейлами)
  dashboard/
    build.ts          aggregate.json → out/dashboard.html (статический; live-режим — GET /aggregate)
  server/             бэкенд телеметрии — см. analytics-and-backend.md (Fastify + SQLite)
  out/                runs.jsonl, aggregate.json, dashboard.html, telemetry.db  (.gitignore)
  proposals/          change-request, и для людей, и для агента
src/data/             JSON ConfigSet'ы + загрузчик — см. config-as-data.md
src/telemetry/        эмиттер событий реальных игроков — см. analytics-and-backend.md
src/scenes/SandboxScene.ts   играбельная тест-копия на BattleCore
.claude/agents/balance-sim.md  сабагент-исполнитель (стадия 4)
docs/working/autotest-system.md  перенос спеки из backlog/ при реализации
```

---

## Детерминизм: сидированный RNG

**`sim/core/rng.ts`** — `mulberry32` (одно 32-битное состояние, сериализуемо):
```
makeRng(seed: number) -> { next(): number /*[0,1)*/, fork(salt: number): Rng }
```
`fork` даёт детерминированные подпотоки: отдельный для боевых roll'ов, отдельный для
добора руки — чтобы изменение логики добора не возмущало боевую случайность.

**Минимальная правка [BattleSim.ts](../../src/game/BattleSim.ts):**
- В `BattleSimOptions` (BattleSim.ts:172) добавить `rng?: Rng` (опционально). В
  конструкторе (:244) сохранить.
- Тело `roll(chance, e)` (:743): если `rng` задан → `this.rng.fork(e.id).next() < chance`
  (форк по `e.id` снимает зависимость от FPS и порядка итерации). **Если `rng` не задан →
  старый sin-хеш** → продакшн-поведение байт-в-байт неизменно. **Риск близок к нулю.**
- Добор руки: `rollHandCard()` (battleRules.ts:85) принимает опциональный `rng =
  Math.random` — тот же неразрушающий паттерн.
- Гарантия FPS-независимости: харнесс **всегда** гонит `.update(dt)` с **фиксированным dt**
  (1/60) — никакого `requestAnimationFrame`-тайминга.

«Тестовая копия» = `BattleCore` создаёт `BattleSim` с заданным `rng`; `SandboxScene`
позволяет проиграть seeded-сессию руками и сверить ощущение с живой игрой.

---

## Стадии

### Стадия 0 — Фундамент: BattleCore + играбельный Sandbox (de-risk)
**Даёт:** seeded-движок и **играбельную тест-копию**; `main`/BattleScene не тронуты.
- Ветка `balance/autotest`; `tsx` в `devDependencies`; npm-скрипты `sim`, `sim:analyze`,
  `sim:dashboard`.
- `sim/core/rng.ts`; правка `roll` + опциональный `rng` в BattleSim (см. выше).
- `sim/core/BattleCore.ts` — **единый движок**: данные берёт через активный `ConfigSet`
  (`src/data/load.ts`, [config-as-data.md](config-as-data.md)) → гоняется по любому варианту
  баланса. Модель 9 слотов (на базе формы
  `BattleStateMock` из [battleState.ts](../../src/config/battleState.ts)), ledger
  gold/crystals, hand/deck с seeded-добором и кулдауном 4с, чистые action-аппликаторы
  (`place/merge(field)/merge(hand)/fusion/burn/reroll/modernization`) — **переиспользуют**
  `cardLoad`/`computeSynergy`/`buildTowerSpec`/`fusionGoldCost`/`overdriveCost`/`REROLL_*`,
  ничего не дублируя из правил; пересборка `TowerSpec[]` → `BattleSim.setTowers`.
- `src/scenes/SandboxScene.ts` + роут `'sandbox'` в [main.ts](../../src/main.ts) (тонкий
  вид над `BattleCore`; можно переиспользовать UI-компоненты из `ui/`). Вход — ненавязчивый
  dev-вход (query-параметр / dev-кнопка), чтобы продакшн-поток не менялся.
- **Валидация:** проиграть Sandbox руками (фиделити-проверка человеком) + смоук-прогон
  одного фикс-билда headless.
- **Объём: высокий** (сердце системы). **Дрифт: нулевой к продакшну** (BattleScene не тронут).

### Стадия 1 — Бот + телеметрия + дашборд (мерящая половина)
**Даёт:** воспроизводимые прогоны политик по lvl_1..lvl_7, `runs.jsonl`, статический HTML.
- `sim/core/recorder.ts` (маппинг колбэков → Run record, см. ниже).
- `sim/policies/`: `mono.ts` + `random.ts` (baseline) сразу; `synergyPair.ts`,
  `greedyDps.ts` следом. Политика = `(state, unlocks, rng) -> Action` каждый ход.
- `sim/run.ts` — цикл (gameConfig ×) levels × seeds × policies, фикс-dt, append в
  `out/runs.jsonl` (`GAME_CONFIG=<name>` выбирает баланс — [config-as-data.md](config-as-data.md)).
  `runs.jsonl` импортируется в бэкенд (`sim/server/import.ts`,
  [analytics-and-backend.md](analytics-and-backend.md)) рядом с телеметрией реальных игроков.
- `sim/dashboard/build.ts` — `aggregate.json` → `out/dashboard.html` (4 пласта §6:
  сложность/винрейт, экономика-краны, прогрессия-стоки, пейсинг; вердикт по коридору;
  сравнение версий по `meta.balanceVersion`).
- **Объём: средний.** **Дрифт: нулевой** (вся логика — в BattleCore).

### Стадия 2 — Анализатор: коридоры + диагнозы
- `sim/analyze/aggregate.ts` (группировка по (stage, policy): winRate, avgWaveReached,
  avgCoreHpEnd, leakRate, avgNetGold, perfectRate) → `out/aggregate.json` (поле
  `meta.balanceVersion` обязательно — git sha конфигов).
- `sim/analyze/corridors.ts` — декларативные коридоры (винрейт 0.55–0.70 и т.д.), каждый
  помечен **семейством переменных** (enemies/levelCombat/waves/cards/battleRules/…).
  **Значения коридоров берём из скилла `gamejam-spark`** (балансная линза), а не на глаз.
- `sim/analyze/diagnose.ts` — метрики вне коридора → `diagnoses {metric, where, observed,
  target, severity, family}`.
- **Объём: средний.** **Дрифт: нет** (только чтение/анализ).

### Стадия 3 — Генератор change-request
- `sim/analyze/propose.ts` → `sim/proposals/<id>.json` по схеме §5.3: каждый `change`
  привязан к метрике, указывает `file`/`key`/`current`/`proposed`/`family`/`rationale`/
  `expectedEffect`. Генератор сам соблюдает гардрейлы: клампит `proposed` по
  `maxDeltaPct`, эмитит только одно семейство (`oneFamilyPerIteration` — высшая severity).
  Направление правки — маленькая таблица правил по `(metric, family)`.
- **Объём: низкий–средний.** **Дрифт: нет** (read-only артефакт).

### Стадия 4 — Исполнитель + HITL-петля + миграция продакшна
- Сабагент **`balance-sim`** (`.claude/agents/balance-sim.md`, со скиллом `gamejam-spark`):
  читает `change-request`, вносит **только** перечисленные правки в `src/config/*` на ветке
  `guardrails.branch`, не превышает `maxDeltaPct`, одно семейство за итерацию, затем
  `npm run sim` + `sim:analyze` и заполняет `verification`. По умолчанию **только
  предлагает**; авто-тюн — по явной команде. ТЗ и итоговый мердж — под подтверждением
  человека (HITL, §10).
- **Миграция продакшна (riskiest, в конце, отдельный ревью):** перевести
  [BattleScene.ts](../../src/scenes/BattleScene.ts) на потребление `BattleCore` (сцена =
  вид), убрав дублирующую логику решений. Гейт — пройденная валидация Sandbox+бота. **Это
  и есть обещанный «нулевой дрифт» подхода B.** Можно отложить как пост-джем: до миграции
  Sandbox+бот используют BattleCore, продакшн — старый код (тогда дрифт временно
  существует, но измеряется через Sandbox).
- **Объём: средний.** **Риск: высокий** — единственная стадия, пишущая в `src/config` и
  трогающая живую сцену; строго под HITL + ветка.

---

## Run record: маппинг кранов/стоков на схему §5.1

`sim/core/recorder.ts` подписан на колбэки `BattleCore`/`BattleSim`:

**Краны (faucets):**
- `onEnemyKilled(e)` → `faucets.killBounty += e.bounty`; элита → `faucets.eliteCrystals +=
  e.crystalBounty` ([enemies.ts](../../src/config/enemies.ts)).
- `onWaveCleared(n, perfect)` → `faucets.waveClearBonus += WAVE_CLEAR_BONUS (25)`;
  `perfect` → `faucets.perfectCrystals += PERFECT_CLEAR_CRYSTALS (15)`
  ([combatRules.ts](../../src/config/combatRules.ts)).

**Стоки (sinks)** — из action-аппликаторов BattleCore:
- place → `costGold/costCrystals`; merge → стоимость грейда; fusion → `fusionGoldCost`+1
  кристалл; reroll → `REROLL_BASE_COST + step`; burn → `overdriveCost`.

**Прочее:** `seed`, `policy`, `stage` (lvl_id) — на старте сессии; `outcome` ←
victory/defeat (+`timeout` по лимиту тиков); `durationSec = tickCount * dt`
(детерминированно, не wall-clock); `entities` ← счётчики kills/leaks/damage; `progress` ←
`{waveReached, totalWaves, coreHpEnd, coreMax}`; `perfectWaves`. Запись — построчно в
`sim/out/runs.jsonl` (`fs.appendFileSync`).

---

## Тулчейн
- **`tsx`** в `devDependencies` (запуск TS-харнесса без сборки). Не нарушает правило
  «единственная рантайм-зависимость = pixi.js» — это dev-dep (как vite/typescript).
- npm-скрипты: `"sim": "tsx sim/run.ts"`, `"sim:analyze": "tsx sim/analyze/index.ts"`,
  `"sim:dashboard": "tsx sim/dashboard/build.ts"`.
- `tsconfig` покрывает `sim/` → `noUncheckedIndexedAccess` действует и в харнессе.
- `sim/out/` — в `.gitignore`; `sim/proposals/` — коммитим (артефакты для людей+агента).

## Критические файлы
- [src/game/BattleSim.ts](../../src/game/BattleSim.ts) — `roll` (:743) + опциональный `rng`
  в опциях (:172)/конструкторе (:244); `setTowers` (:286), `buildTowerSpec` (:843).
- [src/config/battleRules.ts](../../src/config/battleRules.ts) — `rollHandCard` (:85),
  цены стоков.
- [src/config/combatRules.ts](../../src/config/combatRules.ts) — `WAVE_CLEAR_BONUS`,
  `PERFECT_CLEAR_CRYSTALS`, `CORE_MAX` (значения кранов + коридоры).
- [src/config/levelCombat.ts](../../src/config/levelCombat.ts) — `LEVEL_COMBAT` (главная
  цель change-request: hpScale/bountyScale/waves/pathId).
- [src/config/battleState.ts](../../src/config/battleState.ts) — форма стартового
  состояния для модели платформы BattleCore.
- [src/main.ts](../../src/main.ts) — регистрация роута `'sandbox'`.
- [package.json](../../package.json) — `tsx` + `sim*` скрипты.

## Verification
1. `npm run typecheck` после каждой стадии (strict, build падает на типах).
2. **Стадия 0:** `npm run dev`, открыть Sandbox-роут, проиграть seeded-сессию руками —
   поведение совпадает с обычным боем; смоук headless-прогон одного билда завершается
   victory/defeat без исключений.
3. **Детерминизм:** один и тот же `seed`+политика+уровень дважды → идентичные `runs.jsonl`
   строки (побайтно по детерминированным полям).
4. **Стадия 1:** `npm run sim` пишет `runs.jsonl`; `npm run sim:dashboard` открывает
   `dashboard.html` с непустыми панелями винрейта/экономики.
5. **Стадия 2–3:** заведомо «сломанный» конфиг (напр. lvl_6 hpScale ×2) → диагноз
   winRate-cliff на stage:6 и `change-request` с правкой семейства `levelCombat` в коридоре.
6. **Стадия 4:** `balance-sim` применяет ТЗ на ветке, перепрогон сидов двигает целевую
   метрику к коридору; иначе откат (гардрейл §10).

## Открытые вопросы
- **Значения коридоров** — берём из `gamejam-spark`; нужен ли отдельный проход скилла,
  чтобы зафиксировать целевые винрейт/пейсинг под наши 7 уровней?
- **Sandbox: вход** — пункт в меню, query-параметр или dev-only кнопка? (по умолчанию —
  ненавязчивый dev-вход).
- **Сетка прогона** — сколько seeds × policies на уровень для статзначимости (старт: 30
  сидов × 4 политики)?
- **Миграция продакшн-BattleScene на BattleCore** — в этот заход или пост-джем? (риск
  высокий; по умолчанию — последней стадией под отдельный ревью).
- **Перенос спеки** [autotest-system.md](autotest-system.md) → `docs/working/` при старте
  реализации (правило синхронизации CLAUDE.md).
