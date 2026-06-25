# COMPONENT: Stores

Pinia stores for client state and API orchestration.

## Core Stores
- `entities.js`: Universal entity registry and cache for all system entity types. `fetchEntity(type, id, force?, options?)` fetches from the appropriate API endpoint and caches in `registry[type][id]`; `options.silent` suppresses expected protected lookup errors. Used by TraceChain for lineage name resolution. Supports: organization, project, queue, warehouse, requisition, batch, cassetteInstance, and others.
- `layerStandards.js`: Loads the canonical layer-standard catalogue. Lookups use
  `standard.data.code` / `standard.data.category` with root-field fallbacks only
  for migration compatibility, and pen overrides update `data.orgPenId`.
- `penTemplates.js`: Loads system and user pen DTOs. System/user grouping is
  based on `pen.lineage.userId`; stroke rendering data lives under
  `pen.data.stroke`.
- `batches.js`: Batch list/current batch, nesting actions, status polling.
- `artifacts.js`: Batch artifacts fetching and cache.
- `cassettes.js`, `toolProfiles.js`, etc.: Related feature stores.

## Conventions
- Stores use `$fetch` to call Nitro API endpoints.
- `auth.js` accepts optional `$fetch` options in `setUser()` and
  `fetchUserOrgs()` so route middleware can forward SSR request cookies during
  direct page loads. `setUser()` owns organization hydration; app layouts should
  not re-fetch organizations after a successful auth hydration. Runtime app
  access comes from `activePermissions`, which prefers the active process
  compiled permissions. Tenant-management chrome can also check
  `tenantPermissions` through `hasTenantPermission()`, which reads explicit
  active membership grants for organization/team/process management recovery.
- `navigation.js` owns project breadcrumb context. SSR callers must pass request
  headers through `fetchProjectContext(slug, fetchOptions)` so protected project
  lookups use the same session cookie as auth middleware. Breadcrumb sibling
  options normalize canonical DTO labels before passing them to PrimeVue Select.
  When auth includes an active process, hubs and breadcrumbs are built only from
  the compiled process screen manifest plus the active permission evaluator, so
  a user's app menu follows their compiled process assignment and scoped
  bindings. Generated `/screens/:screenKey` breadcrumbs use
  `utils/generated-labels.js` so raw process labels and entity ids are translated
  the same way as generated screen headers. Generated breadcrumb hub matching is
  exact for `/screens/:screenKey` routes, so a home screen does not duplicate
  itself as both hub and current screen and detail screens do not match a hub by
  string prefix. Static hub/tab lists are used only when no active process is
  present. Organization management breadcrumbs are not generated operational
  screens; they use `hasTenantPermission()` so admins can still reach team
  management and process design while ordinary process roles only see their
  compiled screens.
  Project routes include a store-resolved section breadcrumb for queues, sheet
  designs, data, artifacts, and details.
  Admin pages use a store-owned sibling list that includes workbench,
  workflow overrides, users, ConfigBot, and support. Admin workbench breadcrumbs also
  receive route query so `/admin?section=...` can expose
  Designer/Entities/Context/Commands as navigation siblings.
- `workbenchFixtures.js` owns the admin workbench fixture context. Manual
  entities and command/task outputs are upserted into the same context used for
  typed entity options; seeding preserves that context instead of regenerating
  fixtures and dropping manual entries. Preview status transitions update this
  context locally so draft/manual entities do not call the persisted status API.
- Long-running operations start optimistic UI updates and polling until
  terminal states. Queue nesting completion is emitted as an event object
  (`{ queueId, completedAt }`) rather than a bare queue id so repeated runs for
  the same queue still trigger component watchers and related entity refetches.
  Queue nesting polling reads lifecycle state through `getPrimaryState()` so it
  works for both legacy string statuses and v2 process/status-machine blocks.
  Fetched queue runs are sorted by `data.runNumber` before being written into
  the store so UI selectors can treat the last run as the newest run.
  Generated process queue actions that run `solveNesting` must start the same
  queue polling path as `/api/queue/:id/nest`; otherwise the UI will keep the
  freshly-created run snapshot and miss the asynchronous task completion update.
  Process-authored run statuses can be applied before the async nesting worker
  writes `data.results` and `data.sheetDesignIds`, so polling treats the latest
  run as active until it has solver output, even when its primary status is no
  longer the domain `NESTING` state. Older empty historical runs are ignored
  when a newer run already has results.
- Internal demo pages may pre-seed `entities.registry` with DTO-shaped mock entities so shared trace components render examples without calling authenticated APIs.
