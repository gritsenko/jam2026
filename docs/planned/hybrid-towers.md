# Hybrid towers — доработка фьюжн-гибридов (v2 §6.5)

> **Статус: частично реализовано (2026-06).** Боевая логика, данные, манифесты и
> роутинг в коде готовы; PNG/MP3 на диске отсутствуют. После полного закрытия чеклиста
> — перенести этот файл в `docs/done/` и обновить [current-state.md](../working/current-state.md).

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

| Гибрид | Перк | Поведение в [BattleSim.ts](../../src/game/BattleSim.ts) |
|--------|------|-----------------------------------------------------------|
| Паровая Пушка (`steam_cannon`) | `steamBurst` | AoE-урон при попадании + slow/Wet (сигнатура `freeze_radius`) |
| Криоразряд (`cryo_discharge`) | `wetOnHit` | Цепь вешает Wet на `sig2` сек |
| Термокопьё (`thermo_spear`) | `builtInShrapnel` | Splash вдоль pierce-луча |
| Ледобой (`icebreaker`) | `bonusVsSlowWet` | +35% урона по slow/wet целям |
| Гаусс-Катушка (`gauss_coil`) | `chainAfterPierce` | Дуга на `sig2` хопов после pierce |
| Ионный Залп (`ion_volley`) | — | Быстрый chain (2 цели), без отдельного перка |

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

Пока на диске **нет** `assets/sprites/<iconKey>.png` — игра рисует родителя через
`ASSET_FALLBACKS`.

| Ключ | Ref | Статична / вращается |
|------|-----|----------------------|
| `steam_cannon` | `frost_pulse` | статична |
| `cryo_discharge` | `storm_coil` | статична |
| `ion_volley` | `plasma_shutter` | вращается (нужен `_dirs`, стретч) |
| `thermo_spear` | `railgun` | вращается (стретч) |
| `icebreaker` | `railgun` | вращается (стретч) |
| `gauss_coil` | `railgun` | вращается (стретч) |

- [ ] `steam_cannon.png`
- [ ] `cryo_discharge.png`
- [ ] `ion_volley.png`
- [ ] `thermo_spear.png`
- [ ] `icebreaker.png`
- [ ] `gauss_coil.png`

Команды и промпты — в [fusion-hybrid-assets.md](fusion-hybrid-assets.md). После каждого
PNG: убрать строку из `ASSET_FALLBACKS`, перезапустить `npm run dev`.

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
