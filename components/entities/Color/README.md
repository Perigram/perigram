# COMPONENT: Color UI

Color swatch card for catalog colors.

## Files

| File | Purpose |
|---|---|
| `ColorCard.vue` | Entity card wrapper with swatch header, color code, hex value, and catalog relation. |

## Contract

- Expects a `color` DTO with `identity`, `lineage.catalogId`, and
  `data.visuals.hexCode`.
- The color swatch is real data-driven styling; other chrome remains owned by
  `EntityCard`.
- Catalog context renders through `EntityInlineRef` so the relation popover uses
  the registered catalog card.

## Related

- [components/entities/Catalog/README.md](../Catalog/README.md)
- [components/shared/README.md](../../shared/README.md)
- [server/features/colors/README.md](../../../server/features/colors/README.md)
