# COMPONENT: Pages

Nuxt route components: the app's complete URL surface. Screen generation
belongs to the ui-mapping plane; workspace chrome to layouts.

Parent: [README.md](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Route inventory

| Route | Component | Shell | Contract |
|---|---|---|---|
| `/` | `index.vue` | public | landing for anonymous visitors; workspace redirect gate for authenticated sessions |
| `/auth/login` · `/auth/register` | `auth/` | public | credentials-only signup; invitation selected by `invitation` query |
| `/invitation/:token` | `invitation/[token].vue` | public | renders the sanitized invitation DTO; safe same-origin `redirect` query carries anonymous users through auth and back |
| `/terms-and-conditions` | `terms-and-conditions.vue` | public | terms content |
| `/home` | screens-route alias (`pages:extend` in `nuxt.config.js`) | app | home workspace shell route (`HOME_SCREEN_ROUTE`); the screens renderer's fallback resolves the key to the home screen |
| `/screens` · `/screens/:screenKey` | `screens/` | app | generated operational screens from the compiled manifest |
| `/chats` | `chats.vue` | app | full-page conversation inbox |
| `/organization` | `organization/index.vue` | app | generated organization overview screen; orgless and pending-only states |
| `/organization/billing` · `/organization/models` · `/organization/partners` · `/organization/plugins` · `/organization/process` · `/organization/users` | `organization/*.vue` | app | organization screens: billing, models, partners, plugin marketplace, process designer, team |
| `/test/ui-lab` · `/test/ui-mapping` | `test/` | `ui-lab-layout` | internal demo surfaces ([test/README.md](./test/README.md)) |

Authenticated route groups declare `layout: 'app'` and `middleware: 'auth'`
locally in their page components. Organization screens are documented in
[organization/README.md](./organization/README.md).

## Public entry

`index.vue` is the public landing page for anonymous visitors and the workspace
redirect gate for authenticated users.

- The landing shell renders immediately for anonymous visitors. Entry auth is
  resolved on the server when cookies are present, and client mount re-checks
  auth only to redirect authenticated sessions, so the public first paint
  stays free of a client-side `/api/auth/me` round trip.
- The landing presents the platform core in plain language — an authored
  process description turned into a running application — with copy under the
  `marketing.*` locale keys (see [i18n](../i18n/README.md)). Anonymous visitors
  stay on the landing page. Entry actions appear once per destination: the
  header carries the sign-in link, the hero the single registration call to
  action; duplicated button pairs for the same destination are a defect.
- Authenticated users without any organization membership land on
  `/organization`, which owns orgless onboarding (an inline
  organization-creation form; the account menu carries the same affordance).

`pages/auth/register.vue` collects the new user's credentials only and submits
them to `/api/auth/register`; users join organizations by invitation or create
their own from the organization page after signing in. Invitation signup is
selected by the `invitation` query parameter and shows the invitation note over
the identical form. Login and registration preserve a safe same-origin
`redirect` query, so `/invitation/:token` can send anonymous users through
auth and back to the invitation. Both auth pages render their state inline —
a loading button during submit, an inline error message on failure, a success
state on the register page, a redirecting state on the login page — because
the empty layout mounts no global Toast host.

The invitation token page renders only the sanitized invitation DTO returned
by its public endpoint. Its headerless bounded panel centers in the viewport,
presents invitation identity inside the content, maps missing/expired tokens
to localized user-facing copy, and keeps recovery navigation as a standard
PrimeVue button.

## Entry ladder and the home route

- Authenticated users with an organization go to the generated process entry
  route: the generated `home` screen first, then the first generated hub/list
  screen, then `/home` when no navigable generated screen exists. Available
  screens are defined entirely by the active process graph. Generated `home`
  may be synthesized from inferred operational list screens; organization
  system screens such as `/organization` stay outside the process entry
  candidates.
- Home serves at the stable shell route `/home` (`HOME_SCREEN_ROUTE` in the
  [process compiler's screen contract](../packages/processes/README.md)):
  home is the app's own shell with pages inside it, so the URL carries no
  screenKey vocabulary — the per-user `home_<userId>` key stays the manifest
  identity. `/home` is the screens route's alias; the screens renderer's
  fallback resolves the unresolvable key to the home screen, the app layout
  resolves `/home` to the manifest home screen for its workspace chrome
  (hidden desktop header, bounded viewport), and a stale `/screens/home*` URL
  replaces to `/home` so only one home surface renders.
- `resolveProcessEntryRoute`/`resolveDefaultHomeScreen` in
  `utils/process-navigation.js` end every ladder at `/home`, and a sourceless
  synthesized home screen (`defaultHomeScreen`) stands in whenever the
  compiled manifest carries no home — no active definition, a definition that
  fails to compile (auth hydration degrades that to "no active process"), or
  an org without navigable screens. Organization members always land on the
  home workspace, which renders every definition-independent surface (chats,
  calls, profile, organization switching) with no type sections; the compiled
  manifest only adds type sections.

## The screens route

`pages/screens/[screenKey].vue` is the generated operational screen route for
active organization processes. It looks up the current user's compiled screen
manifest from the auth store. A key that resolves to no manifest screen (and
no synthesizable detail pair) falls back to the home screen — the manifest's
compiled home when one exists, otherwise the default home contract above — so
a stale bookmark or a recompiled process renders the workspace.
`pages/screens/index.vue` redirects `/screens` to `/home`.

- Routed list screens keep the route title strip: `StandardPage` titles
  the page and carries the routed-surface back control (`usePageBack`,
  one shared `{ icon, label, command }` shape, following in-app history
  with the home entry ladder as the deep-link fallback) — the page passes
  every collection region carries its own title bar and
  renders count and controls alone. Detail and form
  surfaces own their headers: the record header renders the type label
  and back affordance once, through its own anatomy and navigation
  channel.
- Process screens arrive in the compiled UI contract vocabulary
  (`typeList`/`instanceDetail`/`home` plus `typeId`) and render through the
  UI generator (`composeScreen` +
  [components/ui-mapping](../components/ui-mapping/README.md)) with the
  client bundle and projected action contract carried by auth hydration. The
  per-type state display policy and authored machine edges ride the same
  hydration payload; their derivation is canonical in
  [shared/ui-mapping](../shared/ui-mapping/README.md).
- The instances store ([stores](../stores/README.md)) loads the referenced
  collections (row-slot mapping, lineage/reference normalization, per-source
  data states loading/ready/empty/denied/error that `composeScreen` folds
  into the region tree); action runs dispatch to the process run API through
  the same store, and per-card quick actions run with the card instance as
  the target entity.
- Runtime state transitions are the page's other dispatch channel: the opened
  detail instance's machine-legal transitions arrive from
  `/api/state/actions` as `{ __runtime, state: { to }, intent, region }`
  records (refetched whenever the detail instance or its flat state changes —
  the machine's legal edges depend on the current state), render as the
  header's transition buttons, and dispatch through the state transition API
  with the updated entity landing straight in the shared instance cache.
- `GeneratedScreenHost` is the shape boundary between the store's keyed
  pool (`{ type -> { id -> instance }}`) and the generator's grouped-array
  instances prop; `buildInstancePool` re-keys that prop back to the keyed
  pool inside the engine.
- Collection identities are link buttons: `onOpen` routes to the
  compiler-paired detail screen (`auto_<type>_detail`) with the instance id
  in the route scope, silently staying put when the user manifest carries no
  paired detail screen; when the manifest carries the list screen but lacks
  its pair, the route synthesizes the detail in the same projected vocabulary
  so it still renders through the generator.
- Every compiled screen — generator templates and the home overload alike —
  renders through `GeneratedScreenHost`; organization system screens render
  their fixed components on their own routes, and a system-screen key on the
  screens route replaces to the screen's route (see
  [components/generated/README.md](../components/generated/README.md)).
- Process navigation addresses `/screens/:screenKey`; component choice is
  resolver output ([shared/ui-mapping](../shared/ui-mapping/README.md)).
- The auth middleware is the sole hydration boundary: generated routes render
  the hydrated manifest directly, and a route-level re-fetch of
  `/api/auth/me` unmounts an already-rendered operational workspace.

Operational pages use shared UI shell primitives:

- `StandardPage` owns route title/action spacing and width; the `app` layout
  owns outer route padding and passes bounded flex height to full-height
  workspace routes. `StandardPage` renders the routed-surface back control
  (`back` prop, the `usePageBack` shape) beside its title; pane-hosted
  surfaces switch through their tab strip and carry Back in the hosted
  page header.
- `ActionToolbar` owns section headers.
- `ResponsiveGrid` owns repeated card layouts.
- `StateBlock` owns loading/empty/error surfaces.
- `TableFrame` owns DataTable frames.

Page-local filter bars and nested panels use `bg-content` or `bg-subtle`;
raw PrimeVue palette utilities such as `bg-surface-50` drift in dark mode
app chrome.

## Directory detail in the workspace

User and organization detail lives inside the generated home workspace.
`DirectoryDetailSurface.vue`
([components/directory](../components/directory/README.md)) renders as an
entity-bound workspace-page pane tab on desktop (registered beside the
editor pages in the workspace-page registry) and as the bounded dialog the
home workspace opens on mobile viewports. Both load the directory card
from `GET /api/directory/:type/:id` (name-level, caller-relative flags)
plus the grant-redacted DTO from the ordinary feature detail endpoint,
which may be empty when the caller holds no grant.

Entry points all route through the shared workspace-open seam
(`openInstanceInWorkspace`): the open action in user/org inline-ref
popovers, membership rows inside the surface, and partner rows on the
partners management page. Directory search lives in its contextual homes:
user search in the chats new-chat picker (beside the organization-scoped
list, direct-thread reach only) and in the team-management invite dialog
(beside the by-link invitation); organization search on
`/organization/partners`. The surface owns its action row (user chat /
invite / self profile; organization overview entry, context switch,
partnership lifecycle) because panes and dialogs have no page-level action
chrome; navigation goes to the sanctioned management destinations
(`/organization*` and the account settings popup).

## Organization routes

Organization routes are first-class app areas.
[pages/organization/README.md](./organization/README.md) covers billing,
models, partners, plugins, team, and process-design ownership. Breadcrumbs
expose these routes as organization siblings so users move between overview,
team management, and process design freely. Vue Flow renders client-side
because its generated accessibility ids are unstable across SSR hydration.

The user menu is the account surface: organization switching, organization
creation, and the profile settings popup (avatar, language, notifications);
organization capabilities remain on the organization routes, and the
directory's self-profile action opens the same popup. Its avatar section
uploads/removes the current user's avatar through the user avatar API;
every avatar image uses a square cover crop inside its circular frame. The
settings popup is one sectioned surface (identity, preferences,
invitations, memberships). Organization
memberships render as inline `Menu` entries in the settings popup's
organizations section: every entry opens the organization's in-home pane,
the active membership carries the success check, and the create entry opens
organization creation.

Targeted invitations addressed to the account render through the shared
`TargetedInvitations` surface: above the memberships section of the account
settings popup and on the orgless organization shell. Accepting completes
the single-handshake membership (see
[invitations](../server/features/invitations/README.md)) and re-hydrates
auth so the new membership appears immediately. The `/organization` route
also carries the pending-member state: an account whose memberships are all
pending (link invitations join that way) has no tenant screens, so the route
renders the awaiting-approval message, and `/invitation/:token` re-hydrates
auth before navigating there.

## Chats

`/chats` is the authenticated full-page conversation inbox. Desktop keeps the
conversation list and selected thread in a two-pane bounded workspace; mobile
uses a single-pane list/thread flow. The desktop-only app-shell floating chat
launcher opens the same inbox as a compact drawer, whose expand control
navigates here; the launcher stays hidden on `/chats` itself. Mobile entry
points navigate by tab: the app-shell bottom chats tab routes here like any
other tab, and deep links such as status-history actor chat arrive with the
target thread preset. The full route passes its layout mode explicitly,
keeps independent inbox/thread headers, and fills the bounded app workspace
even when there are no persisted conversations. Selecting a persisted thread
starts its SSE message stream on either the drawer or the embedded route;
stream connection follows the selected thread alone.

## Related

- [organization pages](./organization/README.md)
- [test and demo pages](./test/README.md)
