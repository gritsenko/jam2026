# Аналитика и бэкенд: телеметрия бота + реальных игроков

> **Статус реализации (обновлено):** базовый конвейер РЕАЛИЗОВАН и проверен.
> Бэкенд `sim/server/` (Fastify + better-sqlite3): ingest событий (идемпотентно),
> ingest бот-ранов, `/aggregate` + `/sessions`, живой дашборд на `/`. Клиент
> `src/telemetry/` (события игроков, sendBeacon/буфер/opt-out) + инжекты в игре
> покрывают полный набор событий (см. ниже). Запуск — `sim/server/README.md`.
> Не сделано: SP-аналитика бота требует реального бот-харнесса (см.
> [autotest-system-impl-plan.md](autotest-system-impl-plan.md)); целевые коридоры/диагнозы.

**Статус:** план реализации (без кода). Расширяет
[autotest-system.md](autotest-system.md) (контракты §5.1 Run record / §5.2 aggregate /
§5.3 change-request) и [autotest-system-impl-plan.md](autotest-system-impl-plan.md)
(раскладка `sim/`, `recorder.ts`, дашборд). Использует
[config-as-data.md](config-as-data.md) для `balanceVersion`/вариантов.

## Контекст

Нужна аналитика по **двум источникам**: (A) прогоны **бота-тестера** (headless из
Node/tsx) и (B) телеметрия **реальных игроков** из браузерной игры (исход уровней,
place/merge/reroll/burn/fusion, экономика gold/crystals, утечки, звёзды, дропоффы). Для
реальных игроков нужен **бэкенд** (приём + хранилище + выдача агрегатов).

Сейчас бэкенда/сети/аналитики в игре нет (единственный `fetch` — загрузка аудио в
[AudioBus.ts](../../src/core/AudioBus.ts):129). Прогресс — в `localStorage`
([progress.ts](../../src/game/progress.ts)) — это эталон анонимного локального хранилища с
graceful no-op в headless/private. `fetch` в AudioBus — прецедент: сетевой вызов через
нативный Web API не считается рантайм-зависимостью.

**Ключевой контракт:** бот и игроки схлопываются в **единый `aggregate` (§5.2)** с
дискриминатором `source: 'user' | 'bot'`, чтобы дашборд показывал обе серии одной линзой.

## Бэкенд: Node + Fastify + better-sqlite3 в `sim/server/`

Обоснование для джема: минимум инфры — один файл БД `sim/out/telemetry.db`, запуск
`tsx sim/server/index.ts` (порт 8787), ни контейнеров, ни внешних сервисов. Fastify даёт
встроенную JSON-схема-валидацию тел (важно для приёма от недоверенного браузера) + CORS;
better-sqlite3 — синхронный API (проще ingest/агрегаты), один файл, легко держит десятки
тысяч событий джема. Это **отдельный пакет/процесс** → правило «единственная
рантайм-зависимость игры = `pixi.js`» не нарушается (бэкенд игрой не импортируется).

```
sim/server/
  package.json   fastify, better-sqlite3 (изолировано от игры)
  index.ts       запуск (порт 8787)
  db.ts          схема + prepared statements
  ingest.ts      POST /ingest/events, /ingest/runs (валидация + запись)
  aggregate.ts   events + runs → §5.2 aggregate (по source × stage)
  normalize.ts   user-события → Run-эквивалент (§5.1)
  routes.ts      GET /aggregate, /sessions, /health
  import.ts      CLI: tsx sim/server/import.ts runs.jsonl → таблица runs (source='bot')
sim/out/telemetry.db   (.gitignore)
```

Дашборд (`sim/dashboard/` из autotest-плана) работает в двух режимах: статический (читает
`aggregate.json`, как требует §8 спеки) + опциональный live (`GET /aggregate`).

## Контракт событий игрока (единый конверт)

