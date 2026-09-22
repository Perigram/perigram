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
- Material pile and nesting run relationships render as compact clickable
  `InstanceInlineRef` rows when available. Warehouse location remains part of
  lineage/detail traceability, not a repeated card fact.
- `SheetDetail` follows the same relation policy as `SheetCard`: source
  warehouse, material pile, and nesting run ids from lineage render through
  `InstanceInlineRef` rows instead of text-only ids.
- Sheet lifecycle controls are owned by `InstanceStatus` and the workflow/status
  API; detail pages do not synthesize local status commands.

## Related

- [shared](../../shared/README.md) - `InstanceCard` and `SpecsBlock`.
- [server/features/sheets](../../../server/features/sheets/README.md) - Sheet service and DTO contract.
