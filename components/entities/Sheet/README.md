# COMPONENT: Sheet UI

Card surface for physical sheet inventory entries.

## Files

| File | Purpose |
|---|---|
| `SheetCard.vue` | Entity card for sheet inventory and source context. |
| `SheetDetail.vue` | Entity detail view for physical sheet specs, source references, visual representation, and status history. |

## Contract

- Expects a v24 `sheet` DTO with dimensions in the standard `specs` block and
  storage/source ids in `lineage`.
- Standard physical dimensions render through `SpecsBlock`.
- Warehouse, material pile, and nesting run relationships render as compact
  clickable `EntityInlineRef` rows when available.
- `SheetDetail` follows the same relation policy as `SheetCard`: source
  warehouse, material pile, and nesting run ids from lineage render through
  `EntityInlineRef` rows instead of text-only ids.

## Related

- [shared](../../shared/README.md) - `EntityCard` and `SpecsBlock`.
- [server/features/sheets](../../../server/features/sheets/README.md) - Sheet service and DTO contract.
