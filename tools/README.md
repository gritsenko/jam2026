# Генерация спрайтов (Gemini / «Nano Banana»)

Пайплайн: текстовый промпт → Gemini генерит картинку на плоском фоне → код вырезает
фон, обрезает поля и **ужимает до нужного размера** (чтобы в игру не попадали 1–2K
исходники) → готовый PNG с альфой в `assets/sprites/`.

## Разовая настройка

1. **Виртуальное окружение и зависимости** (уже создано скриптом подготовки, но если
   переустанавливаешь):
   ```powershell
   python -m venv tools\.venv
   tools\.venv\Scripts\python.exe -m pip install -r tools\requirements.txt
   ```

2. **API-ключ.** Возьми ключ в https://aistudio.google.com/apikey и положи одной
   строкой в файл `tools/.gemini_key` (он в `.gitignore`, в репозиторий не уедет):
   ```powershell
   "ВАШ_КЛЮЧ" | Out-File -Encoding ascii tools\.gemini_key
   ```
   Альтернатива — переменная окружения `GEMINI_API_KEY`, но файл надёжнее: он
   работает между отдельными вызовами агента, когда окружение не сохраняется.

## Использование

```powershell
tools\.venv\Scripts\python.exe tools\gen_sprite.py "<английское описание>" assets\sprites\<имя>.png [опции]
```

Примеры:
```powershell
# Турель (3/4 вид сверху, под слот на поле)
tools\.venv\Scripts\python.exe tools\gen_sprite.py "plasma shutter turret, glowing orange plasma core, brass and steel" assets\sprites\plasma_shutter.png --category tower

# Иконка карты (квадрат, поменьше)
tools\.venv\Scripts\python.exe tools\gen_sprite.py "frost pulse emitter, icy blue crystals" assets\sprites\card_frost_pulse.png --category card_icon --size 256

# Враг
tools\.venv\Scripts\python.exe tools\gen_sprite.py "armored desert raider creature, walking" assets\sprites\enemy_raider.png --category enemy

# Тайл местности (непрозрачный, на весь кадр — фон не вырезается)
tools\.venv\Scripts\python.exe tools\gen_sprite.py "cracked desert sand ground, top-down" assets\sprites\tile_sand.png --category tile --size 512
```

### Опции
| Опция | По умолчанию | Назначение |
|---|---|---|
| `--category` | — | `card_icon`, `tower`/`turret`, `enemy`, `prop`, `fx`, `tile`, `background`. Задаёт ракурс; `tile`/`background` не режут фон. |
| `--size` | `512` | Максимальная сторона итогового PNG (только уменьшение). Иконки 256, турели/враги 512, фоны 1024. |
| `--model` | авто | Принудительно задать модель. Иначе перебор: Nano Banana 2 → Pro → Nano Banana. |
| `--ref <path>` | `docs/style_ref.png` | Референс стиля. Можно указать уже принятый спрайт для консистентности. |
| `--no-ref` | — | Не прикреплять референс. |
| `--key` | `auto` | Цвет хромакея: `auto` (по углам), `magenta`, `green`, `"r,g,b"`. |
| `--pixel` | — | Уменьшение через NEAREST (для пиксель-арта). |
| `--keep-raw` | — | Сохранить исходник в `assets/raw/`. |

## Консистентность стиля

- Единый стиль задаётся в [sprite_style.py](sprite_style.py) (`STYLE_PREAMBLE`) — правь
  там, чтобы поменять вид всего проекта разом.
- `docs/style_ref.png` автоматически прикрепляется как референс. Когда получишь
  удачный спрайт-эталон — указывай его через `--ref`, новые ассеты будут под него.

## Переобработать без новой генерации

Если спрайт сгенерён, но нужен другой размер/обрезка — не трать API-вызов:
```powershell
tools\.venv\Scripts\python.exe tools\postprocess.py assets\raw\foo.raw.png assets\sprites\foo.png --size 384
```

### Чистка фиолетовой каёмки (де-фриндж)

Хромакей оставляет тонкую цветную (магента) каёмку на краях. `gen_sprite.py`
теперь чистит её автоматически (эрозия альфы на 1px + де-спилл магенты в полосе у
края — внутренние цвета не трогаются). Можно почистить уже готовый PNG с альфой,
без перегенерации и без исходника:
```powershell
tools\.venv\Scripts\python.exe tools\postprocess.py assets\sprites\foo.png assets\sprites\foo.png --no-key --size 1024
```
Опции: `--erode <px>` (по умолчанию 1), `--feather <px>` (0.8), `--no-clean`
(выключить), `--clean-key <цвет>` (какой цвет считать фоновым спиллом). Для
непрозрачных фонов/тайлов чистка сама пропускается.

## Замечания

- На всех картинках Gemini стоит невидимый водяной знак **SynthID** — это нормально.
- Бесплатный тир AI Studio (~сотни картинок/день) на прототип хватает.
- Прозрачность делается через вырезание плоского фона (надёжнее, чем просить
  «transparent background» у модели). Промпт сам просит фон `#FF00FF`.
