# COMPONENT: Stores

Pinia stores for client state and API orchestration.

## Core Stores
- `batches.js`: Batch list/current batch, nesting actions, status polling.
- `artifacts.js`: Batch artifacts fetching and cache.
- `cassettes.js`, `toolProfiles.js`, etc.: Related feature stores.

## Conventions
- Stores use `$fetch` to call Nitro API endpoints.
- Long-running operations start optimistic UI updates and polling until terminal states.
