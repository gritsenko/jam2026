# Звуковой дизайн башен (пер-башенные SFX) — спека

> **Статус: done (роутинг в коде).** Ключи зарегистрированы в
> [audioManifest.ts](../../src/config/audioManifest.ts), маршрутизация — в
> [BattleScene.ts](../../src/scenes/BattleScene.ts): вылет по `cardId`
> (`TOWER_SHOOT_SFX`), попадание — по `cardId` (`TOWER_HIT_SFX` → фоллбек
> `ELEMENT_HIT_SFX` → `sfx_hit`) в `onProjectileHit` / `onBeam`; сим несёт `towerId`
> на снаряде и в луче ([BattleSim.ts](../../src/game/BattleSim.ts)). Крит — `sfx_crit`
> в `onEnemyDamaged`. MP3 (`assets/audio/<key>.mp3`) без файла → тихий no-op и фоллбек.
> §2 (звуки на замену) — лист на ручную замену сэмплов; `sfx_hit_storm` пока копия
> `sfx_hit_cryo` (нужен уникальный chain-lightning клип).

Источники истины по аудио: [src/config/audioManifest.ts](../../src/config/audioManifest.ts)
(единый реестр ключей + англ. промпты для text-to-audio), [assets/audio/README.md](../../assets/audio/README.md)
(контракт «имя файла = ключ»), [src/core/AudioBus.ts](../../src/core/AudioBus.ts) (загрузка/микшер).
Башни по поведению — [docs/working/towers.md](../working/towers.md).

## Соглашения (как в существующей системе)

- **Ключ = имя файла.** Кладём `assets/audio/<key>.mp3`, нет файла → тихий no-op.
- **`kind`** для всех боевых звуков — `'sfx'` (микс-шина боёвки, свой слайдер громкости).
- **Промпт — на английском**, в стиле «soft / smooth / clean / warm» (модель ElevenLabs
  Sound Effects скашивает в резкость — толкаем её к полированному звуку). SFX короткие,
  моно, mp3, тримленные.
- **Громкость** (`volume`) подбираем так, чтобы при наложении многих выстрелов не клиппило.
  Вылет тише попадания; у редких тяжёлых башен (рельсотрон) — заметнее.

## 1. Пер-башенные звуки (2 на башню: вылет + попадание)

Звучат только **атакующие** башни (стреляют снарядом/лучом). Поддержка (Щит,
Стабилизатор) снарядов не пускает: у Щита уже есть `sfx_barrier` (постановка купола),
Стабилизатор — пассивный, без звука.

Предлагаемые ключи и промпты:

### 1.1 Плазменный Затвор (`plasma_shutter`) · Fire — горячо, тяжёлый «бах»

| Событие | Ключ | Промпт (EN) | volume |
| --- | --- | --- | --- |
| Вылет | `sfx_shoot_plasma` | `plasma cannon firing a hot energy bolt, deep punchy fiery whoomph with a short electric crackle, warm and powerful, not harsh, 0.3 seconds` | 0.5 |
| Попадание | `sfx_hit_plasma` | `plasma bolt impact, satisfying fiery thump with a soft sizzling ember tail, warm and weighty, 0.3 seconds` | 0.55 |

> Грейд III / резонанс Shrapnel — взрыв по площади. Опционально отдельный
> `sfx_hit_plasma_aoe` (`small fiery shockwave burst, soft round boom with a warm
> sparking spread, punchy not noisy, 0.5 seconds`) — стретч, не обязателен для MVP.

### 1.2 Морозный Импульс (`frost_pulse`) · Water — мягко, кристаллический «вжух»

| Событие | Ключ | Промпт (EN) | volume |
| --- | --- | --- | --- |
| Вылет | `sfx_shoot_frost` | `frost projectile launch, soft airy icy whoosh with a gentle crystalline shimmer, cool and clean, 0.3 seconds` | 0.45 |
| Попадание | `sfx_hit_frost` | `frost impact freezing an enemy, smooth glassy crystallize chime with a soft frosty crackle, gentle and magical, 0.35 seconds` | 0.5 |

### 1.3 Грозовая Катушка (`storm_coil`) · Electricity — резкий «зэп», цепь

| Событие | Ключ | Промпт (EN) | volume |
| --- | --- | --- | --- |
| Вылет | `sfx_shoot_storm` | `electric coil discharging, crisp clean synthetic zap with a quick high spark snap, snappy not piercing, 0.25 seconds` | 0.45 |
| Попадание | `sfx_hit_storm` | `chain lightning arcing between enemies, fast tight electric crackle-zip with a bright spark, clean and energetic, 0.3 seconds` | 0.5 |

