# COMPONENT: Queue UI

Production queue card and detail surface.

## Files

| File | Purpose |
|---|---|
| `QueueCard.vue` | Entity card wrapper for job items, material pool, output summary, and lifecycle actions. |
| `QueueDetail.vue` | Detail page body for artifacts, job composition, material sources, consumption, and history. |
| `QueueEntryCard.vue` | Queue-editor cassette entry card with source inline ref, thumbnail, quantity, and parameter editing. |

## Contract

- Expects a `queue` DTO with `status`, `lineage`, `data.job`, `data.materialConsumption`,
  and `summary`.
- `EntityCard`/`EntityPage` own identity, trace, and status placement.
- Artifact and consumed material relations render through `EntityInlineRef`.
- Running nesting is a queue command action surfaced through status/page actions;
  material selection remains owned by `QueueEditor`.
- Queue editor cassette rows use `QueueEntryCard`; the component emits quantity
  and parameter updates while `QueueEditor` remains the owner of persistence and
  `_key`-based row deletion.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/queues/README.md](../../../server/features/queues/README.md)
