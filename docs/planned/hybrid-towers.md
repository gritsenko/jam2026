# Hybrid towers — доработка фьюжн-гибридов (v2 §6.5)

> **Статус: частично реализовано (2026-06).** Боевая логика, данные, манифесты,
> роутинг — готовы; **6 PNG-спрайтов сгенерированы** (фоллбеки на родителей сняты из
> `ASSET_FALLBACKS`). Осталось: **6 `sfx_shoot_*` MP3** (MVP; генерируются вручную — в
> репо нет тулзы под звук) + стретчи (`_dirs`-шиты, уникальные hit-клипы, smoke lvl_7).
> После закрытия звукового MVP — перенести в `docs/done/` и обновить
> [current-state.md](../working/current-state.md).

Источник дизайна: [synergy-grid-td-v2.md](../backlog/synergy-grid-td-v2.md) §6.5.
Playbook ассетов: [fusion-hybrid-assets.md](fusion-hybrid-assets.md).

---

## Контекст

На lvl_7 (флаг `fusion`, клир lvl_6) доступны все 6 рецептов фьюжна в руке. Каждый
гибрид — отдельная карта с собственным `iconKey`, встроенными перками `hybridPerks`
и отдельными audio-ключами вылета.

**Осознанно вне скоупа:** гейт `fusion_recipes` и прогрессивная разблокировка рецептов
по звёздам — все рецепты открыты сразу с ур.7 (см. [v3-alignment.md](../done/v3-alignment.md)).

---

## Реализовано

### Данные и типы

- `HybridPerk` в [types.ts](../../src/config/types.ts): `steamBurst`, `wetOnHit`,
  `builtInShrapnel`, `bonusVsSlowWet`, `chainAfterPierce`.
- `hybridPerks` + `sig2` где нужно — в обоих [cards.json](../../src/data/game_configs/default/cards.json)
  (`default`, `game_config_id000001`).
- Константы `HYBRID_SLOW_WET_BONUS` (1.35), `HYBRID_STEAM_BURST_FRAC` (0.055) —
  [combatRules.json](../../src/data/game_configs/default/combatRules.json) + [schema.ts](../../src/data/schema.ts).
- `hasHybridPerk()` — [cards.ts](../../src/config/cards.ts).

### Боевая симуляция

Фьюжн — **две разные карты в руке** по рецепту ([recipes.json](../../src/data/game_configs/default/recipes.json));
это не мердж грейдов (I+I→II на поле или в руке).

| Гибрид | Фьюжн (родители) | Перк | Поведение в [BattleSim.ts](../../src/game/BattleSim.ts) |
|--------|------------------|------|-----------------------------------------------------------|
| Паровая Пушка (`steam_cannon`) | Ледяная (`frost_pulse`) + Огневая (`plasma_shutter`) | `steamBurst` | AoE-урон при попадании + slow/Wet (сигнатура `freeze_radius`) |
| Криоразряд (`cryo_discharge`) | Ледяная (`frost_pulse`) + Тесла (`storm_coil`) | `wetOnHit` | Цепь вешает Wet на `sig2` сек |
| Ионный Залп (`ion_volley`) | Огневая (`plasma_shutter`) + Тесла (`storm_coil`) | — | Быстрый chain (2 цели), без отдельного перка |
| Термокопьё (`thermo_spear`) | Огневая (`plasma_shutter`) + Рельсотрон (`railgun`) | `builtInShrapnel` | Splash вдоль pierce-луча |
| Ледобой (`icebreaker`) | Ледяная (`frost_pulse`) + Рельсотрон (`railgun`) | `bonusVsSlowWet` | +35% урона по slow/wet целям |
| Гаусс-Катушка (`gauss_coil`) | Рельсотрон (`railgun`) + Тесла (`storm_coil`) | `chainAfterPierce` | Дуга на `sig2` хопов после pierce |

- `signatureLabel()` показывает перк в UI слота.
- Headless-проверка: `npx tsx tools/verify_hybrids.ts` — все 6 spec OK.

### Ассеты и звук (инфраструктура)

- 6 ключей в [assetManifest.ts](../../src/config/assetManifest.ts) + [tools/assets.manifest.json](../../tools/assets.manifest.json).
- 8 ключей в [audioManifest.ts](../../src/config/audioManifest.ts) (6 shoot + 2 hit stretch).
- `ASSET_FALLBACKS` на родительские башни до появления PNG.
- `TOWER_SHOOT_SFX` по `cardId` — [BattleScene.ts](../../src/scenes/BattleScene.ts).
- Собственные `iconKey` у всех гибридов (не наследуют родительский ключ).

### Документация

- [current-state.md](../working/current-state.md) — перки и фоллбеки.
- [tower-sound-design.md](../done/tower-sound-design.md) §1.5 — таблица SFX.
- [v3-alignment.md](../done/v3-alignment.md) — гейт `fusion_recipes` не реализован.
- Урок `mech_fusion` — [tutorial.ts](../../src/config/tutorial.ts).
- Playbook генерации — [fusion-hybrid-assets.md](fusion-hybrid-assets.md).

---

## Осталось сделать

