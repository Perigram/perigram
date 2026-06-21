# COMPONENT: Layouts

Nuxt layout shells for public and authenticated app surfaces.

## Core Files

- `app.vue`: Authenticated workspace chrome with sticky header, route
  breadcrumbs, theme toggle, user menu, support entry, and bounded workspace
  sizing for `/project/:slug/queues`.

## Navigation Behavior

`app.vue` resolves breadcrumbs through `stores/navigation.js`. Each breadcrumb
renders its current label as the route link and, when sibling routes exist, an
icon-only PrimeVue `Menu` trigger next to that label. The sibling trigger must
not render the selected item label because the preceding breadcrumb link already
owns that text.

Project queue workspaces use a viewport-bounded main area so scrolling remains
inside queue lanes and panels rather than the page body.

The authenticated user menu links the current organization to `/organization`
and exposes team management and process designer actions when the active grants
allow them. It should not reduce the organization area to disabled status text.

## Related

- [stores](../stores/README.md)
- [project routes](../pages/project/README.md)
