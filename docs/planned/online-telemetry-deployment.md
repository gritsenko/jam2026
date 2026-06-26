# Онлайн-аналитика: минимальный деплой телеметрии

**Статус:** планируемое (спроектировано, в коде/инфре ещё нет). Цель — вывести уже
реализованную телеметрию (см. [analytics-and-backend.md](../backlog/analytics-and-backend.md))
в интернет при условии, что **игра постоянно хостится по известному публичному URL**, и
сделать это так, чтобы **в будущем можно было прогонять ботов** в тот же дашборд.

## Контекст / что уже есть

- Игра — **статика** (`npm run build` → `dist/`), своего бэкенда не имеет (см.
  [vite.config.ts](../../vite.config.ts)). Прогресс — в `localStorage`.
- Телеметрия-бэкенд **реализован** и отделён: `sim/server/` (Fastify + better-sqlite3),
  эндпоинты `/ingest/events`, `/ingest/runs`, `/aggregate`, `/sessions`, дашборд на `/`.
- Клиент `src/telemetry/` шлёт события на `VITE_TELEMETRY_URL`; **пусто → телеметрия
  выключена**. Адрес **вшивается в бандл на этапе `npm run build`** (`import.meta.env`).
- Контракт событий унифицирован с дискриминатором `source: 'user' | 'bot'` — бот и люди
  сходятся в один `/aggregate`. Бот-раны уже принимаются (`/ingest/runs`, CLI `import.ts`).

## Минимум для выхода в онлайн

Условие задачи: игра уже по публичному URL (например `https://game.example.com`). Нужно
поднять бэкенд так, чтобы браузеры игроков могли слать события, а данные не терялись.

### 1. Хост для бэкенда с постоянным диском
SQLite-файл `sim/out/telemetry.db` должен жить на **persistent volume** — иначе рестарт
сотрёт данные. Подходит:
- **VPS** (любой) + `systemd`/Docker — диск свой, проще всего;
- **Fly.io / Railway / Render** — но обязательно с **volume**, смонтированным под БД
  (`TELEMETRY_DB=/data/telemetry.db`).
- ❌ Чистый serverless (Vercel/Netlify functions) — нет постоянного диска; для него
  пришлось бы менять SQLite на хостимую БД (Turso/LibSQL, Postgres). Вне минимума.

Запуск слушать наружу/за прокси: `HOST=0.0.0.0 PORT=8787` (сейчас дефолт `127.0.0.1` —
только локально; за reverse-proxy можно оставить локальный и проксировать).

