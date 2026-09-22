# COMPONENT: Nesting Run Entity UI

`NestingRunCard.vue` renders nesting run DTOs through the shared `InstanceCard`
chrome.

## Behavior

- Uses the `run` prop as the primary DTO and supports `inline`, `compact`, and
  `card` variants.
- Shows result metrics with `DataBlock` when the run is `COMPLETE` or `CHOSEN`.
- Renders `run.data.materialPool` as material pile, sheet, or remnant
  `InstanceInlineRef` rows. This is the accepted source context for a run; queue
  cards do not summarize available material sources.
- Renders related `sheet_design` entities from the explicit `sheetDesigns` prop
  and from injected context only after filtering by `lineage.runId` or
  `run.data.sheetDesignIds`; queue-level sheet-design lists must not make every
  run card show every design in the queue. Related designs render through the
  shared `InstanceRelationsBlock` compact gallery, so sheet-design previews,
  overflow, popovers, and generated detail actions follow the same convention
  as generated card relation galleries instead of a nesting-run-specific tile.
  Compact relation mode is preserved inside the overflow popover, so runs with
  more than two sheet outputs do not fall back to inline sheet references.
  The generic card/popup surface also includes the domain `production` field
  group so an inline nesting-run popup can render `data.sheetDesignIds` without
  needing the queue editor's explicit `sheetDesigns` prop.
- Does not render generated artifacts or DXF previews. File outputs are owned by
  artifact/attachment surfaces; the nesting run card stays focused on run
  metrics and resulting sheet designs.
- Keeps lifecycle actions inside `InstanceCard`/`InstanceStatus`. Choosing a
  completed run is advertised only by the canonical status actions API. The card
  does not inject `CHOSEN` locally, because the backend must run queue/material
  preflight before that button is visible.
- Destructive run actions are gated by entity-scoped `nesting_runs` grants for
  the concrete run. The card must not infer run management from parent
  `queues:write` or global queue edit permissions, because process graphs can
  expose queue editing and run visibility in different status windows.

The injected context is used by development surfaces such as the admin
workbench. The production queue editor passes related entities explicitly by
loading `/api/sheet-designs?queueId=:queueId` after run fetches and after
nesting completion.

## Related

- [shared components](../../shared/README.md)
- [test data](../../../test-data/README.md)
- [nesting feature](../../../server/features/nesting/README.md)
