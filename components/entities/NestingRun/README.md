# COMPONENT: Nesting Run Entity UI

`NestingRunCard.vue` renders nesting run DTOs through the shared `EntityCard`
chrome.

## Behavior

- Uses the `run` prop as the primary DTO and supports `inline`, `compact`, and
  `card` variants.
- Shows result metrics with `DataBlock` when the run is `COMPLETE` or `CHOSEN`.
- Renders related `sheet_design` entities from the explicit `sheetDesigns` prop
  and from injected context by matching `lineage.runId` or
  `run.data.sheetDesignIds`. Related designs render as the normal
  `SheetDesignCard` inline variant; expansion is owned by `EntityCard`, not by
  the nesting run card or the workbench page.
- Does not render generated artifacts or DXF previews. File outputs are owned by
  artifact/attachment surfaces; the nesting run card stays focused on run
  metrics and resulting sheet designs.
- Keeps lifecycle actions inside `EntityCard`/`EntityStatus`; choose/delete are
  passed as status actions.

The injected context is used by development surfaces such as the admin
workbench. Production pages can continue passing related entities explicitly.

## Related

- [shared components](../../shared/README.md)
- [test data](../../../test-data/README.md)
- [nesting feature](../../../server/features/nesting/README.md)
