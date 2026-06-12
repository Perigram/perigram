# COMPONENT: Projects Route

`index.vue` renders the authenticated project list at `/projects`.

## Behavior

- Uses `StandardPage` for page chrome and `ProjectIndexCard` for each project
  list tile. `ProjectIndexCard` is a route-specific override; the canonical
  `ProjectCard` remains available for generic entity and relation surfaces.
- Loads project DTOs from `useGlobalStore().getProjects()` and reads them via
  `projectsList`.
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
