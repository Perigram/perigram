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

Generated entity-detail breadcrumbs are hierarchy-aware. The navigation store
loads the current entity, walks domain containment relations through its
structured lineage, resolves each readable ancestor, and appends optional
revision refs before the current entity. It does not repeat the flat generated
screen list. Non-owning `relations` are intentionally excluded from ownership
breadcrumbs.

Project queue workspaces use a viewport-bounded main area so scrolling remains
inside queue lanes and panels rather than the page body.

On mobile, `app.vue` replaces the desktop header with a fixed bottom panel.
The panel contains home, up to two user-captured generated-screen shortcuts, a
generated-screen picker, chats, and a profile-menu button. The picker lists the
current user's generated screens except home/detail screens. The plus action is
shown only while zero or one shortcut exists. Long-pressing a shortcut opens a
context menu for that exact slot; the menu can replace the shortcut with another
generated screen or delete the shortcut.
Shortcuts are stored per user and organization in FIFO order. Chats render as
an embedded mobile tab inside the app layout instead of the desktop overlay, so
the chat close button is hidden there.
Profile is not a tab; it opens the same account menu used on desktop. Theme
switching lives in that account menu on both desktop and mobile.
The embedded chats tab and account routes (`/profile` and `/organization`) use
a flush mobile surface with only bottom safe-area spacing for the fixed nav;
desktop keeps the normal constrained page padding.
Mobile bottom-panel navigation dispatches the shared transient close event
before route changes so popovers, menus, and chat do not overlap the
destination.

The authenticated user menu links the current organization to `/organization`
and exposes team management and process designer actions from explicit
tenant-management grants via `authStore.hasTenantPermission()`. Generated
process screens control operational navigation only; they must not hide
organization management actions from admins or expose process design to ordinary
process roles.

## Related

- [stores](../stores/README.md)
- [project routes](../pages/project/README.md)
