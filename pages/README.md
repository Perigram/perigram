# COMPONENT: Pages

Nuxt route components for public, authenticated, and admin surfaces.

## Public Entry

`index.vue` is the public landing page for anonymous visitors and the workspace
redirect gate for authenticated users.

- On mount, it calls `authStore.setUser()` to hydrate an existing session.
- Authenticated organization admins go to `/admin/organizations`,
  manufacturers go to `/warehouses`, and other users go to `/projects`.
- Anonymous visitors stay on the landing page, which embeds
  `CassetteMarketingAnimation` as the first-viewport visual and links to login
  and registration.

## Authenticated Areas

Authenticated route groups continue to use `layout: 'app'` and `middleware:
'auth'` locally in their page components.

Operational pages use shared UI shell primitives:

- `StandardPage` owns route title/action spacing and width; the `app` layout
  owns outer route padding and passes bounded flex height to full-height
  workspace routes.
- `ActionToolbar` owns section headers.
- `ResponsiveGrid` owns repeated card layouts.
- `StateBlock` owns loading/empty/error surfaces.
- `TableFrame` owns DataTable frames.

Asset child routes under `pages/assets/*.vue` are standalone Nuxt routes, not
nested children of `pages/assets/index.vue`; each routed asset page owns its own
`StandardPage` shell. `pages/assets/index.vue` is only the `/assets` redirect
surface and must not render tabs or `NuxtPage`.

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
shell to avoid nested detail headers.

Public auth/invitation pages may use full-height shells because they run
outside the app layout, but their content chrome should still come from
PrimeVue/shared primitives instead of raw bordered containers.

UI cleanup classifies components by route reachability plus architectural
registries (`utils/design-system.js`, `framework.manifest.json`,
`EntityInlineRef`, and framework tooling). Components that are dormant but
architecturally meaningful are not deleted during UI refactors.

## Related

- [admin pages](./admin/README.md)
- [marketing components](../components/marketing/README.md)
