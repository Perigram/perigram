# COMPONENT: Project UI Components

Vue components for displaying and interacting with `Project` entities.

## Files

| File | Purpose |
|---|---|
| `ProjectCard.vue` | Card display for a project entity — supports `card`, `compact`, `inline` variants via `EntityCard` chrome |
| `ProjectIndexCard.vue` | `/projects` route row override for project browsing and management |
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

## ProjectIndexCard

Props: `project` (Object, required), `renaming` (Boolean, default `false`).
Emits: `view`, `rename`, `delete`.

- Used only by `pages/projects/index.vue` so the project list can have a
  browsing-oriented row without changing the canonical `ProjectCard` used by
  relation refs and general entity surfaces.
- Renders `EntityCard` with trace hidden, the project thumbnail when present,
  access-aware `DataBlock` rows for address, queue count, and total area, and a
  footer with rename/open actions.
- Reads `/api/project` `summary.queuePreview` to show compact recent queue
  details in the row body: status, cassette item count, requested quantity, run
  count, generated sheet count, and selected stock count. This preview is
  attached by the project list API so cards do not fetch queues independently.
- Keeps delete in the shared status-action menu and uses the same click target
  guard as other entity cards so footer controls do not trigger card navigation.

## ProjectDetail

Props: `project` (Object, required). Emits: `add-queue`.

Fetches queues via `$fetch('/api/queues?lineage.projectId=...')` on mount and on `project._id` change.
Renders queues as `QueueCard` (compact variant) and shows a `StatusHistory` sidebar panel.

## Related
- [components/shared/README.md](../../shared/README.md) — EntityCard, DataBlock, EntityStatus
- [composables/README.md](../../../composables/README.md) — useEntity, useEntityList
- [server/DATA_MODEL.md](../../../server/DATA_MODEL.md) — Project schema (`summary.queueCount`, `summary.totalArea`)
