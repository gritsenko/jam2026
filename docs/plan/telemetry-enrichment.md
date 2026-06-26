# Стадия 1.5 — Обогащение телеметрии для балансного агента

**Статус:** планируемый инкремент к
[autotest-system-impl-plan.md](../backlog/autotest-system-impl-plan.md) (между стадиями 1 и 2).

**Основание:** аудит телеметрии 2026-06-26 — рабочая копия анализа в
`sim/out/telemetry-gap-analysis.md` (gitignore, не коммитится).

**Цель:** довести Run record и `aggregate` до уровня, на котором агент может не только
крутить винрейт/экономику (L1–L3), но и точечно править волны, синергии и башни (L4–L7),
а также сравнивать версии конфига в замкнутой петле (стадия 4).

---

## Контекст: что уже есть (стадия 1)

Реализовано и проверено:

- `BattleCore` + headless-бот (`sim/bot/`), политики `seeded` / `greedyFill` /
  `randomBoard` / `smart`
- `sim/bot/recorder.ts` → Run record → `sim/server/normalize.ts` → единый `aggregate`
- Live-дашборд (`sim/server/dashboard.ts`), фильтр `config` + compare
- Счётчики действий за забег: `rerolls`, `burns`, `fusions`, `perfectWaves` (фикс пайплайна
  2026-06-26)

**На этом срезе агент уровня L1–L3 уже возможен** (коридоры сложности, экономика, мобы).
Стадия 2 (`corridors.ts` / `diagnose.ts`) может стартовать параллельно с 1.5, но диагнозы
уровня «волна 6 пробита на 40%» и «резонанс не срабатывает» без 1.5 недоступны.

---

## Пробелы (gap-анализ)

| Сигнал | Нужен для | Статус |
|---|---|---|
| Исход, волна слива, `deathsByWave`, leakRate | L1 коридоры сложности | ✅ |
| Faucets/sinks по причинам (забег) | L2 экономика | ✅ |
| Kills/leaks по типам мобов | L3 контент | ✅ |
| **Per-wave бюджет урона** (входящий EHP vs нанесённый) | L4 точечная правка волн | ❌ |
| **Резонансы** (тип, частота срабатывания) | L5 синергии | ❌ |
| **Урон по карте** (`damageByCard`) | L6 башни | 🟡 прокси `damageByElement` + `shotsByCard` |
| **`balanceVersion` = sha конфига** | L7 before/after в петле | ❌ сейчас = имя сета (`default`) |
| Сетка 30 seeds × 4 политики | статзначимость коридоров | 🟡 дефолт 1×4 |
| Бот фьюзит / тестирует фьюжн-экономику | честность L2/L5 | 🟡 `fusions: 0` у `smart` |

**Асимметрия user vs bot:** у реальных игроков есть события `wave_combat_summary` и `econ`
по волнам; бот их не эмитит, `aggregate` всё равно суммирует в забег — per-wave слой
нужен в **обоих** пайплайнах и в схеме Run record.

---

## Уровни агента (целевое покрытие)

| Уровень | Что делает агент | Разблокирует стадия |
|---|---|---|
| **L1** | winRate, deathsByWave → `levelCombat` | 1 ✅ |
| **L2** | faucets/sinks → `battleRules`, `OVERDRIVE_*` | 1 ✅ |
| **L3** | kills/leaks по мобам → `waves`, `enemies` | 1 ✅ |
| **L4** | «волна N пробита» → правка одной волны | **1.5** (per-wave) |
| **L5** | резонанс under/over → `resonance.ts`, баффы | **1.5** (resonance log) |
| **L6** | мёртвая/доминирующая башня → `cards.ts` | **1.5** (damageByCard) |
| **L7** | сравнение до/после правки конфига | **1.5** (balanceVersion=sha) + стадия 4 |

---

## Scope стадии 1.5

### В scope

1. Расширение **Run record** и `AttemptSummary` (bot + user normalize)
2. Минимальные правки **BattleSim** / recorder для новых полей
3. Протаскивание в **aggregate** (опционально: отдельная панель «per-wave» на дашборде —
   только если не раздувает scope; иначе достаточно JSON в record + analyze на стадии 2)
