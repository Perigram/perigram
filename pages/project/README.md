# COMPONENT: Project Workspace Routes

Routes under `pages/project/` render the authenticated project workspace.

## Route Structure

- `[slug].vue`: Parent project shell. Loads the project via `useEntity('project')`,
  keeps route content inside `StandardPage`, and lets the app navigation store
  resolve the project-level route context. The queues route disables
  `StandardPage` gap/overflow so the app layout can provide the bounded
  workspace frame.
- `[slug]/queues.vue`: Active queue editor for creating queue entries, selecting
  warehouse stock, running nesting, and opening generated runs. The route
  delegates workspace actions to `QueueEditor`; it does not render a separate
  top action bar. Queue creation controls render only when the active membership
  has `queues:create` access, matching the backend `queues:write` check. The app
  layout gives this route a viewport-bounded frame, and the route fills that
  area so scrolling stays inside workspace lanes/panels.
- `[slug]/sheet-designs.vue`: Project-level list of generated sheet designs for
  selected production runs. It resolves project queues, reads
  `queue.data.materialConsumption.runId`, loads sheet designs by queue, and
  keeps only designs whose `lineage.runId` matches the selected run.
- `[slug]/sheet-design/[sheetDesignId].vue`: Sheet-design detail route opened
  from sheet design cards and nesting run results.
- `[slug]/details.vue`: Project identity, access-aware project fields,
  interactive status, and status history.
- `[slug]/data.vue` and `[slug]/artifacts.vue`: Project data and artifact views.

## Workflow Notes

Queues are the production entry point. A completed nesting run creates one
`sheet_design` per physical worker layout; those designs are visible both inside
the queue run cards and from the project-level Sheet designs tab.

The project shell keeps `/sheet-designs` and `/sheet-design/:id` under the same
Sheet designs navigation area. Project status, rename, and audit history live
in the Details tab so the Queues tab opens directly on production content.