### 2. HTTPS (обязательно)
Игра по `https` → браузер заблокирует запросы на `http://`-бэкенд (mixed content). TLS
проще всего через **Caddy** (авто-Let's Encrypt) или nginx + certbot.

### 3. Топология (рекомендация — один домен, без CORS)
**A. Бэкенд под путём `/api` того же домена** (reverse-proxy):
- `https://game.example.com/` → статика `dist/`
- `https://game.example.com/api/*` → проксируется на `127.0.0.1:8787`
- сборка: `VITE_TELEMETRY_URL=https://game.example.com/api npm run build`
- ✅ нет CORS, нет mixed-content.

**B. Отдельный поддомен** (`https://telemetry.example.com`): нужен CORS (сузить `origin`
в [index.ts](../../sim/server/index.ts) с `true` до домена игры) и HTTPS.

### 4. Сборка игры с правильным URL
`VITE_TELEMETRY_URL` задаётся **до** `npm run build` (вшивается). При смене адреса
бэкенда игру надо пересобрать. `balanceVersion` уже берётся из git sha на сборке.

### 5. Живучесть процесса
`systemd`-юнит или контейнер, который держит `tsx index.ts` живым и рестартует при падении.

## Что добавить в код/инфру (минимальные правки)

Сейчас бэкенд рассчитан на локальный запуск; для публичного нужны небольшие доработки:

1. **CORS-allowlist** — в [index.ts](../../sim/server/index.ts) заменить `origin: true` на
   список доменов игры из env (`ALLOWED_ORIGINS`). (топология B; для A — не нужно.)
2. **Токен на `/ingest/runs`** — бот-ингест не должен быть открыт публично. Простой
   `Bearer`-заголовок из env (`INGEST_TOKEN`), проверяется только на `/ingest/runs`
   (события игроков остаются без токена — они идут из браузера). Дашборд `/aggregate`/
   `/sessions`/`/` — по желанию закрыть basic-auth/токеном, т.к. это внутренняя аналитика.
3. **Rate-limit** на `/ingest/events` (напр. `@fastify/rate-limit`) — публичный эндпоинт.
   Тело уже ограничено (`bodyLimit` 1 МБ, батч ≤ 500).
4. **Не логировать IP** на уровне приложения (приватность; см. §6 спеки) — отключить
   соответствующие поля в логере Fastify.
5. **Бэкап БД** — периодическое копирование `telemetry.db` (cron / `litestream` для
   непрерывного бэкапа в объектное хранилище — опционально).

## Готовность к прогону ботов (будущее)

Ботам **не нужен публичный бэкенд по-особому** — конвейер уже совместим:
- Бот-харнесс (см. [autotest-system-impl-plan.md](../backlog/autotest-system-impl-plan.md)
  + [config-as-data.md](../backlog/config-as-data.md)) гоняется **headless** на CI/локально,
  пишет `runs.jsonl`.
- Загрузка в тот же дашборд — двумя путями: CLI `tsx sim/server/import.ts runs.jsonl`
  (локально, прямой доступ к файлу БД) **или** `POST /api/ingest/runs` (по сети, с
  `INGEST_TOKEN`). `aggregate.ts` уже сводит `source: 'bot'` рядом с `'user'`.
- Боты гоняют **разные варианты конфига** (`GAME_CONFIG=...` из config-as-data) → каждый
  ран/событие несёт поле `config` (id игрового конфига), дашборд фильтрует и сравнивает по
  нему (`/aggregate?config=…`, `/sessions?config=…`); `balanceVersion` остаётся git sha кода.
  Так видно сравнение балансов бот↔игроки по конфигам и стейджам.
- Единственное требование к онлайну: либо у харнесса есть доступ к файлу БД (общий хост),
  либо открыт защищённый `/ingest/runs`. Оба уже поддержаны.

## Минимальный рецепт (один домен + Caddy + systemd)

1. VPS, поставить Node 18+ и Caddy.
2. Залить репо, `cd sim/server && npm install`.
3. `systemd`-юнит: `TELEMETRY_DB=/var/lib/sgtd/telemetry.db HOST=127.0.0.1 PORT=8787
   INGEST_TOKEN=… tsx index.ts`, `Restart=always`.
4. `Caddyfile`:
   ```
   game.example.com {
     handle_path /api/* { reverse_proxy 127.0.0.1:8787 }
     handle { root * /var/www/sgtd/dist; file_server }
   }
   ```
5. Собрать игру: `VITE_TELEMETRY_URL=https://game.example.com/api npm run build`, залить
   `dist/` в `/var/www/sgtd/dist`.
6. Открыть `https://game.example.com/api/` — дашборд; играть на `https://game.example.com/`.

## Чек-лист «минимум для онлайна»

- [ ] Бэкенд на хосте с постоянным диском (`TELEMETRY_DB` на volume).
- [ ] HTTPS (Caddy/nginx).
- [ ] Топология A (`/api`) или B (+CORS-allowlist).
- [ ] `VITE_TELEMETRY_URL` задан при сборке игры.
- [ ] `systemd`/Docker держит процесс живым.
- [ ] `INGEST_TOKEN` на `/ingest/runs` (+ опц. защита дашборда).
- [ ] rate-limit на `/ingest/events`, IP не логируется.
- [ ] бэкап `telemetry.db`.

## Критические файлы (для будущей реализации)

- [sim/server/index.ts](../../sim/server/index.ts) — HOST/PORT, CORS, (буд.) токен/rate-limit.
- [sim/server/db.ts](../../sim/server/db.ts) — путь БД (`TELEMETRY_DB`).
- [vite.config.ts](../../vite.config.ts) — `VITE_TELEMETRY_URL` на сборке.
- [src/telemetry/transport.ts](../../src/telemetry/transport.ts) — клиентский endpoint.
- Новое (инфра): `Dockerfile`/`Caddyfile`/`systemd`-юнит — пока не созданы.

## Открытые вопросы

- Где хостим (VPS vs Fly.io/Railway)? — влияет на способ монтирования volume.
- Закрывать ли дашборд/`/aggregate` авторизацией (внутренняя аналитика) или оставить
  открытым на непубличном поддомене.
- Нужен ли непрерывный бэкап (litestream) или хватает периодического копирования файла.
