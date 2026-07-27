# COMPONENT: Project UI Components

Vue components for displaying and interacting with `Project` entities.

## Files

| File | Purpose |
|---|---|
| `ProjectCard.vue` | Card display for a project entity — supports `card`, `compact`, `inline` variants via `EntityCard` chrome |
| `ProjectIndexCard.vue` | `/projects` workcard composed from `EntityCard`, thumbnail/visual area, app workspace surface facts, queue preview tiles, a metrics/action rail, and footer edit/delete actions |
| `ProjectDetail.vue` | Expanded detail view with queues list and summary sidebar |

## ProjectCard

Props: `project` (Object, required), `variant` (String, default `'card'`),
`renaming` (Boolean, default `false`).
Emits: `view`, `rename`, `delete`.

- Delegates chrome (TraceChain, IdentityBlock, EntityStatus) to `EntityCard`.
- Card body: `EntitySurfaceContent` using the app `workspace` surface from
  `utils/app-entity-surfaces.js`. That surface layers `data.address`,
  `summary.queueCount`, and `summary.totalArea` onto the core project display
  contract while preserving field-access filtering.
- Footer: `NameEditPopover` gated by `authStore.can('projects', 'edit')`
  for compact single-field project renames. The optional `renaming` prop drives
  the popover save loading state without coupling it to create dialogs.
- Delete is rendered in the project card footer so the shared status surface stays limited to lifecycle actions.

## ProjectIndexCard

Props: `project` (Object, required), `renaming` (Boolean, default `false`).
Emits: `view`, `rename`, `delete`.

- Used only by `pages/projects/index.vue` so the project list can combine
  canonical `EntityCard` chrome and app workspace facts with the project-list
  queue preview payload.
- Renders identity/status through `EntityCard`, a thumbnail or folder visual,
  project facts through `EntitySurfaceContent` with the app `workspace`
  surface, recent queue tiles in the body, a right-side metrics/open rail, and
  permission-gated rename/delete actions in the footer.
- Reads `/api/project` `summary.queuePreview` to show compact recent queue
  details in the row body: status, cassette item count, requested quantity, run
  count, generated sheet count, and selected stock count. This preview is
  attached by the project list API so cards do not fetch queues independently.
- Uses the same click target guard as other entity cards so footer controls do
  not trigger card navigation.

## ProjectDetail

Props: `project` (Object, required). Emits: `add-queue`.

Fetches queues via `$fetch('/api/queues?lineage.projectId=...')` on mount and on `project._id` change.
Renders queues as `QueueCard` (compact variant) and shows a `StatusHistory` sidebar panel.

## Related
- [components/shared/README.md](../../shared/README.md) — EntityCard, DataBlock, EntityStatus
- [components/generated/README.md](../../generated/README.md) — user-scoped operational project workspace
- [composables/README.md](../../../composables/README.md) — useEntity, useEntityList
- [server/DATA_MODEL.md](../../../server/DATA_MODEL.md) — Project schema (`summary.queueCount`, `summary.totalArea`)
