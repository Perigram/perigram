# COMPONENT: State Machine Engine & Aggregator - v24 Standardized

Centralized logic for governing entity lifecycles, enforcing business rules, and maintaining cross-entity data integrity (aggregations).

## Architecture
The system consists of three main parts: the transition engine, the dynamic hook registry, and the centralized aggregator.

### 1. State Machine Engine
- **`definitions.js`**: Compatibility export that resolves workflow definitions from the active app registry.
- **`service.js`**: Orchestrates transitions, performs lifecycle/capability validation, delegates access checks to `server/core/access/`, updates entity snapshots (`status` block), and logs history to `status_events`.
- **Standardization**: Strictly uses `toFlexibleId()` for entity lookups and
  resolves collections through the runtime/domain entity registry.

The reusable workflow API is being extracted to
[`@cutkit/workflows`](../../../packages/workflows/README.md). The current
`service.js` is the runtime adapter and delegates transition validation to the
package while using registered domain definitions, the app's existing event log,
and hook dispatch.

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
- **Feature Hooks**: Feature hook handlers are bound explicitly in `server/runtime/app-registry.js`.
- **Resolution**: The engine reads hook handlers from the active app registry, then falls back to feature-service hooks for transitional compatibility.
- **Typed Settings**: Hook handler ids and parameter fields are declared in
  the registered domain hook contracts. The engine validates required and
  unknown hook parameters before executing side effects, and admin editors render
  typed controls instead of raw params JSON.

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
| `GET /api/status/actions?entityType=<type>&id=<id>` | Returns transitions authorized for the current user and entity. |
| `POST /api/status/transition` | Executes a transition with full auth context and returns the updated entity, status, and refreshed actions. |

Entity-specific PATCH routes must not be the primary status API for standard
workflow transitions.
Entity types without a registered workflow return an empty action list from the
actions endpoint; transitions for those types still remain invalid.

## Data Flow
1. User/System triggers `statusService.transition(type, id, state, ...)` or
   `POST /api/status/transition`.
2. Transition is validated against the domain workflow, access requirements, lifecycle schema, and actor/capability assignments.
3. Entity's `status` block, including `metadata` and `lifecycle`, is updated and a history event is logged.
4. **Hook Execution**: 
    - Engine looks up hook handler in `hooks.js`.
    - If not found, it queries the Feature Service for the entity.
    - Hook is executed asynchronously.
5. Parent's `summary` block is updated via `aggregator.js` (if `triggerAggregator` hook was called).

## Related
- [server/core/blocks/](../core/blocks/) (Standard Block classes)
- [server/utils/objectid.js](../utils/objectid.js) (Flexible ID handling)
- [server/runtime/README.md](../../runtime/README.md) (Entity registry helpers)
- [packages/workflows/README.md](../../../packages/workflows/README.md) (Framework workflow package)