### 1.4 Тяжёлый Рельсотрон (`railgun`) · Physical — тяжёлый «бум-чарж + кинетик»

| Событие | Ключ | Промпт (EN) | volume |
| --- | --- | --- | --- |
| Вылет | `sfx_shoot_railgun` | `heavy railgun firing, deep magnetic charge-up into a powerful low boom and a sharp metallic snap, weighty and impactful, clean, 0.6 seconds` | 0.6 |
| Попадание | `sfx_hit_railgun` | `high-velocity slug piercing through, hard kinetic thud with a brief metallic ring-out, satisfying and heavy, 0.35 seconds` | 0.6 |

### Сводка ключей башен

| Башня | Стихия | Вылет | Попадание |
| --- | --- | --- | --- |
| Плазменный Затвор | Fire | `sfx_shoot_plasma` | `sfx_hit_plasma` |
| Морозный Импульс | Water | `sfx_shoot_frost` | `sfx_hit_frost` |
| Грозовая Катушка | Electricity | `sfx_shoot_storm` | `sfx_hit_storm` |
| Тяжёлый Рельсотрон | Physical | `sfx_shoot_railgun` | `sfx_hit_railgun` |

### 1.5 Гибриды фьюжна (v2 §6.5)

Отдельные пары shoot/hit по `cardId` (`TOWER_SHOOT_SFX` / `TOWER_HIT_SFX` в BattleScene).

| Гибрид | Вылет | Попадание |
| --- | --- | --- |
| Паровая Пушка (`steam_cannon`) | `sfx_shoot_steam` | `sfx_hit_steam` |
| Криоразряд (`cryo_discharge`) | `sfx_shoot_cryo` | `sfx_hit_cryo` |
| Ионный Залп (`ion_volley`) | `sfx_shoot_ion` | `sfx_hit_ion` |
| Термокопьё (`thermo_spear`) | `sfx_shoot_thermo` | `sfx_hit_thermo` |
| Ледобой (`icebreaker`) | `sfx_shoot_icebreaker` | `sfx_hit_icebreaker` |
| Гаусс-Катушка (`gauss_coil`) | `sfx_shoot_gauss` | `sfx_hit_gauss` |

Playbook генерации: [fusion-hybrid-assets.md](fusion-hybrid-assets.md).

## 2. Звуки на замену и недостающие (ищу готовые вручную)

Подробные карточки на каждый звук: **контекст** (когда и зачем играет, какую эмоцию
несёт), **характер** (что должно слышаться, чего избегать), **готовый промпт** (EN,
под ElevenLabs Sound Effects — можно и как ориентир при ручном поиске сэмпла),
**длительность/громкость** и **слои** (из каких компонентов собран звук). Имя файла =
ключ: кладём найденный сэмпл в `assets/audio/<key>.mp3` под тем же ключом.

Большинство ключей **уже есть** в [audioManifest.ts](../../src/config/audioManifest.ts)
и звучат в игре — мы лишь меняем сэмпл. Два помечены **(новый ключ)** — их нужно
сперва завести в манифесте и повесить в коде (см. интеграцию под каждым).

### 2.1 Начало волны — `sfx_wave_start`

- **Контекст.** Триггерится на `onWaveStart` ([BattleScene.ts](../../src/scenes/BattleScene.ts) ~362),
  одновременно с телеграфом направления входа. Это «вдох» перед боем — должен поднять
  напряжение и переключить внимание игрока на арену, но **не пугать** (волн много за бой).
- **Характер.** Восходящий tense-свелл с мягким предупреждающим пульсом в конце; тёплый
  синтовый низ, лёгкий «горн» сверху. Без резкого металлического аларма и без баса,
  забивающего музыку (`music_battle` 120 bpm играет параллельно).
- **Промпт (EN).** `wave incoming alert, smooth rising tense synth swell building into a soft warning pulse, warm low synth bed with a subtle distant horn on top, cinematic and anticipatory, clean not harsh, 0.9 seconds`
- **Длит./громк.** ~0.9 с · volume ~0.6.
- **Слои.** (1) восходящий pad-свелл 0→0.6с; (2) короткий «пульс»-стинг 0.6→0.9с; (3) еле слышный высокий шиммер для «sci-fi».

### 2.2 Моб дошёл до Core — `sfx_leak`

- **Контекст.** `onEnemyLeaked` ([BattleScene.ts](../../src/scenes/BattleScene.ts) ~340):
  враг пробил оборону и снял Core Integrity. **Самый важный негативный фидбэк в бою** —
  игрок обязан его заметить и почувствовать «потерю» (это самый громкий SFX, volume 0.85).
