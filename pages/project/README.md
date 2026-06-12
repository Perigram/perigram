# COMPONENT: Project Workspace Routes

Routes under `pages/project/` render the authenticated project workspace.

## Route Structure

- `[slug].vue`: Parent project shell. Loads the project via `useEntity('project')`,
  renders compact `StandardPage` chrome, and owns the top-level page-header
  navigation. The shell does not render project status/data chrome above every
  workspace tab.
- `[slug]/queues.vue`: Active queue editor for creating queue entries, selecting
  warehouse stock, running nesting, and opening generated runs.
- `[slug]/sheet-designs.vue`: Project-level list of generated sheet designs.
  Resolves the project route id/slug first, then lists `sheet_design` entities
  by `projectId` through `useEntity('sheetDesign')`.
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
