# COMPONENT: Projects Route

`index.vue` renders the authenticated project list at `/projects`.

## Behavior

- Uses `StandardPage` for page chrome, `ResponsiveGrid` for list layout, and
  `ProjectIndexCard` for each project row. `ProjectIndexCard` now composes
  `EntityCard` and `EntitySurfaceContent` with the app `workspace` surface, so
  project list facts follow the same constructor contract as generic project
  cards.
- Loads project DTOs from `useGlobalStore().getProjects()` and reads them via
  `projectsList`.
- Normalizes list items at the route boundary before search, sort, navigation,
  and card rendering. The shared entity card contract needs canonical
  `identity` and structured `status`; legacy/partial list DTOs may still carry
  flat `name`, `slug`, or status strings.
- Renders projects through the shared responsive grid. Each row reads
  `summary.queuePreview` from `/api/project` to show recent queue states,
  cassette counts, quantities, run counts, sheet counts, and selected stock
  counts without extra per-card queue fetches.
- Provides client-side search over project name/slug and client-side sorting by
  created date or name before passing projects to `DataView`.
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
