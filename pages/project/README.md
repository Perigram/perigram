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
  top action bar because the editor owns the production workspace. Queue
  creation controls render only when the active membership has `queues:create`
  access, matching the backend `queues:write` check. Empty states are centered
  inside the bounded workspace frame so the page preserves the same layout
  contract before and after queues exist.
- `[slug]/sheet-designs.vue`: Project-level list of generated sheet designs for
  selected queue revisions. It resolves project queues, reads each queue's
  `status.lifecycle.data.selectedRevisionId`, and loads designs with both queue
  and revision filters. The route
  uses `ActionToolbar`, a sticky `MetricPanel` summary rail from the normal
  desktop breakpoint, and `ResponsiveGrid` with `SheetDesignCard` so the page
  owns workflow context while the entity card owns the reusable sheet-design
  display contract.
- `[slug]/sheet-design/[sheetDesignId].vue`: Sheet-design detail route opened
  from sheet design cards and queue revision results.
- `[slug]/details.vue`: Project identity/status through `EntityPage`, a visible
  metric strip for queues, area, status, and creation date, access-aware facts
  through `EntitySurfaceContent` using the app `detail` surface, quick action
  buttons for queues/artifacts/refresh, and status history in the sidebar.
  Direct status changes reload the project through shared entity page/status
  events.
- `[slug]/data.vue`: Project inventory, logs, and material data. The route keeps
  the existing tabbed editing flows, places them beside a `MetricPanel` summary
  rail for loaded material/log state at normal desktop widths, and avoids
  nested `StandardPage` chrome inside the project shell.
- `[slug]/artifacts.vue`: Queue artifact browser. It renders an `ActionToolbar`,
  a sticky aggregate `MetricPanel` from the normal desktop breakpoint, and queue
  accordions whose headers expose summary tags before delegating row rendering
  to `ArtifactsTable`.

## Workflow Notes

Queues are the production entry point. A successful nesting revision creates
one `sheet_design` per equivalent layout and the required `sheet_instance`
copies. Only designs owned by the explicitly selected revision are visible in
the queue and project-level Sheet designs tab.

The project shell keeps `/sheet-designs` and `/sheet-design/:id` under the same
Sheet designs navigation area. Project status, rename, and audit history live
in the Details tab so the Queues tab opens directly on production content.
