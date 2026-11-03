# Кастомные SVG-ассеты

Сюда можно положить свои SVG вместо процедурной векторной графики. Если файла с нужным именем нет — игра автоматически рисует старый спрайт. Если файл есть, он заменяет только визуал: хитбоксы, атаки, диалоги, физика и поведение остаются прежними.

## Как это работает

1. Положи SVG в нужную папку с **точным именем** из таблиц ниже.
2. Пересобери игру или перезапусти dev-сервер:

```sh
cd desktop
npm run build
npm start
```

Для разработки:

```sh
npm run dev
```

При добавлении нового файла Vite иногда требует перезапуска dev-сервера.

Если SVG не загрузился или файла нет, включается процедурный fallback — игра не ломается.

## Формат SVG

- Прозрачный фон, персонаж смотрит **вправо**.
- Любой `viewBox`, игра сама масштабирует по высоте.
- Точка привязки по умолчанию — **низ по центру** (ноги/основание персонажа).
- Для тайлов — ровно `16 × 16` единиц, привязка сверху слева.
- Не встраивай в SVG внешние картинки и шрифты: только векторные фигуры, градиенты и маски.

## Структура и имена файлов

### Фон

```
assets/custom/backgrounds/<биом>/back.svg
assets/custom/backgrounds/<биом>/mid.svg
assets/custom/backgrounds/<биом>/front.svg
```

Биомы: `ashen`, `fungal`, `sunken`, `forge`, `bone`, `throne`.

| Слой | Параллакс | Что перекрывает |
| --- | --- | --- |
| `back` | 0.12 | небо, луна, дальние руины |
| `mid` | 0.34 | средние арки, туман |
| `front` | 0.62 | передний план фона, но **за** тайлами и персонажами |

Если есть `back.svg`, процедурный фон полностью заменяется. `mid` и `front` можно добавлять отдельно. Изображение растягивается на экран и повторяется по горизонтали.

### Игрок

```
assets/custom/characters/player/idle.svg
assets/custom/characters/player/run.svg
assets/custom/characters/player/jump.svg
assets/custom/characters/player/dash.svg
assets/custom/characters/player/attack.svg
assets/custom/characters/player/cast.svg
assets/custom/characters/player/hurt.svg
```

Приоритет выбора: `dash` → `attack` → `cast` → `hurt` → `jump` → `run` → `idle`. Если нужного состояния нет, используется `idle.svg`, затем процедурный призрак.

Целевая высота — около `52` px игрового мира. Оружие и эффекты атаки рисуются скриптом поверх SVG.

### Враги

```
assets/custom/characters/enemies/<вид>/idle.svg
assets/custom/characters/enemies/<вид>/attack.svg
assets/custom/characters/enemies/<вид>/hurt.svg
```

Виды: `guard`, `archer`, `crawler`, `mage`, `bomber`, `elite`.

Высота подстраивается под хитбокс врага. При атаке/замахе берётся `attack.svg`, при получении урона — `hurt.svg`, иначе `idle.svg`.

### Боссы

```
assets/custom/characters/bosses/<босс>/idle.svg
assets/custom/characters/bosses/<босс>/phase2.svg
assets/custom/characters/bosses/<босс>/phase3.svg
assets/custom/characters/bosses/<босс>/attack.svg
assets/custom/characters/bosses/<босс>/hurt.svg
```

Боссы: `executioner`, `matriarch`, `choir`, `golem`, `boneking`, `hero`, `incubus`.

Выбор: `hurt` → `attack` → `phase3`/`phase2` (по текущей фазе) → `idle`. Если файла фазы нет, используется `idle.svg`. Смена фаз и атаки остаются скриптовыми.

### Кролик

```
assets/custom/characters/rabbit/idle.svg
assets/custom/characters/rabbit/angry.svg
assets/custom/characters/rabbit/flee.svg
```

`angry.svg` используется в результате «Съесть», `flee.svg` — при побеге. Если их нет, берётся `idle.svg`, затем процедурный кролик. Портрет в диалоге использует те же файлы.

### NPC

```
assets/custom/characters/npc/merchant.svg
assets/custom/characters/npc/oasis-keeper.svg
```

### Союзники легиона

```
assets/custom/characters/allies/<вид>/idle.svg
```

Виды те же, что у врагов. Если файла нет — процедурный призрачный союзник.

### Тайлы

```
assets/custom/tiles/<биом>/solid.svg
assets/custom/tiles/<биом>/platform.svg
assets/custom/tiles/<биом>/spike.svg
assets/custom/tiles/<биом>/secret-wall.svg
```

Биомы те же. Каждый тайл — `16 × 16`. Если, например, `solid.svg` нет, стены рисуются старым способом, а платформы могут использовать свой SVG независимо.

### UI

```
assets/custom/ui/hero/portrait.svg
```

Портрет в меню героя. Если файла нет — рисуется процедурный призрак.

## Порядок слоёв

Порядок остаётся таким же, как в игре. SVG просто занимает место соответствующего процедурного рисунка:

1. `backgrounds/<биом>/back`
2. `backgrounds/<биом>/mid`
3. `backgrounds/<биом>/front`
4. тайлы комнаты
5. декор и алтарь/торговец
6. капсулы и трупы
7. подбираемые предметы
8. союзники
9. враги
10. босс
11. кролик
12. снаряды
13. игрок
14. эффекты (fx)
15. HUD
16. меню, диалоги, экраны смерти/победы

## Тонкая настройка

В `manifest.json` можно переопределить для конкретного файла:

- `scale` — дополнительный масштаб;
- `offsetX`, `offsetY` — сдвиг в пикселях мира;
- `anchor` — `bottom-center`, `center` или `top-left`;
- `alpha` — прозрачность;
- `flip` — принудительно отразить.

Пример:

```json
{
  "version": 1,
  "overrides": {
    "characters/player/idle": { "offsetY": -2, "scale": 1.05 },
    "characters/bosses/incubus/idle": { "scale": 1.2, "anchor": "bottom-center" },
    "tiles/ashen/solid": { "alpha": 0.95 }
  }
}
```

После изменения `manifest.json` тоже нужна пересборка/перезапуск.

## Важно

- Имена папок и файлов чувствительны к регистру.
- Не удаляй `manifest.json`, если не уверен: без него пропадут тонкие настройки, но fallback продолжит работать.
- SVG — только визуальная замена. Логика игры, урон, коллизии и поведение берутся из TypeScript-кода.