```jsonc
{
  "schema": 1,
  "source": "user",            // 'user' | 'bot'
  "clientId": "uuid-v4",        // анонимный, persisted локально
  "sessionId": "uuid-v4",       // одна загрузка игры
  "balanceVersion": "a1b2c3d",  // git sha билда (Vite define) + имя ConfigSet
  "ts": 1750000000000,          // client epoch ms
  "seq": 42,                    // монотонный номер внутри сессии (упорядочивание/дедуп)
  "level": "lvl_3", "wave": 4,
  "type": "merge", "props": { /* по типу */ }
}
```

| type | props | в aggregate |
|---|---|---|
| `session_start` | `{ screen }` (без PII) | счётчик сессий |
| `level_start` | `{ towers, mechanics, config }` | попытки на уровень |
| `level_end` | `{ outcome, stars, coreHp, coreMax, endedAt:{wave}, durationSec }` | винрейт, «где умирают», пейсинг |
| `wave_cleared` | `{ wave, perfect }` | метрики волн |
| `place` | `{ cardId, grade, slot, costGold }` | стоки, тайминг |
| `merge` | `{ cardId, fromGrade, toGrade, slot, costGold }` | прогрессия (когда доступен тир) |
| `fusion` | `{ hybridId, costGold, costCrystals }` | стоки, использование контента |
| `reroll` | `{ costCrystals, rerollsThisWave }` | кран кристаллов |
| `burn` | `{ costGold, burnsThisBattle }` | стоки/овердрайв |
| `modernization` | `{ mod, costGold, costCrystals, element? }` | редкий контент |
| `econ` | `{ kind:'faucet'|'sink', currency, amount, reason }` | потоки валют (§6) |
| `enemy_leaked` | `{ enemyId, coreDamage, coreHp }` | утечки |
| `dropoff` | `{ reason:'quit'|'tab_hidden'|'beforeunload' }` | где бросают |

**Маппинг user → Run record (§5.1)** в `normalize.ts`: `seed`→`'user'`, `policy`→`'human'`,
`stage`←`level`; `outcome/endedAt/durationSec`←`level_end`; `faucets`←сумма `econ` faucet по
`reason`; `sinks.purchases`←массив place/merge/fusion/burn/reroll/modernization с `atWave`;
`progress`←кумулятив `econ`. `aggregate.ts` группирует по `(source, stage)` → дашборд рисует
bot vs user по `meta.balanceVersion`.

## Транспорт без новых зависимостей игры

Новый тонкий модуль `src/telemetry/`:
```
Telemetry.ts   фасад: track(type, props), flush(), setEnabled()
events.ts      типы событий + конверт
client.ts      clientId/sessionId/seq (localStorage)
buffer.ts      localStorage ring-buffer (оффлайн)
transport.ts   sendBeacon/fetch keepalive + батчинг + lifecycle-листенеры
```

- **`navigator.sendBeacon(url, blob)`** для флаша (переживает закрытие вкладки — критично для
  `level_end`/`dropoff`); фолбэк `fetch(url, {method:'POST', keepalive:true})`.
- **Батчинг:** копим события, флашим по размеру (≈20), таймеру (≈5с), `visibilitychange→hidden`,
  `pagehide`, и немедленно на `level_end`.
- **Оффлайн-буфер:** `localStorage['sgtd.telemetry.buf.v1']` (паттерн `progress.ts`); при успехе
  чистим, при старте дофлашиваем недосланное.
- **Анонимность:** `clientId = crypto.randomUUID()` в `localStorage['sgtd.client.v1']`;
  `sessionId` — на загрузку.
- **Endpoint** из `import.meta.env.VITE_TELEMETRY_URL`; пусто → телеметрия **выключена**
  (дефолт для джем-билда без бэкенда). `balanceVersion` — через Vite `define` (git sha).
- Всё в `try/catch` — телеметрия никогда не влияет на геймплей.

## Точки инжекта (по одной строке `Telemetry.track(...)` рядом с `playSfx`)

В [BattleScene.ts](../../src/scenes/BattleScene.ts) (номера строк — ориентир, сверять с кодом):

