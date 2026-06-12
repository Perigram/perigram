# COMPONENT: Queue UI

Production queue card and detail surface.

## Files

| File | Purpose |
|---|---|
| `QueueCard.vue` | Entity card wrapper for job items, material pool, output summary, and lifecycle actions. Accepts parent status actions and can hide delete/summary/footer actions or disable expansion in selector contexts. |
| `QueueDetail.vue` | Detail page body for artifacts, job composition, material sources, consumption, and history. |
| `QueueEntryCard.vue` | Queue-editor cassette entry card with source inline ref, thumbnail, quantity, and parameter editing. |

## Contract

- Expects a `queue` DTO with `status`, `lineage`, `data.job`, `data.materialConsumption`,
  and `summary`.
- `EntityCard`/`EntityPage` own identity, trace, and status placement.
- Artifact and consumed material relations render through `EntityInlineRef`.
- Running nesting is a queue command action surfaced through status/page actions;
  material selection remains owned by `QueueEditor`.
- Parent surfaces can pass extra `statusActions` into `QueueCard`; the queue
  workspace uses this so reset/status commands stay on the active queue entity.
- Selector surfaces pass `expandable=false` so clicking the card selects the
  queue instead of opening the compact `EntityCard` popover.
- Queue editor cassette rows use `QueueEntryCard`; the component emits quantity
  and parameter updates while `QueueEditor` remains the owner of persistence and
  `_key`-based row deletion.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/queues/README.md](../../../server/features/queues/README.md)
