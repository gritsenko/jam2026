# Снаряды, VFX, статус-эффекты и полировка врагов

Статус: **done** (реализовано и проверено в браузере). Стретчи на будущее: грейд-`_dirs`
3×3-шиты для **вращающихся** башен (plasma_shutter/railgun) — пока их грейд читается по
пипсам, а спрайт головы базовый; **поджиг плазмой** (Fire-снаряд сам вешает DoT) оставлен
тунаблом по умолчанию off, чтобы не трогать баланс. Большой полировочный пакет поверх
боевого слоя. Затрагивает рендер (`BattleScene`, `Projectile`, `EnemySprite`, `SlotView`,
`TutorialModal`), лёгкие косметические поля в `BattleSim`, конфиг снарядов в
`projectiles.ts`, манифест ассетов и генерацию спрайтов.

Принцип неизменен: **сим headless и авторитетен по попаданиям**; вся траектория-дуга,
самонаведение-косметика, трассеры, частицы и оверлеи — в рендере. В сим добавляем
только данные (косметические поля снаряда: дуга, ускорение, ключ спрайта-источника),
никакой отрисовки.

## 0. Карта подсистем (факты из кода)

- **Снаряды**: `SimProjectile` ([src/game/BattleSim.ts:173](../../src/game/BattleSim.ts#L173)),
  `fireProjectile` ([:755](../../src/game/BattleSim.ts#L755)), `moveProjectiles`
  ([:787](../../src/game/BattleSim.ts#L787)), `resolveProjectileHit` ([:815](../../src/game/BattleSim.ts#L815)).
  Рендер: `syncProjectiles` ([src/scenes/BattleScene.ts:2275](../../src/scenes/BattleScene.ts#L2275)),
  `ProjectileView` ([src/ui/Projectile.ts](../../src/ui/Projectile.ts)) — сейчас чисто
  процедурный glow-болт. Колбэки: `onTowerFired`/`onProjectileHit`/`onBeam`
  ([:413-429](../../src/scenes/BattleScene.ts#L413)), `burst()` ([:2427](../../src/scenes/BattleScene.ts#L2427)).
- **Кто чем стреляет**: снарядом (`fireProjectile`) — `plasma_shutter`(Fire),
  `frost_pulse`(Water), `storm_coil`(Electricity), гибриды `steam_cannon`(Water),
  `cryo_discharge`(Electricity), `ion_volley`(Fire). Лучом-пронзанием (`firePierceLine`,
  мгновенный + `onBeam`) — `railgun`(Physical), `thermo_spear`, `icebreaker`, `gauss_coil`.
  `muzzleLen`/`TOWER_MUZZLE` уже задают вылет из дула ([src/config/cards.ts:66](../../src/config/cards.ts#L66)).
- **Враги**: `syncEnemies` ([:2247](../../src/scenes/BattleScene.ts#L2247)) льёт `e.x/e.y`
  в `EnemySprite`. Контейнер `enemyLayer` ([:164](../../src/scenes/BattleScene.ts#L164)),
  **без сортировки**. Направление движения доступно через `path.headingAt(e.t)`
  ([src/game/path.ts:38](../../src/game/path.ts#L38)). Статусы живут в `SimEnemy`
  (`slowUntil/slowFactor/wetUntil/stunUntil/dotUntil/dotDps`, [:59](../../src/game/BattleSim.ts#L59)),
  но `clock` приватен ([:263](../../src/game/BattleSim.ts#L263)) — нужен публичный геттер.
- **Грейды**: `PlacedCard.grade` 1..3; визуально сейчас **не меняют** спрайт.
  Текстура выбирается в `PlatformGrid.applyState` ([src/ui/PlatformGrid.ts:155-166](../../src/ui/PlatformGrid.ts#L155))
  (`artFor(iconKey)` + `dirsKey = `${iconKey}_dirs``). `SlotView.setPlaced` принимает
  `_grade` и его игнорирует. `AssetLoader.has()` есть — можно делать фоллбек по наличию.
- **Туториал-модалка**: `TutorialModal` ([src/ui/TutorialModal.ts](../../src/ui/TutorialModal.ts)),
  карточка с pivot по центру; контент = title + illu + body + dots + кнопка.
  `cardW/cardH`, `renderPage()` строит страницу, `layout()` клампит к safe-area.

## 1. Снаряды: спрайты + стили полёта

### 1.1 Конфиг стилей (`src/config/projectiles.ts`, новый)
Таблица по `iconKey` → `{ shot: assetKey, motion: 'ballistic'|'homing'|'tracer', trail?: boolean }`:
- `plasma_shutter`→`shot_plasma` ballistic; `frost_pulse`→`shot_ice` ballistic;
  `storm_coil`→`shot_tesla` homing; `railgun`→`shot_rail` tracer.
- гибриды: `steam_cannon`→`shot_steam` ballistic; `ion_volley`→`shot_ion` ballistic;
  `cryo_discharge`→`shot_cryo` homing; `thermo_spear`→`shot_thermo` tracer;
  `icebreaker`→`shot_icebreaker` tracer; `gauss_coil`→`shot_gauss` tracer.
- хелпер `projectileStyle(iconKey)` с фоллбеком по стихии (Fire→shot_plasma,
  Water→shot_ice, Electricity→shot_tesla, Physical→shot_rail), чтобы новый
  гибрид/башня всегда что-то рисовали.

### 1.2 Косметические поля в `SimProjectile` + `fireProjectile`
Добавить (всё опционально, дефолт = текущее поведение):
- `sourceIcon: string` — iconKey башни-источника (для выбора спрайта/стиля в рендере).
- `arcPeak?: number` — высота баллистической дуги (доля дистанции). Для Fire/Water
  снарядных башен ставим `firePos = {target.x,target.y}` (**лоб в фикс-точку**, сим уже
  это умеет) + `arcPeak ≈ 0.18`. Дуга — чисто визуальный подъём в `ProjectileView`,
  `p.x/p.y` остаются на земле (точка попадания/сплэша корректна).
- самонаведение Tesla: для Electricity снарядов снаряд **homing** (как сейчас, без
  `firePos`), но добавить разгон. Поле `accel?: number` + рантайм `curSpeed`;
  `step = curSpeed*dt`, `curSpeed += accel*dt` (кап ~3×). Старт медленный → всегда
  догоняет. Вылет с верхушки башни (origin = центр слота, `muzzleLen` для tesla 0 →
  можно задать небольшой, чтобы било «с верхушки»).

`moveProjectiles` ([:787](../../src/game/BattleSim.ts#L787)) — добавить ветку разгона
для homing с `accel`. Дуга в сим НЕ считается.

### 1.3 `ProjectileView` (переписать)
- Спрайт (`assets.get(shotKey)`, `fitSprite` под `radius*~2`), `rotation` к вектору
  скорости (для tracer/ballistic; для tesla-шара поворот не нужен — он радиальный).
- Glow под спрайтом (как сейчас) — оставить, тонировать стихией.
- Опциональный **трейл**: кольцевой буфер последних N позиций → полупрозрачная
  затухающая лента (для homing tesla и tracer rail). Фоллбек: если спрайта нет —
  текущий процедурный болт.

### 1.4 `syncProjectiles` (рендер дуги/поворота/трейла)
- Хранить `prevPos` по id (для вектора скорости и поворота).
- Для ballistic: прогресс `f = пройдено/полнаяДистанция` (origin фикс, dest=`firePos`),
  визуальный подъём `lift = -arenaW*arcPeak*sin(πf)` по экранной Y (вычесть из `view.y`).
  Нужен `origin` снаряда — добавить `readonly originX/originY` в `SimProjectile`.
- Передавать `shotKey`/motion из `projectileStyle(p.sourceIcon)`.

### 1.5 Рельса/трассер (pierce, мгновенный)
`firePierceLine` уже шлёт `onBeam(x1,y1,x2,y2,element)` (x1,y1 = дуло). В рендере
`beam()` ([:425](../../src/scenes/BattleScene.ts#L425)) — добавить **трассер**: быстрый
спрайт-слизень (`shot_rail`/по стихии) летит x1→x2 за ~0.12с, оставляя затухающую
светящуюся линию-трейл. Чейн-хопы Tesla (`onBeam`) тоже получают короткий электро-трассер.

## 2. VFX выстрела и попадания

Лёгкая **пул-система частиц** в `BattleScene` (массив, тик в `update`, `track()` не
нужен — свой клок; глушить в `onExit`). Эмиттеры:
- **Дульная вспышка** (`onTowerFired`): спрайт `fx_muzzle` (тонируется стихией,
  быстрый scale-in/out 0.12с) + 4-6 искр-частиц по направлению выстрела.
- **Попадание** (`onProjectileHit` + конец трассера): спрайт `fx_impact` (вспышка) +
  **разлёт осколков** 8-12 процедурных частиц (по стихии: Fire — оранжевые, Water —
  ледяные, Electricity — жёлто-белые, Physical — серые), с гравитацией и затуханием.
- Существующий `burst()` остаётся как glow-подложка.

Спрайты VFX переиспользуемые и тонируемые: `fx_muzzle`, `fx_impact` (нейтрально-белые
с энерго-ядром). Категория в манифесте — `prop` (gen_sprite `--category fx`).

## 3. Статус-оверлеи на врагах

`BattleSim`: добавить публичный геттер `get now()` (возврат `this.clock`).
`EnemySprite`: метод `setStatus({ burning, wet, chilled, frozen })`:
- **burning** (горит): наложить спрайт `fx_burn` поверх бега, лёгкий фликер
  (scale/alpha по фазе). Триггер = `e.dotUntil > sim.now && e.dotDps>0` (Steam Burst —
  «огненный шар поджёг»). *(Поджиг от самой плазмы — отдельный тюнинг, по умолчанию
  off, чтобы не трогать баланс; см. §7.)*
- **wet**: синеватый `tint` спрайта + лёгкий блик; триггер `e.wetUntil > sim.now`.
- **chilled** (замедлен): спрайт `fx_frost`/иней + холодный `tint`; триггер
  `e.slowUntil > sim.now && e.slowFactor<1`.
- **frozen/stun**: голубой «лёд» (можно тот же `fx_frost`, плотнее); `e.stunUntil>sim.now`.
Приоритет тинтов: wet > chilled (выбрать один тинт), оверлеи fire/frost независимы.
`syncEnemies` каждый кадр читает дедлайны и зовёт `setStatus`. Чистка оверлеев в
`animateEnemyDeath`/`Leak`.

## 4. Враги: направление, сортировка, перспектива

- **Направление**: канон — все спрайты врагов смотрят в **одну** сторону (нормализуем
  PNG-мастера; см. §6). `syncEnemies`: `dir = path.headingAt(e.t).x`;
  `view.setFacing(dir)` → `sprite.scale.x = ±|baseScaleX|` (флипаем **только sprite**,
  не контейнер — hp-бар/аура/щит не зеркалить). Хранить `baseScaleX` после `fitSprite`.
- **Y-сортировка**: `enemyLayer.sortableChildren = true`; в `syncEnemies`
  `view.zIndex = e.y` → кто ниже (больше Y) рисуется поверх. `fxLayer` остаётся выше
  врагов целиком.
- **Перспектива**: `view.scale` умножить на `s = lerp(SMALL, BIG, e.y/arenaH)`
  (≈0.9..1.08), совместимо с флипом по X (флип внутри sprite, scale контейнера снаружи).

## 5. Грейд-вариации башен

Пламбинг (работает с фоллбеком, арт можно докинуть позже):
- `PlatformGrid.applyState`: `artFor(iconKey, grade)` → пробует `${iconKey}_g${grade}`,
  иначе база. `dirsKey` → пробует `${iconKey}_g${grade}_dirs`, иначе `${iconKey}_dirs`.
- `SlotView`: `_grade`→`grade`, без иных правок (текстуры приходят готовыми из Grid).
  Сиденье (`wFrac/cyFrac`) **одинаково** для всех грейдов башни (иначе турель прыгает).
- **Процедурный индикатор грейда** на занятом слоте (для ВСЕХ башен, не зависит от
  арта): I/II/III «пипсы» или энерго-ободок, ярче с грейдом — гарантированная читаемость.
- **Арт**: генерим одиночные `_g2`/`_g3` для 4 **статичных** башен (frost_pulse,
  storm_coil, shield_generator, grid_stabilizer) — подставляются в слот напрямую.
  Для вращающихся (plasma_shutter, railgun) полноценные грейд-`_dirs` 3×3-шиты —
  ручная работа (вне API-генерации); пока fallback на базовый шит + процедурный
  индикатор. Генерим их `_g2/_g3` как одиночные (арт карты/инспектора + задел).

## 6. Нормализация спрайтов врагов

Просмотреть 8 спрайтов врагов, определить канон-направление; перевернуть PNG-мастера,
смотрящие в другую сторону (через `tools/postprocess.py`/sharp flip), чтобы все
смотрели одинаково. Тогда §4-флип по движению корректен от единой базы.

## 7. Поджиг от плазмы (опционально, тюнинг)
По умолчанию огненный оверлей завязан на активный DoT (Steam Burst). Чтобы «огненный
шар» сам поджигал, можно дать Fire-снарядам слабый `dotDps/dotSec` на попадании
(тунабл в `combatRules`), по умолчанию **0** — чтобы не ломать баланс bot_tune.

## 8. Советник KloDouglas в туториале
- Ассет `advisor_klodouglas`: вырезать белый фон у
  `docs/visual_refs/visual_sources/advisors/tech.png`, ресайз → `assets/sprites/advisor_klodouglas.png`.
- `TutorialModal`: спрайт у **правой границы** карточки, прижат к низу, высокий
  (≈0.7 высоты карты), за телом текста по z. Сузить `wordWrapWidth` тела справа на
  ширину портрета. Прятать на узких карточках (`cardW < ~600`). Чистка в `renderPage`.

## 9. Ассеты к регистрации (манифест + mirror)
`shot_ice/plasma/rail/tesla` (на диске) + `shot_steam/cryo/ion/thermo/icebreaker/gauss`
(генерим) + `fx_muzzle/fx_impact/fx_burn/fx_frost` (генерим) +
`{frost_pulse,storm_coil,shield_generator,grid_stabilizer,plasma_shutter,railgun}_g2/_g3`
(генерим) + `advisor_klodouglas` (из исходника). `ASSET_FALLBACKS`: hybrid shots →
базовый shot по стихии; `_g2/_g3` → база (через `has()` в коде, не обяз. в fallbacks).

## 10. Порядок работ
1. План (этот файл). 2. Регистрация ассетов + запуск генерации в фоне.
3. Советник (без API). 4. Снаряды (конфиг+сим-поля+ProjectileView+syncProjectiles+трассер).
5. VFX-частицы. 6. Враги (флип/сорт/перспектива) + нормализация спрайтов.
7. Статус-оверлеи. 8. Грейд-пламбинг + индикатор. 9. `npm run typecheck`. 10. Прогон в
браузере (chrome-devtools) + правки. 11. Синк `docs/working/current-state.md`.

Все этапы с graceful-фоллбеком: код работает до прихода арта (placeholder/процедура).
