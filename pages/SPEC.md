```yaml
doc_id: PAGES-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Pages — the route map

Nuxt route components: the app's complete URL surface. This SPEC owns the
route inventory and the routing laws; screen generation belongs to the
ui-mapping plane and workspace chrome to layouts.

Parents: [README.md](../README.md) · [SPEC.md](../SPEC.md) ·
[pages/README.md](./README.md)

## Contracts owned here

### Route inventory

| Route | Component | Shell | Contract |
|---|---|---|---|
| `/` | `index.vue` | public | landing for anonymous visitors; workspace redirect gate for authenticated sessions |
| `/auth/login` · `/auth/register` | `auth/` | public | credentials-only signup; invitation selected by `invitation` query |
| `/invitation/:token` | `invitation/[token].vue` | public | renders the sanitized invitation DTO; safe same-origin `redirect` query carries anonymous users through auth and back |
| `/terms-and-conditions` | `terms-and-conditions.vue` | public | terms content |
| `/home` | screens-route alias | app | home workspace shell route (`HOME_SCREEN_ROUTE`; the screens renderer's fallback resolves the key to the home screen) |
| `/screens` · `/screens/:screenKey` | `screens/` | app | generated operational screens from the compiled manifest |
| `/chats` | `chats.vue` | app | full-page conversation inbox |
| `/organization` | `organization/index.vue` | app | generated organization overview screen; orgless and pending-only states |
| `/organization/billing` · `/models` · `/partners` · `/plugins` · `/process` · `/graphs` · `/users` | `organization/*.vue` | app | organization screens: billing, models, partners, plugins, process designer, graph documents, team |
| `/test/ui-lab` · `/test/ui-mapping` | `test/` | `ui-lab-layout` | internal demo surfaces |

### Routing laws

- **Entry ladder.** Every authenticated account lands on the generated
  `home` screen, else the first generated hub/list screen, else `/home`; a
  sourceless synthesized `defaultHomeScreen` stands in whenever the
  manifest carries no home. Orgless accounts enter the same ladder;
  memberships all pending render the awaiting-approval state. Available
  screens are defined entirely by the active process graph.
- **System-screen keys replace to their own routes.** A system-screen key
  on the screens route redirects to the screen's route; organization
  system screens render their fixed components on `/organization*`.
- **Record popups expand to pages.** One explicit expand control steps a
  record popup up to its page surface; mobile record opens route to the
  compiled detail screen.
- **The screens route resolves every key.** An unresolvable key renders
  the home screen; `/screens` redirects to `/home`; a stale
  `/screens/home*` URL replaces to `/home`.
- **Back affordance.** `usePageBack` supplies one `{ icon, label, command }`
  shape, delivered through the record header's navigation channel on
  detail screens; generator templates render with no route title strip
  (list headings render through the engine's region headers); deep links
  fall back to the home entry ladder.
- **One hydration boundary.** The auth middleware hydrates the manifest;
  generated routes render it directly, and a route-level re-fetch of
  `/api/auth/me` unmounts a live workspace.
- **Shape boundary.** The screens page re-keys the instances store's
  `{ type → { id → instance } }` pool into the generator's grouped-array
  instances (`buildInstancePool`).
- **Runtime transitions.** The opened detail instance's machine-legal
  transitions arrive from `/api/state/actions`, refetched on instance or
  state change, and dispatch through the state transition API.
- **Detail pairing.** Collection identities link to the compiler-paired
  detail screen (`auto_<type>_detail`) with the instance id in the route
  scope; a manifest list screen carrying no pair synthesizes the detail in
  the same projected vocabulary.
- **Entity detail lives in the workspace.** `DirectoryDetailSurface`
  renders as a workspace-page pane tab on desktop and a bounded dialog on
  mobile; entry points route through `openInstanceInWorkspace`; account
  and organization management stay on the account settings popup and
  `/organization*`.
- **Dual-hosted management surfaces.** Organization pages are standalone
  routes (mobile, deep links, back control) and registered home workspace
  pages (pane tabs); cross-navigation between them goes through the
  page-open seam.
- **Landing.** The public first paint resolves entry auth server-side;
  entry actions appear once per destination (header sign-in, hero
  registration).
- **Signup creates credentials only.** Accounts use the home workspace
  without an organization. Organization creation, switching, and leaving
  live in account settings; invitations join organizations.
- **Shell primitives.** Routed surfaces use `StandardPage`,
  `ActionToolbar`, `ResponsiveGrid`, `StateBlock`, `TableFrame`; local
  chrome uses `bg-content`/`bg-subtle`.
- **Test surfaces.** `ui-lab` renders the design-system manifest
  (`utils/design-system.js`) with per-primitive feedback persistence;
  `ui-mapping` renders generated screens over
  synthetic compiler output (seeded random world or `?source=real`) with
  the spacing-coefficient slider and the seeded data-states matrix — every
  rendered surface is resolver output.

## Structure

One directory per route family: `auth/`, `invitation/`, `organization/`,
`screens/`, `test/`, plus `chats.vue`, `index.vue`,
`terms-and-conditions.vue`. Organization screens are documented in
[organization/README.md](./organization/README.md); demo surfaces in
[test/README.md](./test/README.md).

## Laws

- Generated screens speak the compiled UI contract vocabulary and render
  through the generator — [shared/ui-mapping](../shared/ui-mapping/README.md)
  composes, [components/ui-mapping](../components/ui-mapping/README.md)
  materializes; process data reaches components through resolvers only.
- Manifest hydration and the instance pool contract:
  [stores/README.md](../stores/README.md); workspace chrome and route-shell
  modes: [layouts/README.md](../layouts/README.md); the auth gate:
  [middleware/README.md](../middleware/README.md); the home pane/page
  registry and popup laws:
  [components/generated/README.md](../components/generated/README.md).
- Marketing copy rides the `marketing.*` locale keys
  ([i18n/README.md](../i18n/README.md)).
- Vue Flow renders client-side: its generated accessibility ids are
  unstable across SSR hydration.

## End state

The README route inventory equals the live route table; every routing law
above reads once, in this folder's READMEs.
