# Звёзды за прохождение уровня (оценка на баннере итога)

> **Статус:** реализовано (срез — **показ оценки в конце боя**). Поведение в коде —
> в [../working/current-state.md](../working/current-state.md). Сохранение звёзд,
> пипсы на узлах карты, разблокировка уровней и «Чертежи» — **вне этого среза**
> (отдельная задача, см. ниже «Вне среза»).

## Зачем

Дать игроку понятный итог забега: уровень оценивается **1–3 звёздами** по тому,
сколько Core (HP базы) осталось на финише. Это мягкая кривая сложности без жёсткого
фейла и фундамент для будущей межсессионной меты. Канон дизайна — раздел **§10.Г**
в [../planned/synergy-grid-td-v3.md](../planned/synergy-grid-td-v3.md); экономическая
привязка к «Чертежам» — там же и в
[../planned/progression-and-tech-tree.md](../planned/progression-and-tech-tree.md).

## Правило оценки

Метрика — **остаток Core на финише**, а не число прорвавшихся монстров (если враги
наносят базе разный урон, «половина монстров» ≠ «половина Core», поэтому канон —
остаток HP). `Core` стартует с `CORE_MAX` (= 20, [combatRules.ts](../../src/config/combatRules.ts))
и убывает на `coreDamage` каждого прорвавшегося врага.

| Звёзды | Условие (на победе) |
|---|---|
| ★ | Уровень пройден (`coreHp > 0`) |
| ★★ | `coreHp ≥ STAR_TWO_CORE_FRAC × CORE_MAX` (по умолчанию ≥ 50%) |
| ★★★ | Core не тронут (`coreHp === CORE_MAX`) — ни один враг не прорвался |

Поражение — **0 звёзд** (баннер DEFEAT звёзд не показывает).

3★ (Core нетронут) — уровневый аналог волнового **Perfect Clear** (+15 кристаллов
за чистую волну, §8): чистые волны внутри партии естественно складываются в 3★.

## Что делаем (срез)

1. **Порог** `STAR_TWO_CORE_FRAC` (= `0.5`) — в [combatRules.ts](../../src/config/combatRules.ts),
   рядом с `CORE_MAX`. Тунабл данных, отдельно от логики.
2. **Правило** — геттер `BattleSim.starRating: number` (0..3) в
   [BattleSim.ts](../../src/game/BattleSim.ts): читает `status`/`coreHp`/`coreMax`,
   возвращает 0 на не-победе. Симуляция — источник истины по итогу боя.
3. **Ассет** `icon_star` (category `icon`, size 256) — в
   [assetManifest.ts](../../src/config/assetManifest.ts) и зеркально в
   [tools/assets.manifest.json](../../tools/assets.manifest.json). До генерации PNG
   рисуется **звёздчатый плейсхолдер** (новая форма `star` в
   [AssetLoader](../../src/core/AssetLoader.ts)), чтобы оценка читалась сразу.
   Заполненная звезда = спрайт как есть; пустая = тот же спрайт с тинтом/прозрачностью.
4. **Отрисовка** — `BattleBanner` ([BattleBanner.ts](../../src/ui/BattleBanner.ts))
   получает опции `stars?: number` и `starTexture?: Texture` и рисует ряд из 3 звёзд
   (n заполнено) над кнопками. Без эмодзи/Unicode — через текстуру ассета.
5. **Вызов** — `BattleScene.showBanner('victory')`
   ([BattleScene.ts](../../src/scenes/BattleScene.ts)) считает `this.sim.starRating`
   и передаёт его + `assets.get('icon_star')` в баннер. DEFEAT — без звёзд.

Графику генерировать так (имя файла = ключ):

```powershell
tools\.venv\Scripts\python.exe tools\gen_sprite.py "glowing gold five-point reward star, brass rim, clean game UI icon" assets\sprites\icon_star.png --category icon --size 256
```

(Нужен `tools/.gemini_key`; до генерации работает звёздчатый плейсхолдер.)

## Вне среза (делает отдельная задача / другой разработчик)

- **Сохранение** лучших звёзд по уровню (localStorage / прогресс-стор).
- **Пипсы звёзд на узлах** карты ([WorldMapNode](../../src/ui/WorldMapNode.ts)).
- **Разблокировка** следующих уровней по прогрессу (сейчас `state` узлов статичен в
  [levels.ts](../../src/config/levels.ts)).
- **«Чертежи»** (Blueprints) и мета-дерево (1/2/3★ → 1/2/3 Чертежа) —
  см. [../planned/progression-and-tech-tree.md](../planned/progression-and-tech-tree.md).

## Критерии готовности среза

- Победа с нетронутым Core → 3★ на баннере; с потерей < 50% → 2★; с потерей ≥ 50%,
  но выжил → 1★; поражение → звёзд нет.
- Звёзды нарисованы текстурой `icon_star` (или её плейсхолдером), без эмодзи/фигур.
- `npm run typecheck` зелёный; визуально корректно на портрете и широком экране.
