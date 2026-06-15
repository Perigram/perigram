# COMPONENT: Nesting Run Entity UI

`NestingRunCard.vue` renders nesting run DTOs through the shared `EntityCard`
chrome.

## Behavior

- Uses the `run` prop as the primary DTO and supports `inline`, `compact`, and
  `card` variants.
- Shows result metrics with `DataBlock` when the run is `COMPLETE` or `CHOSEN`.
- Renders `run.data.materialPool` as material pile, sheet, or remnant
  `EntityInlineRef` rows. This is the accepted source context for a run; queue
  cards do not summarize available material sources.
- Renders related `sheet_design` entities from the explicit `sheetDesigns` prop
  and from injected context only after filtering by `lineage.runId` or
  `run.data.sheetDesignIds`; queue-level sheet-design lists must not make every
  run card show every design in the queue. Related designs render as the normal
  `SheetDesignCard` inline variant; expansion is owned by `EntityCard`, not by
  the nesting run card or the workbench page.
- When `showSheetDesignPreviews` is true, related designs render as compact
  geometry preview tiles using `GeometryPreview` plus `IdentityBlock`. The
  production queue workspace enables this in the right-side runs lane so
  operators can inspect resulting sheet layouts without opening each design.
- Does not render generated artifacts or DXF previews. File outputs are owned by
  artifact/attachment surfaces; the nesting run card stays focused on run
  metrics and resulting sheet designs.
- Keeps lifecycle actions inside `EntityCard`/`EntityStatus`. Choosing a
  completed run is advertised only by the canonical status actions API. The card
  does not inject `CHOSEN` locally, because the backend must run queue/material
  preflight before that button is visible.

The injected context is used by development surfaces such as the admin
workbench. The production queue editor passes related entities explicitly by
loading `/api/sheet-designs?queueId=:queueId` after run fetches and after
nesting completion.

## Related

- [shared components](../../shared/README.md)
- [test data](../../../test-data/README.md)
- [nesting feature](../../../server/features/nesting/README.md)
