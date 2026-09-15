# COMPONENT: Layouts

Nuxt layout shells for public and authenticated app surfaces.

## Core Files

- `app.vue`: Authenticated workspace chrome with desktop sticky header, mobile
  bottom navigation, route breadcrumbs, theme toggle, user/profile entry,
  support entry, and bounded workspace sizing for production workspace routes.
- The layout mounts the shared `OfflineOutboxBadge` for authenticated users:
  a floating indicator that appears when the browser is offline, a mutation is
  queued in the outbox, or a replay failed. It is the single sync-state
  surface for offline mutations (see the root README PWA section).
- The desktop header is hidden on the generated home screen: that route's
  Discord-style workspace overload owns the full viewport and mounts brand,
  communication entries (chats as a workspace page tab and the LiveKit
  channel block), navigation, and user controls in its own sidebar. The
  floating desktop chat launcher is hidden on that route because chats are a
  main-panel tab there. The header's user control
  is the shared `UserAccountMenu` component on every other route, and the
  mobile bottom panel renders the same component for its profile button.

The desktop home link renders `/public/logo-light.svg` in light mode and
`/public/logo-dark.svg` in dark mode. Both variants keep the link accessible
with `CutKit` alt text and use the layout's existing `dark-mode` theme class.

## Navigation Behavior

`app.vue` resolves breadcrumbs through `stores/navigation.js`. Each breadcrumb
renders its current label as the route link and, when sibling routes exist, an
icon-only PrimeVue `Menu` trigger next to that label. The sibling trigger must
not render the selected item label because the preceding breadcrumb link already
owns that text. Trigger visibility is based on alternatives after removing the
current route, so one real alternative still produces a chooser while a
current-only sibling list does not.
Organization routes have an explicit hierarchy: the active organization's
canonical name is the first breadcrumb and billing, team, or process is the
second. Those sections are siblings beneath the organization; removing the
organization crumb is not a valid simplification.

Project queue workspaces and generated screens with a registered screen
overload use a viewport-bounded main area so scrolling remains inside their
lanes and panels rather than the page body. Generated overload workspaces are
flush to the app content boundary and do not inherit ordinary route padding or
maximum width. The layout resolves this from the current user's screen manifest
and the generated overload registry instead of hardcoding screen ids.

The authenticated layout provides the active process `statusWorkflows` from
the auth store to shared entity surfaces. This keeps card, page, inline-ref,
and picker status presentation aligned with the organization lifecycle contract.

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
The embedded chats tab, `/chats`, and account routes (`/profile` and `/organization`) use
a flush mobile surface with only bottom safe-area spacing for the fixed nav;
desktop keeps the normal constrained page padding.
Mobile bottom-panel navigation dispatches the shared transient close event
before route changes so popovers, menus, and chat do not overlap the
destination.

The authenticated user control opens a PrimeVue popover and always renders the organization section when at
least one membership is available. That section contains organization switching only and resolves names from
canonical organization identity. Billing, team management, and process design
remain children of `/organization`; administrative organization functions are
not duplicated elsewhere in the account popover. Clicking the active
organization opens its overview, while clicking another membership switches
context before opening that overview. The
floating desktop chat launcher is hidden on `/chats` because the full inbox is
already present.

## Related

- [stores](../stores/README.md)