- **Характер.** Тяжёлый, тревожный, «больно». Глубокий удар по корпусу ядра + короткий
  искажённый аларм-синт сверху, лёгкий металлический резонанс «брони». Не приглушённо,
  не «мокро» — должно резать сквозь музыку. Избегать комичного «бонк».
- **Промпт (EN).** `enemy breaches the reactor core, heavy impactful hull boom with a deep low thud, layered with a short alarming distorted synth blare and a brief metallic armor resonance, urgent and very noticeable, punchy not muffled, 1 second`
- **Длит./громк.** ~1.0 с · volume ~0.85.
- **Слои.** (1) суб-бас/боди-удар (тело попадания); (2) аларм-синт-блэр 0.1→0.5с; (3) металлический «звон брони» в хвосте.

### 2.3 Установка башни на поле — `sfx_place`

- **Контекст.** Дроп карты в слот платформы (успешная постановка башни). Должен дать
  **тактильное удовлетворение** «защёлкнулось на место» — позитивный, аккуратный.
- **Характер.** Двухфазный: короткий механический «клик-тук» приземления + тёплый
  электронный «конфирм»-шиммер активации. Чисто, без дребезга и без резкого верха.
- **Промпт (EN).** `placing a turret onto a board slot, soft satisfying mechanical click-thunk landing followed by a warm electronic confirm shimmer powering on, clean and tactile, not harsh, 0.4 seconds`
- **Длит./громк.** ~0.4 с · volume ~0.6.
- **Слои.** (1) «тук» посадки (transient + короткий низ); (2) «конфирм»-шиммер 0.15→0.4с.

### 2.4 Reroll руки — `sfx_reroll`

- **Контекст.** Кнопка реролла руки (тратит ресурс, обновляет карты). Бытовое UI-действие
  (шина `ui`), может срабатывать часто — звук **лёгкий и быстрый**, не утомляющий.
- **Характер.** Быстрый «риффл»/перетасовка цифровых карт + лёгкий воздушный свип
  обновления. Чисто, коротко, без «казино»-перебора и без резкого шума.
- **Промпт (EN).** `UI card reshuffle, light quick digital card riffle with a soft airy sweep resolving into a gentle ready tick, clean and snappy, not noisy, 0.5 seconds`
- **Длит./громк.** ~0.5 с · volume ~0.5 · шина `ui`.
- **Слои.** (1) риффл-перебор; (2) воздушный свип; (3) короткий «ready»-тик в конце.

### 2.5 Критический удар — `sfx_crit`

- **Контекст.** `onEnemyDamaged(crit=true)` ([BattleScene.ts](../../src/scenes/BattleScene.ts) ~344) —
  крит-страйк (например, ×2 урон Грозы по Wet-цели). Перебивает пер-башенный звук
  попадания, поэтому должен **читаться как «вот это попал!»**, выделяться на фоне обычных хитов.
- **Характер.** Мощный, панчевый импакт + яркий кристаллический «хвост»-спарк. Тяжелее и
  «звонче» обычного `sfx_hit_*`, но всё ещё гладкий (не визгливый).
- **Промпт (EN).** `powerful critical energy strike, deep satisfying impact punch with a bright crystalline sparkle tail and a quick rising zing, weighty and rewarding, punchy but smooth, 0.5 seconds`
- **Длит./громк.** ~0.5 с · volume ~0.65.
- **Слои.** (1) низ-панч импакта; (2) яркий «zing»/спарк-хвост; (3) кристаллический шиммер-затухание.

### 2.6 Stun башни — `sfx_stun` (подключён)

- **Контекст.** Диверсант критует прерывание и **полностью оглушает башню** на бит
  (`onTowerInterrupted(kind='stun')`, [BattleScene.ts](../../src/scenes/BattleScene.ts) ~348).
  Сейчас и стан, и лёгкий «глитч-выстрел» делят один `sfx_disrupt` — стан хочется
  отделить как более **тяжёлый, «вырубающий»** звук, чтобы игрок чувствовал серьёзную потерю DPS.
- **Характер.** Короткий тяжёлый электрический «лок-даун»-зап + просадка питания вниз
  (power-down dip), будто башню вырубили. Жёстче `sfx_disrupt`, но не резкий статик.
