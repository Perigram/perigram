# COMPONENT: Layouts

Nuxt layout shells for public and authenticated app surfaces.

## Core Files

- `app.vue`: Authenticated workspace chrome with desktop sticky header, mobile
  bottom navigation, route breadcrumbs, theme toggle, user/profile entry,
  support entry, and bounded workspace sizing for `/project/:slug/queues`.

## Navigation Behavior

`app.vue` resolves breadcrumbs through `stores/navigation.js`. Each breadcrumb
renders its current label as the route link and, when sibling routes exist, an
icon-only PrimeVue `Menu` trigger next to that label. The sibling trigger must
not render the selected item label because the preceding breadcrumb link already
owns that text.

Project queue workspaces use a viewport-bounded main area so scrolling remains
inside queue lanes and panels rather than the page body.

On mobile, `app.vue` replaces the desktop header with a fixed bottom panel.
The panel contains home, up to two user-captured generated-screen shortcuts,
add-current-generated-screen, chats, and profile actions. The add action is
enabled only on `/screens/:screenKey` routes, stores shortcuts per user and
organization in FIFO order, and keeps only the two newest entries. Mobile
bottom-panel navigation dispatches the shared transient close event before
route changes so popovers, menus, and chat do not overlap the destination.

The authenticated user menu links the current organization to `/organization`
and exposes team management and process designer actions from explicit
tenant-management grants via `authStore.hasTenantPermission()`. Generated
process screens control operational navigation only; they must not hide
organization management actions from admins or expose process design to ordinary
process roles.

## Related

- [stores](../stores/README.md)
- [project routes](../pages/project/README.md)
