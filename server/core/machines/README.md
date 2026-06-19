# COMPONENT: State Machine Engine & Aggregator - v24 Standardized

Centralized logic for governing entity lifecycles, enforcing business rules, and maintaining cross-entity data integrity (aggregations).

## Architecture
The system consists of three main parts: the transition engine, the dynamic hook registry, and the centralized aggregator.

### 1. State Machine Engine
- **`definitions.js`**: Compatibility export that resolves workflow definitions from the active app registry.
- **`service.js`**: Orchestrates transitions, performs lifecycle/capability validation, delegates access checks to `server/core/access/`, updates entity snapshots (`status` block), and logs history to `status_events`.
- **Workflow overrides**: Runtime transition/action paths resolve the target
  entity's organization-scoped active override from
  `server/features/workflow-overrides` before falling back to the registered
  domain workflow.
- **Standardization**: Strictly uses `toFlexibleId()` for entity lookups and
  resolves collections through the runtime/domain entity registry.

The reusable workflow API is being extracted to
[`@cutkit/workflows`](../../../packages/workflows/README.md). The current
`service.js` is the runtime adapter and delegates transition validation to the
package while using registered domain definitions, the app's existing event log,
and hook dispatch.

Workflow definitions are v2 region machines. Flat lifecycles are represented as
the `main` region; nested or parallel lifecycles add more regions under
`workflow.regions`. Entity `status.state` is a structured snapshot, not a
string:

```js
{
  schemaVersion: 2,
  primary: 'READY',
  active: { main: 'READY', qa: 'OPEN' },
  regions: {
    main: { state: 'READY', path: ['READY'] },
    qa: { state: 'OPEN', path: ['OPEN'] }
  }
}
```

Use `getPrimaryState(status)` for primary lifecycle reads and
`getRegionState(status, regionId)` for scoped reads. Primary-state indexes and
filters use `status.state.primary`.

`metadata` is transition-local context. Current lifecycle facts belong in
`status.lifecycle`, which is validated against each state's optional lifecycle
schema:

```js
status.lifecycle = {
  actors: [{ userId, capability, states }],
  attachments: { geometry, photos },
  data: {}
}
```

When a target state declares a lifecycle schema, existing lifecycle facts carry
forward and incoming lifecycle fields patch over them. States without a
lifecycle schema do not retain lifecycle facts.

### 2. Dynamic Hook Registry (`hooks.js` & App Registry)
Acts as a decoupled dispatcher for side-effects. To prevent architectural leaks, manufacturing-specific logic is NOT implemented in the core engine.
- **Global Hooks (`hooks.js`)**: System-wide primitives (e.g., `propagateToChildren`, `triggerAggregator`).
- **Feature Hooks**: Feature hook handlers are bound explicitly in `server/runtime/app-registry.js` or exported from the owning feature service.
- **Resolution**: The engine reads hook handlers from the active app registry, then falls back to feature-service hooks for transitional compatibility.
- **Typed Settings**: Hook handler ids and parameter fields are declared in
  the registered domain hook contracts. The engine validates required and
  unknown hook parameters before executing side effects, and admin editors render
  typed controls instead of raw params JSON.
- **Effects**: Hook results can return declared effects. The engine validates
  them and forwards them to the centralized effect runtime so hooks can request
  cross-entity changes without mutating sibling services directly.
- **Execution mode**: Hooks default to asynchronous `after` execution. A
  workflow hook can declare `phase: 'before'` for preflight validation or
  `mode: 'sync'` for side effects that must complete before
  `POST /api/status/transition` returns. Synchronous hook results are returned
  as transition `effects` so frontend stores can refresh related entities.

### 3. Centralized Aggregator (`aggregator.js`)
Synchronizes parent summaries based on child activity using lineage-aware MongoDB aggregation pipelines.
- **Trigger**: Called by the `triggerAggregator` hook whenever an entity changes state.
- **Standardization**: Uses runtime entity metadata to resolve target and parent collections.
- **Domain Rules**: Summary rules are loaded from the active app registry; the
  aggregator remains the Mongo runtime adapter.

### 4. HTTP Status API

Interactive UI status changes use the canonical status endpoints:

| Endpoint | Responsibility |
|---|---|
| `GET /api/status/actions?entityType=<type>&id=<id>` | Returns transitions authorized for the current user and entity, after running `before` hooks as availability preflight. |
| `POST /api/status/transition` | Executes a transition with full auth context and returns the updated entity, status, and refreshed actions. Optional `statusMeta.region` / `statusMeta.path` scopes a transition to a non-primary region. |

Entity-specific PATCH routes must not be the primary status API for standard
workflow transitions. Runtime callers that know the business meaning of a
transition should call `statusService.applyIntent(entityType, id, intent, auth,
metadata)` instead of naming a target state. Raw `statusService.transition(...)`
is retained for the status API/runtime adapter and focused tests.
Entity types without a registered workflow return an empty action list from the
actions endpoint; transitions for those types still remain invalid.
Action lookup runs only `phase: 'before'` hooks and does not write status events
or collect side effects. Business preflight failures hide the action, while
configuration errors still fail the endpoint so broken hook contracts are not
masked.

## Data Flow
1. User/System triggers `statusService.applyIntent(type, id, intent, ...)`,
   `statusService.transition(type, id, state, ...)` from the status runtime/API
   boundary, or `POST /api/status/transition`.
2. Transition is validated against the domain workflow, access requirements, lifecycle schema, and actor/capability assignments.
3. Entity's structured `status` block, including `metadata` and `lifecycle`, is updated and a history event is logged with `fromState`, `toState`, `fromStatePrimary`, `toStatePrimary`, and `region`.
4. **Hook Execution**:
    - Engine executes any `phase: 'before'` hooks before writing the new status.
    - It writes the event and entity status snapshot.
    - It executes `after` hooks; async hooks run in the background, while
      `mode: 'sync'` hooks are awaited and may return declared effects for the
      centralized effect runtime.
5. Parent's `summary` block is updated via `aggregator.js` (if `triggerAggregator` hook was called).

## Related
- [server/core/blocks/](../core/blocks/) (Standard Block classes)
- [server/utils/objectid.js](../utils/objectid.js) (Flexible ID handling)
- [server/runtime/README.md](../../runtime/README.md) (Entity registry helpers)
- [packages/workflows/README.md](../../../packages/workflows/README.md) (Framework workflow package)
- [server/core/effects/README.md](../effects/README.md) (Effect processor)
