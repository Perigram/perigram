# COMPONENT: Layouts

Nuxt layout shells for public and authenticated app surfaces.

Parent: [root README](../README.md).

## Core Files

- `app.vue`: Authenticated workspace chrome with desktop sticky header, mobile
  bottom navigation, route breadcrumbs, theme toggle, user/profile entry,
  support entry, and bounded workspace sizing for production workspace routes.
- `ui-lab-layout.vue`: standalone shell with its own header (title,
  test-mode badge, theme toggle through `useThemeMode`) for the UI lab
  ([pages/test](../pages/test/README.md)).
- The layout mounts the shared `OfflineOutboxBadge` for authenticated users:
  a floating indicator that appears when the browser is offline, a mutation is
  queued in the outbox, or a replay failed. It is the single sync-state
  surface for offline mutations (see the root README PWA section).
- The layout owns the app-level overlay hosts, one instance each:
  `<ConfirmDialog />` (default group — feature surfaces call `useConfirm`
  without a group; a second host renders the same require twice),
  `<Toast />` (every `toast.add()` on app surfaces renders here — a page
  mounting its own host duplicates every toast), and
  `<ProfileSettingsDialog />` (the profile settings popup, opened through
  the shared `useProfileDialog` state by every `UserAccountMenu` instance
  and by record surfaces — the account menu itself is mounted three
  times: desktop header, mobile bar, home sidebar footer).
- The desktop header is hidden on the generated home screen: that route's
  Discord-style workspace overload owns the full viewport and mounts brand,
  communication entries (chats open the shared bottom-right popup and the
  LiveKit channel block), navigation, and user controls in its own sidebar. The
  layout resolves the active screen with the same home fallback as the
  screens route (`resolveDefaultHomeScreen`, see
  [pages/README.md](../pages/README.md)), so the synthesized default home
  hides the header and bounds the viewport exactly like a compiled home;
  the bottom bar's home tab navigates the entry ladder
  (`resolveProcessEntryRoute`) and always routes to a screen destination.
  The floating desktop chat launcher is hidden on that route because chats
  are a main-panel tab there. The header's user control
  is the shared `UserAccountMenu` component on every other route, and the
  mobile bottom panel renders the same component for its profile button.

The desktop home link renders `/public/logo-light.svg` in light mode and
`/public/logo-dark.svg` in dark mode. Both variants keep the link accessible
with `Perigram` alt text and use the layout's existing `dark-mode` theme class.

## Navigation Behavior

`app.vue` resolves breadcrumbs through `stores/navigation.js`. Each breadcrumb
renders its current label as the route link and, when sibling routes exist, an
icon-only PrimeVue `Menu` trigger next to that label: the preceding breadcrumb
link owns the selected item's text, so the trigger stays icon-only. Trigger visibility is based on alternatives after removing the
current route, so one real alternative still produces a chooser while a
current-only sibling list does not.
Organization routes have an explicit hierarchy: the active organization's
canonical name is the first breadcrumb and billing, team, or process is the
second. Those sections are siblings beneath the organization; removing the
organization crumb is not a valid simplification.

Generated screens with a registered screen
overload use a viewport-bounded main area so scrolling remains inside their
lanes and panels rather than the page body. Generated overload workspaces are
flush to the app content boundary and do not inherit ordinary route padding or
maximum width. The layout resolves this from the current user's screen manifest
and the generated overload registry.

A record page whose type carries an editor binding is a workspace page: it
uses the bounded main area so the editor's dock measures and fills the
viewport. An `ownsChrome` surface owns the page chrome as well — the desktop
header stays off and the route drops its padding; the editor's file panel and
the record's Back control are that page's chrome.

On mobile, `app.vue` replaces the desktop header with a fixed bottom panel of
PrimeVue tabs: one tab per stationed type screen (the home sidebar tree's top
level through `useMobileHomeTabs`, selection shared with the home workspace's
mobile branch), a home fallback tab when the process stations no type screens,
the chats tab (which opens the bounded `/chats` route and carries the total
unread badge), and the profile-menu button.
The profile button opens the same account menu used on desktop; theme
switching lives in that account menu on both desktop and mobile.
`/chats` and account routes (`/organization` and
its children) use
a flush mobile surface with only bottom safe-area spacing for the fixed nav;
desktop keeps the normal constrained page padding.
Mobile bottom-panel navigation dispatches the shared transient close event
before route changes so popovers, menus, and chat do not overlap the
destination. A routed generated screen keeps its owning type tab selected
in the bottom bar: the manifest resolves the route's screen key (synthesized
detail keys included) to its type, so opening a record never leaves the bar
without a selected tab.

The authenticated user control opens a PrimeVue popover and always renders the organization section when at
least one membership is available. That section contains organization entries only and resolves names from
canonical organization identity. Billing, team management, and process design
remain children of `/organization`; administrative organization functions are
not duplicated elsewhere in the account popover. Every entry — popover and
the profile settings popup's Organizations section alike — opens the
organization's in-home pane (the directory surface; see
[components/directory](../components/directory/README.md)); context
switching stays in that pane's own member actions. Organization creation lives in the
profile settings popup (its Organizations section: all memberships, one
pane-open entry each, create entry); an orgless account
creates its first organization there or from the overview's orgless shell. The
floating desktop chat launcher is hidden on `/chats` because the full inbox is
already present. The launcher is viewport-anchored (`fixed bottom-8
right-8`, desktop-only) through its plain wrapper element: PrimeVue's own
`.p-button` rules load
after Tailwind and win at equal specificity, so `fixed` and explicit
sizing on the component silently degrade to `position: relative` and the
button drifts into the document flow. Every floating surface in the shell
(the incoming-call stack, the offline outbox badge, the call window, the
now-playing media dock) anchors the same way, with the launcher between the outbox badge and the
call surfaces in the stacking order. The now-playing dock
([components/media](../components/media/README.md)) is the persistent
host for media and parked calls that outlive their source surface: a
floating card top-right on desktop and a lane pinned to the top of the
screen on mobile. The call window doubles as the
navigation-proof call host: the shell seats a connected session with no
mounted surface there automatically
(see [components/calls](../components/calls/README.md)), beside the
app-level `CallAudioRenderer` that keeps remote call audio playing
across every surface move.

## Related

- [stores](../stores/README.md)