| Метод | Событие |
|---|---|
| `onEnter` (~L268) | `session_start` (один раз) + `level_start` |
| `placeCard` (~L1102) | `place` |
| `mergeCard` (~L1131) / `mergeFieldTower` (~L1160) | `merge` |
| `burnCard` (~L1249) | `burn` |
| фьюжн (`fusionCostParts` ~L1460 + резолв дропа) | `fusion` |
| modernization (`applyIsolation/Overdrive/Focus`) | `modernization` |
| `doReroll` (~L1851) | `reroll` |
| `addReward`/`addCrystals` (~L1892) / `spendGold` (~L1899) / `spendCrystals` (~L1822) | `econ` (faucet/sink) с `reason` |
| `onWaveCleared` (~L1805) | `wave_cleared` |
| `onEnemyLeaked` (~L2150) | `enemy_leaked` |
| `showBanner` (~L2543) | `level_end` (есть stars/coreHp/CORE_MAX/waveNumber/outcome) |
| lifecycle `pagehide` | `dropoff` |

`econ` эмитим **внутри** 4 денежных методов с `reason` — все деньги проходят через них, не
надо дублировать на колл-сайтах.

## Бот-раны → тот же бэкенд

`recorder.ts` (из autotest-плана) даёт Run record §5.1. Два пути в таблицу `runs`:
1. **CLI (дефолт):** `tsx sim/server/import.ts sim/out/runs.jsonl` → `source='bot'`.
2. **HTTP (опц.):** `POST /ingest/runs` тем же ndjson. `aggregate.ts` читает обе таблицы.

## Схема БД и эндпоинты

```sql
sessions(session_id PK, client_id, source, balance_version, level, started_at,
         outcome, stars, ended_wave, core_hp, core_max, duration_sec)
events(id PK, session_id, source, type, level, wave, ts, seq, props_json,
       UNIQUE(session_id, seq))           -- дедуп ретраев флаша
runs(id PK, source DEFAULT 'bot', seed, policy, stage, balance_version, record_json)
```
Индексы: `events(session_id)`, `events(type, level)`, `sessions(source, level)`,
`runs(source, stage)`. `aggregate` считается на лету (на объёмах джема — мгновенно).

```
GET  /health                         -> { ok: true }
POST /ingest/events   { events:[envelope...] }   (схема-валидация, upsert по (session_id,seq),
                                                   обновление sessions из level_start/end)
POST /ingest/runs     ndjson | { runs:[...] }     -> source='bot'
GET  /aggregate?source=user|bot|all&level=lvl_3   -> §5.2 (meta.balanceVersion, по stage)
GET  /sessions?source=&level=&limit=              -> дрилдаун в дашборде
```
CORS открыт для dev-origin Vite; ingest идемпотентен по `(session_id, seq)`.

## Приватность / этика

- Только анонимный случайный `clientId`; никаких имён/email; IP на уровне приложения не
  логируем.
- Никакого PII: `session_start.props` ограничен размером экрана; без свободного текста.
- **Opt-out:** флаг `localStorage['sgtd.telemetry.optout.v1']` → `track` no-op, буфер чистится;
  тумблер уместен в `SettingsPanel`.
- **Дефолт-офф** без `VITE_TELEMETRY_URL`. Retention — ручное удаление файла БД для джема.

## Критические файлы

- [src/scenes/BattleScene.ts](../../src/scenes/BattleScene.ts) — точки инжекта.
- [src/game/progress.ts](../../src/game/progress.ts) — эталон анонимного localStorage.
- [src/core/AudioBus.ts](../../src/core/AudioBus.ts) — прецедент нативного `fetch`.
- [src/game/BattleSim.ts](../../src/game/BattleSim.ts) — колбэки-источник для бота.
- Новые: `src/telemetry/`, `sim/server/`.

## Верификация

1. `tsx sim/server/index.ts` поднимается, `GET /health` → ok.
2. `POST /ingest/events` идемпотентен (повторный флаш буфера не плодит дубли по
   `(session_id, seq)`).
3. `tsx sim/server/import.ts runs.jsonl` наполняет `runs`; `GET /aggregate?source=all` отдаёт
   §5.2-структуру; дашборд рисует серии bot и user.
4. В игре без `VITE_TELEMETRY_URL` ничего не шлётся; с endpoint — события приходят, opt-out
   глушит.
