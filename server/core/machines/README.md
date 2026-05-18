# COMPONENT: State Machine Engine & Aggregator - v24 Standardized

Centralized logic for governing entity lifecycles, enforcing business rules, and maintaining cross-entity data integrity (aggregations).

## Architecture
The system consists of three main parts: the transition engine, the dynamic hook registry, and the centralized aggregator.

### 1. State Machine Engine
- **`definitions.js`**: Compatibility export for CNC workflow definitions from `@cutkit/domain-cnc`.
- **`service.js`**: Orchestrates transitions, performs role/capability validation, updates entity snapshots (`status` block), and logs history to `status_events`.
- **Standardization**: Strictly uses `toFlexibleId()` for entity lookups and `pluralize()` for collection resolution.

The reusable workflow API is being extracted to
[`@cutkit/workflows`](../../../packages/workflows/README.md). The current
`service.js` is the runtime adapter and delegates transition validation to the
package while using CNC definitions from
[`@cutkit/domain-cnc`](../../../packages/domain-cnc/README.md), the app's
existing event log, and hook dispatch.

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

### 2. Dynamic Hook Registry (`hooks.js` & Feature Registry)
Acts as a decoupled dispatcher for side-effects. To prevent architectural leaks, manufacturing-specific logic is NOT implemented in the core engine.
- **Global Hooks (`hooks.js`)**: System-wide primitives (e.g., `propagateToChildren`, `triggerAggregator`).
- **Feature Hooks**: Feature services register their own hooks via `registerService` (e.g., `processPhysicalCut` in Queue service).
- **Resolution**: The Engine first checks `hooks.js`, then falls back to the Feature Service for the entity type.

### 3. Centralized Aggregator (`aggregator.js`)
Synchronizes parent summaries based on child activity using lineage-aware MongoDB aggregation pipelines.
- **Trigger**: Called by the `triggerAggregator` hook whenever an entity changes state.
- **Standardization**: Uses `pluralize()` to resolve target and parent collections.
- **Domain Rules**: Summary rules are loaded from `@cutkit/domain-cnc`; the
  aggregator remains the Mongo runtime adapter.

## Data Flow
1. User/System triggers `statusService.transition(type, id, state, ...)`.
2. Transition is validated against the domain workflow, role permissions, lifecycle schema, and actor/capability assignments.
3. Entity's `status` block, including `metadata` and `lifecycle`, is updated and a history event is logged.
4. **Hook Execution**: 
    - Engine looks up hook handler in `hooks.js`.
    - If not found, it queries the Feature Service for the entity.
    - Hook is executed asynchronously.
5. Parent's `summary` block is updated via `aggregator.js` (if `triggerAggregator` hook was called).

## Related
- [server/core/blocks/](../core/blocks/) (Standard Block classes)
- [server/utils/objectid.js](../utils/objectid.js) (Flexible ID handling)
- [server/utils/strings.js](../utils/strings.js) (Pluralization helper)
- [packages/workflows/README.md](../../../packages/workflows/README.md) (Framework workflow package)
