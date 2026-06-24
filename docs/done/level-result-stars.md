# Звёзды за прохождение уровня (оценка на баннере итога)

> **Статус:** реализовано. Поведение в коде — в
> [../working/current-state.md](../working/current-state.md). Этот док описывает
> **показ оценки на баннере итога**; сохранение звёзд, пипсы на узлах и
> разблокировка уровней реализованы мета-кампанией
> ([progression-and-tech-tree.md](progression-and-tech-tree.md)).

## Зачем

Дать игроку понятный итог забега: уровень оценивается **1–3 звёздами** по тому,
сколько Core (HP базы) осталось на финише. Это мягкая кривая сложности без жёсткого
фейла и фундамент для межсессионной меты. Канон дизайна — раздел **§10.Г**
в [../planned/synergy-grid-td-v3.md](../planned/synergy-grid-td-v3.md); экономическая
привязка к «Чертежам» — там же и в
[progression-and-tech-tree.md](progression-and-tech-tree.md).

## Правило оценки

Метрика — **остаток Core на финише**, а не число прорвавшихся монстров (если враги
наносят базе разный урон, «половина монстров» ≠ «половина Core», поэтому канон —
остаток HP). `Core` стартует с `CORE_MAX` (= 20, [combatRules.ts](../../src/config/combatRules.ts))
и убывает на `coreDamage` каждого прорвавшегося врага.

| Звёзды | Условие (на победе) |
|---|---|
| ★ | Уровень пройден (`coreHp > 0`) |
| ★★ | `coreHp ≥ 50%` от `CORE_MAX` |
| ★★★ | Core не тронут (`coreHp === CORE_MAX`) — ни один враг не прорвался |

Поражение — **0 звёзд** (баннер DEFEAT звёзд не показывает).

3★ (Core нетронут) — уровневый аналог волнового **Perfect Clear** (+15 кристаллов
за чистую волну, §8): чистые волны внутри партии естественно складываются в 3★.

## Что делаем

1. **Расчёт звёзд** — `starsForClear(coreHp, coreMax)` в
   [progression.ts](../../src/config/progression.ts): 3★ при `coreHp === coreMax`,
   2★ при `coreHp/coreMax ≥ 0.5`, иначе 1★. **Единый источник**: эта же функция
   считает звёзды и для сохранения прогресса.
2. **Запись результата** — `recordClear(levelId, coreHp, coreMax)` в
   [progress.ts](../../src/game/progress.ts): помечает уровень пройденным, хранит
   лучший результат (localStorage) и **возвращает звёзды забега**.
3. **Ассет** `icon_star` (category `icon`, size 256) — в
   [assetManifest.ts](../../src/config/assetManifest.ts) и зеркально в
   [tools/assets.manifest.json](../../tools/assets.manifest.json). Если PNG ещё нет —
   рисуется **звёздчатый плейсхолдер** (форма `star` в
   [AssetLoader](../../src/core/AssetLoader.ts)), чтобы оценка читалась сразу.
   Заполненная звезда = спрайт как есть; пустая = тот же спрайт с тинтом/прозрачностью.
4. **Отрисовка** — `BattleBanner` ([BattleBanner.ts](../../src/ui/BattleBanner.ts))
   получает опции `stars?: number` и `starTexture?: Texture` и рисует ряд из 3 звёзд
   (n заполнено) над кнопками. Без эмодзи/Unicode — через текстуру ассета.
5. **Вызов** — `BattleScene.showBanner('victory')`
   ([BattleScene.ts](../../src/scenes/BattleScene.ts)) на победе вызывает
   `progress.recordClear(...)`, и его результат идёт **И в сохранение, И в баннер**
   (`stars` + `assets.get('icon_star')`) — показанное == сохранённое. DEFEAT — без звёзд.

Графику генерировать так (имя файла = ключ):

```powershell
tools\.venv\Scripts\python.exe tools\gen_sprite.py "glowing gold five-point reward star, brass rim, clean game UI icon" assets\sprites\icon_star.png --category icon --size 256
```

(Нужен `tools/.gemini_key`; до генерации работает звёздчатый плейсхолдер.)

## Связь с мета-кампанией

Расчёт звёзд (`starsForClear`), их **сохранение** (`recordClear` / localStorage),
**пипсы на узлах** карты и **разблокировка** уровней — часть мета-кампании
([progression-and-tech-tree.md](progression-and-tech-tree.md) /
[progress.ts](../../src/game/progress.ts) /
[WorldMapNode](../../src/ui/WorldMapNode.ts)). Этот док отвечает только за **показ
звёзд на баннере итога**. Ещё не сделано: **«Чертежи»** (1/2/3★ → 1/2/3) и
внутрисессионное **SP-дерево** — стретчи мета-кампании.

## Критерии готовности

- Победа с нетронутым Core → 3★ на баннере; с потерей < 50% → 2★; с потерей ≥ 50%,
  но выжил → 1★; поражение → звёзд нет.
- Звёзды нарисованы текстурой `icon_star` (или её плейсхолдером), без эмодзи/фигур.
- Показанные звёзды == сохранённые (`recordClear`).
- `npm run typecheck` зелёный; визуально корректно на портрете и широком экране.
