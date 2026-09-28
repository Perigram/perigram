# COMPONENT: Pages

Nuxt route components for public, authenticated, and admin surfaces.

## Public Entry

`index.vue` is the public landing page for anonymous visitors and the workspace
redirect gate for authenticated users.

- The landing shell renders immediately for anonymous visitors. Entry auth is
  resolved on the server when cookies are present, and client mount re-checks
  auth only to redirect authenticated sessions. The public first paint must not
  block on a client-side `/api/auth/me` round trip.
- Authenticated users with an organization go to the generated process entry
  route: the generated `home` screen first, then the first generated hub/list
  screen, then the default home route `/screens/home` when no navigable
  generated screen exists. The entry route must not fall back to static domain
  routes such as `/projects` while a process is active, because available
  screens are defined entirely by the active process graph. Generated `home`
  may be synthesized from inferred operational list screens, but organization
  system screens such as `/organization` are still not process entry
  candidates.
- The home screen is the default screen (canonical contract):
  `resolveProcessEntryRoute`/`resolveDefaultHomeScreen` in
  `utils/process-navigation.js` end every ladder at `/screens/home`, and a
  sourceless synthesized home screen (`defaultHomeScreen`) stands in whenever
  the compiled manifest carries no home — no active definition, a definition
  that no longer compiles (auth hydration degrades that to "no active
  process"), or an org without navigable screens. Organization members
  therefore always land on the home workspace, which renders every
  definition-independent surface (chats, calls, profile, organization
  switching) with no type sections; the compiled manifest only adds type
  sections. Orgless accounts keep landing on `/profile`.
- The landing presents the platform core in plain language — an authored
  process description turned into a running application — with copy under the
  `marketing.*` locale keys (see [i18n](../i18n/README.md)). Anonymous visitors
  stay on the landing page. Entry actions are placed once, by destination: the
  header carries the sign-in link for returning users, and the hero carries the
  single registration call to action; duplicated button pairs for the same
  destinations are a defect.
- Authenticated users without any organization membership land on `/profile`,
  where organization creation lives; the landing is not a dead end for
  orgless accounts.

## Directory Surfaces (in-home)

User and organization detail has **no standalone routes**: entity detail
lives inside the generated home workspace. `DirectoryDetailSurface.vue`
([components/directory](../components/directory/README.md)) renders as an
entity-bound workspace-page pane tab on desktop (registered beside the
editor pages in the workspace-page registry) and as the bounded dialog the
home workspace opens on mobile viewports. Both load the directory card
from `GET /api/directory/:type/:id` (name-level, caller-relative flags)
plus the grant-redacted DTO from the ordinary feature detail endpoint,
which may be empty when the caller holds no grant.

Entry points all route through the shared workspace-open seam
(`openInstanceInWorkspace`): the app-shell global search results, the open
action in user/org inline-ref popovers, membership rows inside the
surface, and partner rows on the partners management page. The surface
owns its action row (user chat / invite / self profile; organization
overview entry, context switch, partnership lifecycle) because panes and
dialogs have no page-level action chrome; only sanctioned management
routes (`/profile`, `/organization*`) ever receive navigation.

## Authenticated Areas

Authenticated route groups continue to use `layout: 'app'` and `middleware:
'auth'` locally in their page components.

`pages/screens/[screenKey].vue` is the generated operational screen route for
active organization processes. It looks up the current user's compiled screen
manifest from the auth store. A key that resolves to no manifest screen (and
no synthesizable detail pair) falls back to the home screen — the manifest's
compiled home when one exists, otherwise the default home contract above —
so the route never dead-ends on an error surface: a stale bookmark or a
recompiled process renders the workspace instead of a "screen unavailable"
page. `pages/screens/index.vue` redirects `/screens` to `/screens/home` for
the same reason. Process screens arrive in the compiled UI
contract vocabulary (`typeList`/`instanceDetail`/`home` plus `typeId`) and
render through the UI generator (`composeScreen` +
[components/ui-mapping](../components/ui-mapping/README.md)) with the client
bundle and projected action contract carried by auth hydration; the
contract also carries the per-type state display policy and the authored
machine edges (`statePolicyByType` / `stateTransitionsByType` over the
hydration payload's compiled producer workflows — the flat state
vocabulary's one client-side source, see
[shared/ui-mapping](../shared/ui-mapping/README.md)). The
instances store (`stores/instances.js`) loads the referenced collections
(row-slot mapping, lineage/reference normalization, per-source data states
loading/ready/empty/denied/error that `composeScreen` folds into the region
tree), and action runs dispatch to the process run API through the same
store. Runtime state transitions are the page's other dispatch channel:
the opened detail instance's machine-legal transitions arrive from
`/api/state/actions` as `{ __runtime, state: { to }, intent, region }`
records (refetched whenever the detail instance or its flat state
changes — the machine's legal edges depend on the current state), render
as the header's transition buttons, and dispatch through the state
transition API with the updated entity landing straight in the shared
instance cache. The page is the shape boundary between the store's keyed
pool (`{ type -> { id -> instance }}`) and the generator's grouped-array
instances prop (`buildInstancePool` re-keys it). Collection identities are
link buttons: `onOpen` routes to the
compiler-paired detail screen (`auto_<type>_detail`) with the instance id
in the route scope, silently staying put when the user manifest carries no
paired detail screen; when the manifest carries the list screen but not its
pair, the route synthesizes the detail in the same projected vocabulary so
it still renders through the generator. Per-card quick actions run through
the same store
with the card instance as the target entity. System
screens (organization overview/account era templates) keep the legacy fixed
renderer until they migrate, including the compiler-synthesized `home`
screen's Discord-style workspace overload (see
[components/generated/README.md](../components/generated/README.md)). Process
navigation points to `/screens/:screenKey`; the route does not load arbitrary
Vue components from process data. The auth middleware is the sole hydration
boundary: generated routes must render the hydrated manifest directly and not
re-fetch `/api/auth/me` on mount or screen-key changes, because replacing that
manifest unmounts an already-rendered operational workspace.

Operational pages use shared UI shell primitives:

- `StandardPage` owns route title/action spacing and width; the `app` layout
  owns outer route padding and passes bounded flex height to full-height
  workspace routes.
- `ActionToolbar` owns section headers.
- `ResponsiveGrid` owns repeated card layouts.
- `StateBlock` owns loading/empty/error surfaces.
- `TableFrame` owns DataTable frames.

Page-local filter bars and nested panels should use `bg-content` or
`bg-subtle`; raw PrimeVue palette utilities such as `bg-surface-50` are not
stable enough for dark mode app chrome.

Entity-heavy pages should render facts through the entity display constructor
instead of page-local field arrays when the surface is reusable. App-specific
surface extensions live in `utils/app-instance-surfaces.js`; current production
uses include project workspace rows, project detail facts, and selected
warehouse inventory context.

Asset child routes under `pages/assets/*.vue` are standalone Nuxt routes, not
nested children of `pages/assets/index.vue`; each routed asset page owns its own
`StandardPage` shell. `pages/assets/index.vue` is only the `/assets` redirect
surface and must not render tabs or `NuxtPage`. Asset list routes expose
route-level inventory metrics in a `MetricPanel` rail beside reusable entity
cards at normal desktop widths; the cards remain responsible for the entity
display contract and ownership actions.

Library-style routes such as `/catalog` and `/requisitions` load their DTOs at
the route boundary, render loading/empty state through shared primitives, and
pass the resolved collections into hub components. Route-level metric surfaces
use `MetricPanel` to describe the current collection beside the hub tabs at the
normal desktop breakpoint; hub tabs remain the reusable implementation surface
for list actions and cards.

`pages/geometry-captures/index.vue` is the authenticated review workspace for
photo-derived geometry. Its creation flow is camera/upload first: mode-specific
inputs infer calibration, route/default warehouse or project context is applied
without an explicit selector, remnant captures use only known dimensions plus an
existing or newly created material, and selected photos can receive an optional
hand-drawn outer contour prompt before upload. The resulting `geometry_capture`
queues model-first extraction before photo-backed review, manual revision
editing, and confirmation.

Nested project child list/workflow routes under `pages/project/[slug]/` render
inside the project entity page shell. They use section primitives such as
`ActionToolbar`, `StateBlock`, and `TableFrame`; they should not wrap their
content in another `StandardPage`. Entity detail children that already own an
`InstancePage`, such as queue and sheet-design details, render outside the project
shell to avoid nested detail headers. The project shell may redirect to
`/projects` on a 403 project-context fetch; denied access should not surface as
an uncaught route promise.

Public auth/invitation pages may use full-height shells because they run
outside the app layout, but their content chrome should still come from
PrimeVue/shared primitives instead of raw bordered containers.
The invitation token page renders only the sanitized invitation DTO returned by
its public endpoint; it does not fetch the protected organization record. Its
headerless bounded panel centers in the viewport, presents invitation identity
inside the content, maps missing/expired tokens to localized user-facing copy,
and keeps recovery navigation as a standard PrimeVue button. Raw request paths
and server error strings are not rendered.
`pages/auth/register.vue` is a public signup form. Signup collects the
new user's credentials only and submits them to `/api/auth/register`;
organizations are never created during registration — users join by
invitation or create their own from the profile page after signing in.
Invitation signup is selected by the `invitation` query parameter and shows
the invitation note, but the form itself is identical. Login and registration preserve
a safe same-origin `redirect` query, so `/invitation/:token` can send anonymous
users through auth and back to the invitation without asking the inviter for an
email address. The register page must not list or create organizations through
authenticated entity APIs. Both auth pages render their state inline — a
loading button during submit, an inline error message on failure, a success
state on the register page, and a redirecting state on the login page —
because the empty layout mounts no global Toast host.

Asset management routes under `pages/assets/` consume canonical v24 DTOs. Pen
template screens must read `identity.name` for labels and `data.stroke` for
rendered style; legacy flat `name` / `stroke` fields are compatibility only.
Library lineage links in process mode resolve through generated entity-detail
screens, not through a static asset route. Do not route library trace links to
the cassette manager; cassettes are children of the library, not the library
entity surface itself.

Organization routes are first-class app areas. `/organization`,
`/organization/users`, and `/organization/process` routing, billing, team, and
process ownership are covered in
[pages/organization/README.md](./organization/README.md); `/organization/partners`
owns partnership management. The overview is not a
grid of navigation cards. Vue Flow renders client-side because its generated
accessibility ids are not stable across SSR hydration. Breadcrumbs expose these
routes as organization siblings so users can move between overview, team
management, and process design without going through profile/admin pages. The
user menu is only the active-organization switcher; organization capabilities
remain on these organization routes. Profile remains a personal
account/preferences/membership page and must not show project usage or
user-owned credit purchase flows.
Its account surface uploads/removes the current user's avatar through the user
avatar API; every avatar image uses a square cover crop inside its circular
frame. Account, preferences, and membership views use semantic navigation links
backed by the route's `tab` query. Each tab performs real navigation so browser
history, reloads, and direct membership links retain the selected view.
Organization memberships render canonical `OrganizationCard` surfaces
with visible footer actions: inactive memberships switch context, while the
active membership has one direct action into the generated organization
overview. Billing, team, and process navigation stays inside that overview.
Targeted invitations addressed to the account render above the memberships
grid with accept/decline actions; accepting completes the single-handshake
membership (see
[invitations](../server/features/invitations/README.md)) and re-hydrates
auth so the new membership appears immediately.

`/chats` is the authenticated full-page conversation inbox. Desktop keeps the
conversation list and selected thread in a two-pane bounded workspace; mobile
uses a single-pane list/thread flow. The desktop-only app-shell floating chat
launcher opens the same inbox as a compact drawer, whose expand control
navigates here; the launcher is absent on `/chats` itself. Mobile entry points
never float: the app-shell bottom chats tab navigates to this route like any
other tab, and deep links such as status-history actor chat navigate here with
the target thread preset. The full
route passes its layout mode
explicitly, keeps independent inbox/thread headers, and fills the bounded app
workspace even when there are no persisted conversations. Selecting a persisted
thread starts its SSE message stream on either the drawer or embedded route;
stream connection is not conditional on the floating-dialog state.

UI cleanup classifies components by route reachability plus architectural
registries (`utils/design-system.js`, `framework.manifest.json`,
`InstanceInlineRef`, and framework tooling). Components that are dormant but
architecturally meaningful are not deleted during UI refactors.

## Related

- [organization pages](./organization/README.md)
