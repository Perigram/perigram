# COMPONENT: Pages

Nuxt route components for public, authenticated, and admin surfaces.

## Public Entry

`index.vue` is the public landing page for anonymous visitors and the workspace
redirect gate for authenticated users.

- The landing shell renders immediately for anonymous visitors. Entry auth is
  resolved on the server when cookies are present, and client mount re-checks
  auth only to redirect authenticated sessions. The public first paint must not
  block on a client-side `/api/auth/me` round trip.
- Authenticated users with an active process go to the generated process entry
  route: the generated `home` screen first, then the first generated hub/list
  screen, then `/screens` only when no navigable generated screen exists. The
  entry route must not fall back to static domain routes such as `/projects`
  while a process is active, because available screens are defined entirely by
  the active process graph. Generated `home` may be synthesized from inferred
  operational list screens, but organization system screens such as
  `/organization` are still not process entry candidates.
  Authenticated users without an active process use
  the static projects workspace.
- Anonymous visitors stay on the landing page, which links to login
  and registration.

## Authenticated Areas

Authenticated route groups continue to use `layout: 'app'` and `middleware:
'auth'` locally in their page components.

`pages/screens/[screenKey].vue` is the generated operational screen route for
active organization processes. It looks up the current user's compiled screen
manifest from the auth store and renders it through the fixed generated screen
runtime, including the compiler-synthesized `home` screen, whose template is
overloaded into the Discord-style home workspace shell (sidebar navigation
plus the tab/split pane area; see
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
surface extensions live in `utils/app-entity-surfaces.js`; current production
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
`EntityPage`, such as queue and sheet-design details, render outside the project
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
`pages/auth/register.vue` is a public signup form. Normal signup collects the
new user's credentials plus organization name and starter process and submits them to
`/api/auth/register`; invitation signup is selected by the `invitation` query
parameter and collects only account credentials. Login and registration preserve
a safe same-origin `redirect` query, so `/invitation/:token` can send anonymous
users through auth and back to the invitation without asking the inviter for an
email address. The register page must not list or create organizations through
authenticated entity APIs.

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
[pages/organization/README.md](./organization/README.md). The overview is not a
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

`/chats` is the authenticated full-page conversation inbox. Desktop keeps the
conversation list and selected thread in a two-pane bounded workspace; mobile
uses a single-pane list/thread flow. The app shell's floating chat launcher
opens the same inbox as a compact drawer, whose expand control navigates here;
the launcher is absent on `/chats` itself. The full route passes its layout mode
explicitly, keeps independent inbox/thread headers, and fills the bounded app
workspace even when there are no persisted conversations. Selecting a persisted
thread starts its SSE message stream on either the drawer or embedded route;
stream connection is not conditional on the floating-dialog state.

UI cleanup classifies components by route reachability plus architectural
registries (`utils/design-system.js`, `framework.manifest.json`,
`EntityInlineRef`, and framework tooling). Components that are dormant but
architecturally meaningful are not deleted during UI refactors.

## Related

- [organization pages](./organization/README.md)