4. **`balanceVersion`** при прогоне бота
5. Улучшение **`SmartController`**: осознанный fuse (чтобы фьюжн-экономика попадала в выборку)

### Вне scope (стадии 2–4)

- `corridors.ts`, `diagnose.ts`, `propose.ts` — стадия 2–3
- Сабагент `balance-sim` — стадия 4
- Простой/перегрев башен по времени (idle в overload) — отложить, низкий приоритет
- Полная паритетность user-events ↔ bot record (достаточно общей схемы полей)

---

## Задачи

### 1. Per-wave срез (`waves: WaveSlice[]`)

**Файлы:** `sim/bot/recorder.ts`, `sim/server/normalize.ts`, `sim/server/aggregate.ts`
(при необходимости), `src/telemetry/` (user events, если ещё не пишут срез в `level_end`).

**Схема:**

```ts
interface WaveSlice {
  wave: number;
  /** Суммарный maxHp заспавненных врагов волны (или bounty×k как прокси бюджета). */
  incomingEHP: number;
  /** Суммарный урон по врагам за волну. */
  dealtDamage: number;
  leaks: number;
  kills: number;
  /** Дельта gold за волну (краны − стоки), опционально разбивка по reason в props. */
  goldNet: number;
  perfect: boolean;
}
```

**Реализация (бот):**

- `onWaveStart(n)` — сбросить аккумулятор волны; записать `incomingEHP` из скрипта волны
  (`combatForLevel` → `waves[n-1]`, сумма `count × enemy.hp × hpScale`).
- Между start/cleared: накапливать `dealtDamage` (`onEnemyDamaged`), `kills`, `leaks`;
  дельту ledger gold (diff faucets/sinks снимка BattleCore или счётчики в recorder).
- `onWaveCleared(n, perfect)` — push `WaveSlice`, append в `waves[]`.

**User-пайплайн:** при сегментации `attemptsFromUserEvents` собирать `waves[]` из
`wave_combat_summary` + `wave_cleared` + накопленных `econ` между волнами (или дублировать
поля в одном событии на `wave_cleared`).

**Acceptance:** в `runs.jsonl` у smart-прогона lvl_4 есть массив длины `endedWave`;
на волне с поражением последний slice показывает `leaks > 0` и `dealtDamage < incomingEHP`.

---

### 2. Урон по карте (`damageByCard`)

**Файлы:** `src/game/BattleSim.ts` (колбэк), `sim/bot/recorder.ts`, `normalize.ts`.

**Изменение колбэка:**

```ts
onEnemyDamaged?(e, amount, crit, element, source?: { slotIndex: number; cardId: string }): void;
```

Проброс `slotIndex` / `cardId` из места нанесения урона (tower fire, chain, resonance proc).

**Recorder:** `bump(damageByCard, cardId, amount)` параллельно `damageByElement`.

**Acceptance:** в Run record `damageByCard.plasma_shutter + frost_pulse + …` ≈ сумме
`damageByElement` (с учётом гибридов и резонансного урона — задокументировать атрибуцию:
резонанс → карта-источник реакции).

---

### 3. Счётчик резонансов (`resonanceFired`)

**Файлы:** `src/game/BattleSim.ts` или `synergy.ts` + recorder.

**Схема:**

```ts
resonanceFired: Record<string, number>; // steam_burst | superconductivity | shrapnel
```

Хук в момент срабатывания резонансной реакции (уже есть ветки в BattleSim для трёх типов).

**Acceptance:** при намеренной раскладке Fire+Water на соседних слотах в record
`resonanceFired.steam_burst > 0`.

---

### 4. `balanceVersion` = идентификатор снимка конфига

**Файлы:** `sim/bot/run.ts`, `sim/bot/runOne.ts`, опционально `src/telemetry/` для user.

**Формат (приоритет):**

1. `git rev-parse --short HEAD` + `:` + `GAME_CONFIG` (если git доступен)
2. Fallback: SHA-256 первых 8 hex от канонического JSON активного `ConfigSet`
   (`src/data/game_configs/<name>/`)

Не путать с полем `config` (имя сета для фильтра дашборда). `balanceVersion` — версия
**содержимого** для compare до/после правки агентом.

