# COMPONENT: Project UI Components

Vue components for displaying and interacting with `Project` entities.

## Files

| File | Purpose |
|---|---|
| `ProjectCard.vue` | Card display for a project entity — supports `card`, `compact`, `inline` variants via `EntityCard` chrome |
| `ProjectDetail.vue` | Expanded detail view with queues list and summary sidebar |

## ProjectCard

Props: `project` (Object, required), `variant` (String, default `'card'`),
`renaming` (Boolean, default `false`).
Emits: `view`, `rename`, `delete`.

- Delegates chrome (TraceChain, IdentityBlock, EntityStatus) to `EntityCard`.
- Card header: optional `data.thumbnailUrl` image when a project DTO provides one.
- Card body: `DataBlock` with `summary.queueCount` — populated by the centralized aggregator (`server/core/machines/aggregator.js`) when queues are created — plus optional `data.address` text.
- Footer: `NameEditPopover` gated by `authStore.can('projects', 'edit')`
  for compact single-field project renames. The optional `renaming` prop drives
  the popover save loading state without coupling it to create dialogs.
- Delete is passed to `EntityCard` as a `statusActions` menu action so destructive commands stay in the shared status/action surface.

## ProjectDetail

Props: `project` (Object, required). Emits: `add-queue`.

Fetches queues via `$fetch('/api/queues?lineage.projectId=...')` on mount and on `project._id` change.
Renders queues as `QueueCard` (compact variant) and shows a `StatusHistory` sidebar panel.

## Related
- [components/shared/README.md](../../shared/README.md) — EntityCard, DataBlock, EntityStatus
- [composables/README.md](../../../composables/README.md) — useEntity, useEntityList
- [server/DATA_MODEL.md](../../../server/DATA_MODEL.md) — Project schema (`summary.queueCount`, `summary.totalArea`)
