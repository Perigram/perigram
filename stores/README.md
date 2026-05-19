# COMPONENT: Stores

Pinia stores for client state and API orchestration.

## Core Stores
- `entities.js`: Universal entity registry and cache for all system entity types. `fetchEntity(type, id)` fetches from the appropriate API endpoint and caches in `registry[type][id]`. Used by TraceChain for lineage name resolution. Supports: organization, project, queue, warehouse, requisition, batch, cassetteInstance, and others.
- `batches.js`: Batch list/current batch, nesting actions, status polling.
- `artifacts.js`: Batch artifacts fetching and cache.
- `cassettes.js`, `toolProfiles.js`, etc.: Related feature stores.

## Conventions
- Stores use `$fetch` to call Nitro API endpoints.
- `auth.js` accepts optional `$fetch` options in `setUser()` and
  `fetchUserOrgs()` so route middleware can forward SSR request cookies during
  direct page loads.
- Long-running operations start optimistic UI updates and polling until terminal states.
- Internal demo pages may pre-seed `entities.registry` with DTO-shaped mock entities so shared trace components render examples without calling authenticated APIs.
