# COMPONENT: Queue UI

Production queue card and detail surface.

## Files

| File | Purpose |
|---|---|
| `QueueCard.vue` | Entity card wrapper for queue identity, job item totals, output summary, and lifecycle actions. |
| `QueueDetail.vue` | Detail page body for artifacts, job composition, consumed source relations, and history. |
| `QueueEntryCard.vue` | Queue-editor cassette entry card with source inline ref, thumbnail, quantity, and parameter editing. |
| `QueueSourceCard.vue` | Queue-editor selected material source tile with preview, identity, dimensions, and count. |

## Contract

- Expects a `queue` DTO with `status`, `lineage`, `data.job`, `data.materialConsumption`,
  and `summary`.
- `EntityCard`/`EntityPage` own identity, trace, and status placement.
- Artifact and consumed material relations render through `EntityInlineRef`.
- Available material source context is owned by nesting runs; queue cards do not
  render material availability summaries.
- Running nesting is a queue command action surfaced through status/page actions;
  material selection remains owned by `QueueEditor`.
- Parent surfaces can pass extra `statusActions` into `QueueCard`; the queue
  workspace uses this so reset/status/delete commands stay on the active queue
  entity.
- Selector surfaces pass `expandable=false` and `density=dense` so clicking the
  compact card selects the queue without opening the `EntityCard` popover or
  using full card padding. Queue number prefixes and the full queue data block
  render only on full queue cards.
- Queue editor cassette rows use `QueueEntryCard`; the component emits quantity
  and parameter updates while `QueueEditor` remains the owner of persistence and
  `_key`-based row deletion. These rows keep natural panel height inside the
  center lane grid; the workspace lane owns scrolling.
- Queue editor selected warehouse sources use `QueueSourceCard` instead of
  embedding pile/sheet/remnant cards. It renders remnant geometry through
  `GeometryPreview` when present and uses a rectangular sheet preview for stock
  sources without stored geometry.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/queues/README.md](../../../server/features/queues/README.md)
