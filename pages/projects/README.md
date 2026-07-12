# COMPONENT: Projects Route

`index.vue` renders the authenticated project list at `/projects`.

## Behavior

- Uses `StandardPage` for page chrome and renders a dashboard-style project
  browser: summary metric tiles, a framed search/sort control strip, and
  full-width `ProjectIndexCard` workcards.
- Loads project DTOs from `useGlobalStore().getProjects()` and reads them via
  `projectsList`.
- Normalizes list items at the route boundary before search, sort, navigation,
  and card rendering. The shared entity card contract needs canonical
  `identity` and structured `status`; legacy/partial list DTOs may still carry
  flat `name`, `slug`, or status strings.
- Renders projects as full-width operational workcards. Each card reads
  `summary.queuePreview` from `/api/project` to show recent queue states,
  cassette counts, quantities, run counts, sheet counts, and selected stock
  counts without extra per-card queue fetches.
- Provides client-side search over project name/slug and client-side sorting by
  created date or name before rendering the card list.
- Creates projects through `useEntity('project').create({ name })`, then refreshes
  the global project list and navigates to the new project slug/uid.
- Renames projects through the `ProjectIndexCard` `rename` event and
  `useEntity('project', slug).update({ name })`; rename loading is tracked per
  project id so it does not affect the create dialog.
- Deletes projects through PrimeVue `ConfirmDialog` and
  `useEntity('project', slug).remove()`.

## Related

- [Project entity UI](../../components/entities/Project/README.md)
- [shared components](../../components/shared/README.md)
