# OCCS Default Layer Registry v0.1

This registry standardizes canonical OCCS layer IDs and maps them to the Russian CAD aliases provided for the current production workflow.

Layer operation is semantic: an OCCS entity uses `layer`, and the layer definition determines whether it is a cut, fold route, engraving, code mark, contour, or dimension.

## Naming rules

- Canonical IDs use lowercase dot-separated English names.
- Russian aliases are preserved exactly for DXF/CAD import-export.
- Group/prefix layers are recognized but normally do not contain production entities.
- Template canonical layer IDs SHOULD NOT contain tool names, cutter diameters, or fold angles.
- Tool diameter, hole diameter, fold angle, and tool offset SHOULD be stored explicitly in entity geometry, `toolOffset`, `parameters`, or design/export metadata when machine behavior depends on them.


## Layers

| Canonical ID | Russian alias | Group | Kind | Production | Allowed geometry | Purpose |
|---|---|---|---|---:|---|---|
| `contour.prefix` | `1_0_Контуры________________Префикс` | `contour` | `group` | no | `` | Prefix/group layer for contour-related geometry. Not normally used for entities. |
| `contour.cassette_face` | `1_1_Лицо_Кассеты` | `contour` | `reference` | no | `polygon, path` | Contour of the cassette face/visible face in façade view. |
| `contour.flat_pattern.face_and_returns` | `1_2_Развертка кассеты_Лицо+подгибы` | `contour` | `reference` | no | `polygon, path` | Contour of the cassette flat pattern, including face and folded returns. |
| `contour.flat_pattern.offset_envelope` | `1_3_Габарит развертки_  + Ǿ фрезы` | `contour` | `reference` | no | `polygon, path` | Offset/envelope contour of the flat pattern. Concrete tool allowance is resolved in design/export data. |
| `contour.material_sheet` | `1_4_Лист материала_Цвет_№ партии` | `contour` | `reference` | no | `polygon` | Boundary of the source material sheet, usually with color and batch metadata. |
| `contour.nesting_field` | `1_5_Поле партии раскроя_№` | `contour` | `reference` | no | `polygon` | Boundary or field of a cutting/nesting batch. |
| `cut.prefix` | `2_0_Обрезка_____________Ǿ  Фрезы` | `cut` | `group` | no | `` | Prefix/group layer for through-cut geometry. Not normally used for entities. |
| `cut.outer` | `2_1_Обрезь_3,15` | `cut` | `production` | yes | `polygon, path, circle` | Outer through-cut contour. CAD aliases may include shop-specific tool diameter text. |
| `cut.inner` |  | `cut` | `production` | yes | `polygon, path, circle` | Inner through-cut contour for openings and cutouts. |
| `cut.hole` | `2_2_Отверстие_5` | `cut` | `production` | yes | `circle, polygon` | Through-cut hole. Hole diameter belongs to entity geometry or exact design parameters. |
| `fold.prefix` | `3_0_Загиб______________↓ Угол Фрезы` | `fold` | `group` | no | `` | Prefix/group layer for fold, routing, and engraving operations. Not normally used for entities. |
| `fold.route` | `3_1_Фрезеровка_90` | `fold` | `production` | yes | `path` | Routing/V-groove layer for a fold. Fold angle belongs to fold.angle or exact design data. |
| `fold.engrave` | `3_2_Гравировка _` | `fold` | `production` | yes | `path, text, polygon` | Engraving/marking layer. |
| `fold.reserved` | `3_3__` | `fold` | `reserved` | no | `path, polygon, circle, text` | Reserved layer slot for future fold/routing operation. |
| `code.prefix` | `4_0_Кодификатор_____________Префикс` | `code` | `group` | no | `` | Prefix/group layer for text codes and production identifiers. Not normally used for entities. |
| `code.cassette_mark` | `4_1_Марка_Кассета` | `code` | `annotation` | yes | `text, path, polygon` | Cassette mark/identifier for production and installation. |
| `code.batch_number` | `4_2_№  партии_раскроя` | `code` | `annotation` | yes | `text` | Cutting/nesting batch number. |
| `code.paint_direction` | `4_3_Направление_Покраски` | `code` | `annotation` | yes | `path, text, polygon` | Paint, grain, or coating direction mark. |
| `dimension.prefix` | `5_0_Размеры_______________Префикс` | `dimension` | `group` | no | `` | Prefix/group layer for dimensions. Not normally used for entities. |
| `dimension.cassette` | `5_1_Размер_Кассета` | `dimension` | `annotation` | no | `dimension, text, path` | Dimensions of the finished cassette. |
| `dimension.material_sheet` | `5_2_Размер_Лист` | `dimension` | `annotation` | no | `dimension, text, path` | Dimensions of the material sheet. |
| `dimension.envelope` | `5_3_Размер_Габарит` | `dimension` | `annotation` | no | `dimension, text, path` | Overall envelope dimensions. |

## Original Russian alias list

```txt
1_0_Контуры________________Префикс
1_1_Лицо_Кассеты
1_2_Развертка кассеты_Лицо+подгибы
1_3_Габарит развертки_  + Ǿ фрезы
1_4_Лист материала_Цвет_№ партии
1_5_Поле партии раскроя_№

2_0_Обрезка_____________Ǿ  Фрезы
2_1_Обрезь_3,15
2_2_Отверстие_5

3_0_Загиб______________↓ Угол Фрезы
3_1_Фрезеровка_90
3_2_Гравировка _
3_3__

4_0_Кодификатор_____________Префикс
4_1_Марка_Кассета
4_2_№  партии_раскроя
4_3_Направление_Покраски

5_0_Размеры_______________Префикс
5_1_Размер_Кассета
5_2_Размер_Лист
5_3_Размер_Габарит
```