**Acceptance:** после правки одного JSON в сете и перепрогона `balanceVersion` меняется
при том же `config=default`; дашборд compare показывает два разных sha.

---

### 5. Качество измерительного прибора (бот)

**Файлы:** `sim/bot/smartController.ts`, `sim/bot/run.ts` (дефолт `SEEDS`).

- **Fuse:** перед generic `fuse(i,j)` проверять `fusionResult` и запас gold/crystals;
  приоритизировать пары, дающие гибрид с высоким `scoreBoard` после гипотетической
  установки; не жечь mod-карты в burn, если в руке есть рецепт.
- **Сетка прогона:** документировать рекомендуемый CI-прогон `SEEDS=30` × 4 политики;
  в редакторе/run-bot — env-хинт в логе, если `SEEDS < 10`.

**Acceptance:** на lvl_7 с `smart` и достаточным seed хотя бы один прогон с `fusions > 0`
за 30 сидов.

---

## Изменения схемы Run record (§5.1)

Дополнение к полям из [autotest-system-impl-plan.md](../backlog/autotest-system-impl-plan.md#run-record-маппинг-крановстоков-на-схему-51):

| Поле | Тип | Источник |
|---|---|---|
| `waves` | `WaveSlice[]` | recorder, per-wave аккумулятор |
| `damageByCard` | `Record<string, number>` | `onEnemyDamaged` + source |
| `resonanceFired` | `Record<string, number>` | BattleSim при proc резонанса |
| `rerolls` / `burns` / `fusions` | `number` | BattleCore счётчики ✅ сделано |
| `balanceVersion` | `string` | git sha или hash ConfigSet |

`AttemptSummary` в `normalize.ts` — те же поля; `aggregate` на стадии 2 может агрегировать
например `avgWaveLeakRate[wave]` из `waves[]` всех прогонов.

---

## Порядок реализации

```
1. balanceVersion (run.ts)          — быстро, разблокирует compare
2. damageByCard + колбэк BattleSim  — средний, L6
3. resonanceFired                   — средний, L5
4. waves[] per-wave                 — крупнее всего, L4
5. SmartController fuse + SEEDS doc — параллельно с 2–4
6. normalize user + aggregate hooks — после стабилизации схемы
```

**Объём:** средний. **Дрифт к продакшну:** минимальный — опциональные поля колбэка
BattleSim с дефолтом «как сейчас»; BattleScene может не подписываться до миграции на Core.

---

## Verification

1. `npm run typecheck` после каждого подпункта.
2. Один прогон `npx tsx sim/bot/run.ts` → в первой строке `runs.jsonl` есть
   `waves`, `damageByCard`, `resonanceFired`, `balanceVersion` ≠ просто `default`.
3. `INGEST_URL=… npx tsx sim/bot/run.ts` → `/aggregate?source=bot` — поля не ломают
   существующие панели; новые поля доступны в `record_json` (дашборд — опционально).
4. Детерминизм: два прогона same seed/policy/level → идентичные `waves[]` и счётчики.
5. Регрессия фикса 2026-06-26: `avgRerolls` / `avgBurns` на дашборде остаются ненулевыми
   для `smart`.

---

## Связь со стадиями 2–4

| После 1.5 | Стадия 2 может… | Стадия 3–4 может… |
|---|---|---|
| `waves[]` | коридор `waveBudgetMargin` по номеру волны | правка одной записи в `waves.json` |
| `resonanceFired` | коридор `resonanceRate` по уровню | правка `resonance.json` |
| `damageByCard` | коридор `towerShare` (не одна карта >60% урона) | правка `cards.json` |
| `balanceVersion=sha` | группировка aggregate по версии | verification в change-request |

---

## Открытые вопросы

- Показывать ли `waves[]` на live-дашборде (тепловая карта волна×метрика) или только в
  `sim/analyze/` на стадии 2?
- Атрибуция урона гибридов и резонанса: всегда `cardId` башни-триггера или отдельный
  ключ `resonance:steam_burst`?
- Хеш ConfigSet: весь каталог сета или только файлы баланса (`cards`, `enemies`, `waves`,
  `levelCombat`, `battleRules`, `combatRules`)?
