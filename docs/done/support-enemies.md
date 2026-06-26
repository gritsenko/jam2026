# ГДД: Мобы поддержки — карточки, внешний вид, ассеты

Детальное описание трёх **мобов поддержки** (врагов, усиливающих других врагов) —
тёмного зеркала синергии игрока. Дизайн-рамка, баланс и миграция — в
[enemy-roster-design.md](enemy-roster-design.md); здесь — игровые карточки, **внешний
вид в стилистике текущих врагов** и готовые спрайт-промпты под
[tools/gen_sprite.py](../../tools/README.md).

> **Статус: выполнено (заморожено в `done/`, 2026-06).** Все три моба реализованы в
> симе (ауры `BattleSim.tickAuras`, архетип `support`) и спавнятся в `levelCombat`;
> спрайты сгенерированы по промптам ниже (`enemy_resonance_mote` / `enemy_coolant_mender`
> / `enemy_aegis_beacon` на диске, плейсхолдер-диски больше не используются). Зеркалится
> в [current-state.md](../working/current-state.md).

---

## 0. Визуальный язык (чтобы новые читались как «свои»)

Существующие враги — это **существа-стихии** со светящимися деталями, на прозрачном
фоне, единый стиль (см. [assetManifest.ts](../../src/config/assetManifest.ts)):

- `frost_wisp` — «floating frost wisp spirit, translucent icy body, trailing cold mist»
- `volt_crawler` — «electric crawler insectoid, crackling blue-violet energy carapace»
- `magma_brute` — «armored magma brute creature, glowing molten cracks»
- `iron_husk` — «hulking scrap-metal husk golem, riveted plates»
- `enemy_disruptor` — «menacing signal-jammer drone, bristling antenna spikes, glitching arcs»

Шаблон промпта: **`[прилагательное] [тип существа], [светящаяся стихийная деталь],
[поза/движение]`**. Размер `512`, категория `enemy` (фон вырезается), стиль и
плоский фон скрипт добавляет сам.

**Чтобы саппорт читался как саппорт** — его силуэт сообщает «я не атакую, я излучаю»:
ауры, концентрические кольца, лучи-струи к союзникам, эмиттеры щитов. Никаких пушек,
шипов-жал, агрессивных поз — мягкие, парящие, «излучающие» формы.

---

## 1. Resonance Mote (хаст-аура)

**Концепт.** Парящий энергетический «узел резонанса», который разгоняет всю пачку
вокруг. Зеркало tempo-баффа игрока (Гроза / Сверхпроводимость) — но на стороне врага.

| Параметр | Значение |
| --- | --- |
| id / ключ ассета | `resonance_mote` / `enemy_resonance_mote` |
| Стихия | Energy |
| HP | 70 |
| Скорость | 0.060 (круг ~16.7с) |
| Награда | 12 (0.171 з/HP — премия за фокус) |
| Core-урон | 1 |
| Прямая атака | нет |
| **Аура** | +25% скорости союзникам в радиусе **0.18**, cap суммарно **+50%** |

**Поведение.** Держится в центре пачки, нет атаки. Пока жив — соседи быстрее, время в
зоне поражения башен падает. Со смертью пачка резко тормозит до базовой скорости.

**Контрплей.** Фокус-огонь (убить первым) или AoE/цепь, достающая его в гуще. Цель —
научить **приоритету цели**.

**Внешний вид (в стиле текущих).** Бесплотный парящий сгусток-ядро тёплого
янтарно-золотого свечения (стихия Energy), вокруг — пульсирующие концентрические
кольца энергии, расходящиеся наружу как рябь. Лёгкое покачивание в воздухе, без
конечностей и оружия — силуэт «маяк-метроном», а не боец.

```
Промпт: "floating resonance mote creature, warm amber-gold energy core,
pulsing concentric aura rings rippling outward, hovering bobbing pose, no limbs"
Команда: tools\.venv\Scripts\python.exe tools\gen_sprite.py "<промпт>" assets\sprites\enemy_resonance_mote.png --category enemy --size 512
```

---

## 2. Coolant Mender (хил-аура)

**Концепт.** Дрейфующий «ремонтник», восстанавливающий HP раненым союзникам струями
хладагента. Сустейн-саппорт: обесценивает капельный урон, требует burst.

| Параметр | Значение |
| --- | --- |
| id / ключ ассета | `coolant_mender` / `enemy_coolant_mender` |
| Стихия | Water |
| HP | 65 |
| Скорость | 0.055 (круг ~18.2с) |
| Награда | 11 (0.169 з/HP) |
| Core-урон | 1 |
| Прямая атака | нет |
| **Аура** | +8 HP/с союзникам в радиусе **0.16**; не лечит себя; не выше `maxHp` цели |

**Поведение.** Тянется струями к самым раненым в радиусе и откатывает им урон. Не
снимает Wet/slow (только HP — чтобы не стать вторым анти-статус-механизмом). Burst
по цели «обгоняет» его лечение; фокус по самому Mender убирает сустейн пачки.

**Контрплей.** Концентрированный/burst-урон по цели либо фокус по Mender (Рельсотрон
сквозь строй). Учит **концентрации урона** против размазанного.

