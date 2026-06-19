# COMPONENT: Queue UI

Production queue card and detail surface.

## Files

| File | Purpose |
|---|---|
| `QueueCard.vue` | Entity card wrapper for queue identity, job item totals, output summary, and command actions. |
| `QueueDetail.vue` | Detail page body for artifacts, job composition, consumed source relations, and history. |
| `QueueEntryCard.vue` | Queue-editor cassette entry card with source inline ref, thumbnail, quantity, and parameter editing. |
| `QueueSourceCard.vue` | Compact queue-editor material source tile with deterministic SVG preview, identity, dimensions, and count. |

## Contract

- Expects a `queue` DTO with `status`, `lineage`, `data.job`, `data.materialConsumption`,
  and `summary`.
- `EntityCard`/`EntityPage` own identity, trace, and status placement.
- Artifact and consumed material relations render through `EntityInlineRef`.
- Available material source context is owned by nesting runs; queue cards do not
  render material availability summaries.
- Running nesting is a queue command action surfaced through page/header
  actions; material selection remains owned by `QueueEditor`.
- Queue delete commands are rendered outside the status rail. Compact queue
  cards keep command buttons in the card body, while the queue detail page
  exposes feature commands in the header actions slot. Queue lifecycle reset
  transitions come from `EntityStatus` through the workflow/status API.
- The queue editor passes command actions to `QueueCard` through the
  `commandActions` prop so lifecycle transitions and non-status commands stay
  separated by name as well as placement.
- Selector surfaces pass `expandable=false` and `density=dense` so clicking the
  compact card selects the queue without opening the `EntityCard` popover or
  using full card padding. Queue number prefixes and the full queue data block
  render only on full queue cards.
- Queue editor cassette rows use `QueueEntryCard`; the component emits quantity
  and parameter updates while `QueueEditor` remains the owner of persistence and
  `_key`-based row deletion. These rows keep natural panel height inside the
  center lane grid; the workspace lane owns scrolling.
- Queue editor selected warehouse sources use compact `QueueSourceCard` tiles
  instead of embedding pile/sheet/remnant cards. It draws remnant polygons when
  present and rectangular sheet previews for stock sources without stored
  geometry.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/queues/README.md](../../../server/features/queues/README.md)
