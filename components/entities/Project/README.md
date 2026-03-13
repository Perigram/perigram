# COMPONENT: Project UI Components

Vue components for displaying and interacting with `Project` entities.

## Files

| File | Purpose |
|---|---|
| `ProjectCard.vue` | Card display for a project entity — supports `card`, `compact`, `inline` variants via `EntityCard` chrome |
| `ProjectDetail.vue` | Expanded detail view with queues list and summary sidebar |

## ProjectCard

Props: `project` (Object, required), `variant` (String, default `'card'`).
Emits: `view`, `edit`, `delete`.

- Delegates chrome (TraceChain, IdentityBlock, EntityStatus) to `EntityCard`.
- Card body: `DataBlock` with `summary.queueCount` — populated by the centralized aggregator (`server/core/machines/aggregator.js`) when queues are created.
- Footer: edit/delete `Button`s gated by `authStore.can('projects', 'edit|delete')`.

## ProjectDetail

Props: `project` (Object, required). Emits: `add-queue`.

Fetches queues via `$fetch('/api/queues?lineage.projectId=...')` on mount and on `project._id` change.
Renders queues as `QueueCard` (compact variant) and shows a `StatusHistory` sidebar panel.

## Related
- [components/shared/README.md](../../shared/README.md) — EntityCard, DataBlock, EntityStatus
- [composables/README.md](../../../composables/README.md) — useEntity, useEntityList
- [server/DATA_MODEL.md](../../../server/DATA_MODEL.md) — Project schema (`summary.queueCount`, `summary.totalArea`)