- **Промпт (EN).** `tower stunned and shut down, short heavy electric lock-down zap with a low descending power-down dip and a brief dead hum, jarring but smooth, not harsh static, 0.4 seconds`
- **Длит./громк.** ~0.4 с · volume ~0.6.
- **Слои.** (1) жёсткий зап-транзиент; (2) нисходящий power-down тон; (3) короткий «мёртвый» гул в хвосте.
- **Интеграция (сделано).** Ключ заведён в `AUDIO[]`; колбэк `onTowerInterrupted` в
  [BattleScene.ts](../../src/scenes/BattleScene.ts) ветвит
  `playSfx(kind === 'stun' ? 'sfx_stun' : 'sfx_disrupt')` — полный стан звучит `sfx_stun`,
  лёгкий глитч-выстрел остаётся на `sfx_disrupt`.

### 2.7 Upgrade базы — `sfx_upgrade` (подключён)

- **Контекст.** Перманентный апгрейд платформы/ядра — напр. покупка `isolation_circuit`
  (+2 базовой ёмкости навсегда) и прочая глобальная модернизация. Сейчас отдельного
  звука нет (мердж/грейд башни звучит как `sfx_merge`, но это **другое** событие —
  тактический мердж, а не перманентный апгрейд базы). Эмоция — **«стал сильнее насовсем»**,
  весомее обычного мерджа.
- **Характер.** Тёплый «level-up»: восходящий гармонический шиммер, разрешающийся в
  яркий, но мягкий мажорный аккорд-чайм, с лёгким «power-up»-гулом снизу для весомости.
  Богаче и длиннее `sfx_merge`, торжественнее.
- **Промпт (EN).** `permanent base upgrade, warm rising harmonic shimmer resolving into a bright satisfying major chord chime, with a soft swelling power-up hum underneath, triumphant and rewarding, smooth and clean, 0.8 seconds`
- **Длит./громк.** ~0.8 с · volume ~0.65.
- **Слои.** (1) восходящий шиммер-арп 0→0.4с; (2) разрешающий аккорд-чайм; (3) тёплый низ-гул «power-up» под всем.
- **Интеграция (сделано).** Ключ заведён в `AUDIO[]`; `applyIsolation` (Изоляционный
  Контур, перманентный +ёмкость) в [BattleScene.ts](../../src/scenes/BattleScene.ts) теперь
  играет `sfx_upgrade` вместо `sfx_place`. Тактический мердж/грейд башни по-прежнему `sfx_merge`.

### Сводка §2

| Событие | Ключ | Статус | Длит. | volume | Шина |
| --- | --- | --- | --- | --- | --- |
| Начало волны | `sfx_wave_start` | есть, меняем сэмпл | 0.9с | 0.6 | sfx |
| Моб дошёл до Core | `sfx_leak` | есть, меняем сэмпл | 1.0с | 0.85 | sfx |
| Установка башни | `sfx_place` | есть, меняем сэмпл | 0.4с | 0.6 | sfx |
| Reroll руки | `sfx_reroll` | есть, меняем сэмпл | 0.5с | 0.5 | ui |
| Критический удар | `sfx_crit` | есть, меняем сэмпл | 0.5с | 0.65 | sfx |
| Stun башни | `sfx_stun` | подключён (ветка `kind==='stun'`) | 0.4с | 0.6 | sfx |
| Upgrade базы | `sfx_upgrade` | подключён (`applyIsolation`) | 0.8с | 0.65 | sfx |

## 3. Как это подключено в коде

Реализовано (см. статус-баннер сверху):

1. Ключи `sfx_shoot_*` / `sfx_hit_*` (10 атакующих башен) в `AUDIO[]`
   ([audioManifest.ts](../../src/config/audioManifest.ts), kind `'sfx'`).
2. Маппинги `TOWER_SHOOT_SFX`, `TOWER_HIT_SFX` и фоллбек `ELEMENT_HIT_SFX` —
   константы в [BattleScene.ts](../../src/scenes/BattleScene.ts); общие `sfx_shoot`/`sfx_hit`
   — последний фоллбек.
3. Вылет — `onTowerFired` → `onTowerFired(slotIndex)` по `cardId` слота. Попадание —
   `onProjectileHit` / `onBeam` (снаряд и луч); `towerId` на `SimProjectile` и в колбэках
   ([BattleSim.ts](../../src/game/BattleSim.ts)). Крит — `sfx_crit` в `onEnemyDamaged`.
4. MP3 лежат в `assets/audio/<key>.mp3`; после добавления — перезапуск dev-сервера (glob
   на старте). Нет файла → no-op / фоллбек.

> Реализовано → спека перенесена в `docs/done/` и отражена в
> [docs/working/current-state.md](../working/current-state.md) (правило синхронизации,
> [docs/README.md](../README.md)).
