# COMPONENT: Pages

Nuxt route components for public, authenticated, and admin surfaces.

## Public Entry

`index.vue` is the public landing page for anonymous visitors and the workspace
redirect gate for authenticated users.

- On mount, it calls `authStore.setUser()` to hydrate an existing session.
- Authenticated users with an active process go to their first compiled process
  screen. The process compiler prepends a generated `home` screen when the user
  has process-derived entity lists, so the default app entry becomes that
  access-composed start screen. Authenticated users without an active process
  use the static projects workspace.
- Anonymous visitors stay on the landing page, which embeds
  `CassetteMarketingAnimation` as the first-viewport visual and links to login
  and registration.

## Authenticated Areas

Authenticated route groups continue to use `layout: 'app'` and `middleware:
'auth'` locally in their page components.

`pages/screens/[screenKey].vue` is the generated operational screen route for
active organization processes. It looks up the current user's compiled screen
manifest from the auth store and renders it through the fixed generated screen
runtime, including the compiler-synthesized `home` template. Process navigation
points to `/screens/:screenKey`; the route does not load arbitrary Vue
components from process data. On mount and screen-key changes it refreshes
`/api/auth/me` before rendering, so generated screens use the current active
process screen/action manifest instead of stale client-side process
assignments.

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

Organization routes are first-class app areas. `/organization` is the
workspace hub linked from the user menu and profile organization cards;
`/organization/users` owns team management; `/organization/process` owns the
Vue Flow process designer. Breadcrumbs expose these routes as organization
siblings so users can move between overview, team management, and process
design without going through profile/admin pages. Team management assigns users
to active process roles; the process designer activation defines available
services, field policies, navigation, and lifecycle machines for the current
organization.

UI cleanup classifies components by route reachability plus architectural
registries (`utils/design-system.js`, `framework.manifest.json`,
`EntityInlineRef`, and framework tooling). Components that are dormant but
architecturally meaningful are not deleted during UI refactors.

## Related

- [admin pages](./admin/README.md)
- [organization pages](./organization/README.md)
- [marketing components](../components/marketing/README.md)