**Внешний вид (в стиле текущих).** Полупрозрачное медузообразное существо холодного
бирюзово-голубого цвета (родственно `frost_wisp`, но «целитель», а не раш): мягкое
куполо-тело, снизу — несколько тонких струящихся щупалец-струй пара/хладагента,
тянущихся к союзникам. Плавная парящая поза, ощущение «капельницы».

```
Промпт: "drifting coolant mender spirit, translucent teal jellyfish-like dome body,
trailing restorative coolant vapor streams reaching outward, gentle floating pose"
Команда: tools\.venv\Scripts\python.exe tools\gen_sprite.py "<промпт>" assets\sprites\enemy_coolant_mender.png --category enemy --size 512
```

---

## 3. Aegis Beacon (проектор щита союзникам)

**Концепт.** Парящий маяк, накрывающий соседних врагов энерго-щитом. Зеркало
Генератора Щита игрока — самый сильный саппорт (и самая высокая премия за килл).

| Параметр | Значение |
| --- | --- |
| id / ключ ассета | `aegis_beacon` / `enemy_aegis_beacon` |
| Стихия | Energy |
| HP | 60 |
| Скорость | 0.050 (круг ~20с) |
| Награда | 13 (0.217 з/HP — высшая премия) |
| Core-урон | 1 |
| Прямая атака | нет |
| **Аура** | +60 щита союзникам в радиусе **0.15**, обновляется пока маяк жив |

**Поведение.** Вешает на союзников в радиусе отдельный пул щита (поглощает плоский
урон **перед** HP — это не резист, см. roster §1). Пока маяк жив, щит обновляется;
после смерти маяка щиты перестают обновляться и **истекают**. Не стакается сверх
одного пула от нескольких маяков.

**Контрплей.** Убить маяк **первым** → щиты пачки осыпаются → дальше зачистка как
обычно. Прямая атака на щитованную цель «съедается» щитом — невыгодно. Учит
**приоритету под защитой**.

**Внешний вид (в стиле текущих).** Левитирующий дрон-маяк (родственен `enemy_disruptor`
по «дроновости», но **оборонительный**, не агрессивный): компактное ядро с
гранёными гекс-эмиттерами по периметру, из которых наружу проецируются полупрозрачные
куполообразные барьеры. Холодное сине-золотое свечение (Energy), ровная зависшая поза,
без антенн-шипов и арок-разрядов — «защитный», а не «глушащий».

```
Промпт: "hovering aegis beacon drone creature, faceted hexagonal energy-shield emitter nodes,
projecting translucent dome barriers outward, cool blue-gold glow, steady levitating defensive pose"
Команда: tools\.venv\Scripts\python.exe tools\gen_sprite.py "<промпт>" assets\sprites\enemy_aegis_beacon.png --category enemy --size 512
```

---

## 4. Записи в манифест ассетов

Сначала — запись в манифесте, потом генерация PNG (правило из CLAUDE.md). Добавить в
[src/config/assetManifest.ts](../../src/config/assetManifest.ts) и зеркально в
[tools/assets.manifest.json](../../tools/assets.manifest.json). `tint` — цвет стихии из
`theme.ELEMENTS` (Energy для Mote/Beacon, Water для Mender).

```ts
{
  key: 'enemy_resonance_mote', category: 'enemy', size: 512,
  prompt: 'floating resonance mote creature, warm amber-gold energy core, pulsing concentric aura rings rippling outward, hovering bobbing pose, no limbs',
  placeholder: { shape: 'disc', tint: /* Energy */ En, label: 'MOTE' },
},
{
  key: 'enemy_coolant_mender', category: 'enemy', size: 512,
  prompt: 'drifting coolant mender spirit, translucent teal jellyfish-like dome body, trailing restorative coolant vapor streams reaching outward, gentle floating pose',
  placeholder: { shape: 'disc', tint: W, label: 'MENDER' },
},
{
  key: 'enemy_aegis_beacon', category: 'enemy', size: 512,
  prompt: 'hovering aegis beacon drone creature, faceted hexagonal energy-shield emitter nodes, projecting translucent dome barriers outward, cool blue-gold glow, steady levitating defensive pose',
  placeholder: { shape: 'disc', tint: /* Energy */ En, label: 'BEACON' },
},
```

> До генерации PNG движок рисует тематический плейсхолдер из манифеста (диск нужного
> цвета с лейблом). Для единообразия можно передавать эталон через
> `--ref assets\sprites\enemy_disruptor.png` (для Beacon) или
> `--ref assets\sprites\enemy_frost_wisp.png` (для Mender).

---

## 5. Сводка под разработку

| Моб | Стихия | HP | Скор. | Награда | Core | Эффект (радиус) | Фаза миграции |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Resonance Mote | Energy | 70 | 0.060 | 12 | 1 | +25% скор., cap +50% (0.18) | 1 (низкая цена) |
| Coolant Mender | Water | 65 | 0.055 | 11 | 1 | +8 HP/с (0.16) | 2 (низкая цена) |
| Aegis Beacon | Energy | 60 | 0.050 | 13 | 1 | +60 щита (0.15) | 3 (трогает ядро) |

**Первый шаг:** завести `Resonance Mote` (фаза 1) — добавить поля ауры в `EnemyDef`,
запись в `ENEMIES[]`, манифест + спрайт, и хаст-логику с cap в `BattleSim`. Полный
порядок миграции — [enemy-roster-design.md](enemy-roster-design.md) §7.