### 1. Спрайты (MVP)

**Готово (2026-06):** все 6 `assets/sprites/<iconKey>.png` сгенерированы (`gen_sprite.py`
с `--ref` на родителя), и **все 6 строк убраны из `ASSET_FALLBACKS`** — игра рисует
собственный спрайт гибрида, а не плейсхолдер родителя.

| Ключ | Ref | Статична / вращается |
|------|-----|----------------------|
| `steam_cannon` | `frost_pulse` | статична |
| `cryo_discharge` | `storm_coil` | статична |
| `ion_volley` | `plasma_shutter` | вращается (нужен `_dirs`, стретч) |
| `thermo_spear` | `railgun` | вращается (стретч) |
| `icebreaker` | `railgun` | вращается (стретч) |
| `gauss_coil` | `railgun` | вращается (стретч) |

- [x] `steam_cannon.png`
- [x] `cryo_discharge.png`
- [x] `ion_volley.png`
- [x] `thermo_spear.png`
- [x] `icebreaker.png`
- [x] `gauss_coil.png`

Команды и промпты — в [fusion-hybrid-assets.md](fusion-hybrid-assets.md). Спрайты на поле
пока **статичны** даже у «вращающихся» — `_dirs`-шиты (стретч §3) ещё не нарисованы.

### 2. Звуки (MVP)

Файлы `assets/audio/<key>.mp3` отсутствуют — играет фоллбек/тишина.

- [ ] `sfx_shoot_steam.mp3`
- [ ] `sfx_shoot_cryo.mp3`
- [ ] `sfx_shoot_ion.mp3`
- [ ] `sfx_shoot_thermo.mp3`
- [ ] `sfx_shoot_icebreaker.mp3`
- [ ] `sfx_shoot_gauss.mp3`

Промпты — блок «Fusion hybrid towers» в [audioManifest.ts](../../src/config/audioManifest.ts).

### 3. Второй проход (стретч)

- [ ] **`_dirs`-шиты** для `ion_volley`, `thermo_spear`, `icebreaker`, `gauss_coil` —
  без них турель на поле **статична** (сим целится, спрайт не крутится).
- [ ] `ion_volley` в `COMPOSED_AIM_SHEETS` ([cards.ts](../../src/config/cards.ts)),
  если шит в композитной раскладке (центр = база).
- [ ] **Уникальные hit-клипы** `sfx_hit_steam`, `sfx_hit_thermo` — в манифесте есть,
  но [BattleScene.ts](../../src/scenes/BattleScene.ts) бьёт только через `ELEMENT_HIT_SFX`
  по стихии; нужен per-card роутинг, если хотим отличать попадание.
- [ ] Опционально: `card_icon` 256px для руки, если tower 512 не читается на карточке.

### 4. Smoke в игре

- [ ] Admin mode → lvl_7
- [ ] Фьюжн двух карт в руке по рецепту
- [ ] Гибрид в руке — свой спрайт (не родительский плейсхолдер)
- [ ] Постановка на слот — `sfx_place`, турель на поле
- [ ] Выстрел — уникальный `sfx_shoot_*`
- [ ] Эффект в бою соответствует перку (пар/AoE, Wet на chain, shrapnel на pierce, +% slow/wet, дуга после pierce)

Headless перед ручным тестом:

```bash
npx tsx tools/verify_hybrids.ts
npm run typecheck
```

### 5. Финализация

- [ ] Закоммитить текущие изменения (логика + манифесты + доки).
- [ ] После полного набора ассетов — перенести [fusion-hybrid-assets.md](fusion-hybrid-assets.md)
  в `docs/done/`, этот файл — тоже; обновить ссылки в [docs/README.md](../README.md).

---

## Ключевые файлы

| Область | Файлы |
|---------|-------|
| Данные карт | `src/data/game_configs/*/cards.json`, `recipes.json` |
| Сим | `src/game/BattleSim.ts` (`buildTowerSpec`, `applyHit`, `firePierceLine`) |
| UI боя | `src/scenes/BattleScene.ts` (`fuseCards`, `TOWER_SHOOT_SFX`) |
| Спрайты | `src/config/assetManifest.ts`, `assets/sprites/` |
| Звук | `src/config/audioManifest.ts`, `assets/audio/` |
| Проверка | `tools/verify_hybrids.ts` |

---

## Рецепты (все доступны с ур.7)

| Родители | Гибрид |
|----------|--------|
| `frost_pulse` + `plasma_shutter` | `steam_cannon` |
| `frost_pulse` + `storm_coil` | `cryo_discharge` |
| `plasma_shutter` + `storm_coil` | `ion_volley` |
| `plasma_shutter` + `railgun` | `thermo_spear` |
| `frost_pulse` + `railgun` | `icebreaker` |
| `railgun` + `storm_coil` | `gauss_coil` |

---

## См. также

- [fusion-hybrid-assets.md](fusion-hybrid-assets.md) — пошаговый playbook PNG/MP3
- [tower-sound-design.md](../done/tower-sound-design.md) §1.5 — контракт звуков
- [current-state.md](../working/current-state.md) — зеркало «как есть в коде»
