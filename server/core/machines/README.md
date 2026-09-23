# COMPONENT: State Machine Engine & Aggregator - v24 Standardized

Governs entity lifecycles and maintains cross-entity data integrity (aggregations).

## Architecture
The system consists of three main parts: the transition engine, the dynamic hook registry, and the centralized aggregator.

### 1. State Machine Engine
- **`definitions.js`**: Compatibility export that resolves workflow definitions from the active app registry.
- **`service.js`**: Orchestrates transitions, performs lifecycle/capability validation, delegates access checks to `server/core/access/`, updates entity snapshots (`status` block), and logs history to `status_events`.
- **Workflow overrides**: Runtime transition/action paths resolve the target
  entity's organization-scoped active override from
  `server/features/workflow-overrides` before falling back to the registered
  domain workflow.
- **Process workflows**: When the target organization has an active process
  definition, compiled process workflows resolve before workflow overrides.
  Process lifecycle profiles and action-only graph status changes are
  normalized v2 machines and drive real entity status, action lookup, lifecycle
  validation, hooks, and audit events.
  Runtime resolution keeps domain-owned system intent transitions available
  when a process workflow overrides an entity lifecycle. Service-owned flows
  such as `nesting_run` solver completion still need their hidden
  `NESTING -> COMPLETE` / `NESTING -> ERROR` intents even when the user-facing
  process adds custom statuses. If a process-authored state does not declare a
  domain system intent, workflow composition adds a hidden self-transition for
  that intent. This lets internal events such as `artifactFileStored` complete
  and enter status history without replacing the process-owned state or
  invalidating status-scoped grants.
  Process-authored user transitions are authorized by their compiled
  `processRoleIds`. Status-scoped entity grants produced by the target status
  node describe access after the transition and must not be required on the
  source-state entity before the transition can run.
  Process actions that target the entity's current primary state are not
  returned from the status action API; no-op current-state buttons belong in
  neither generated process actions nor `InstanceState`.
- **Standardization**: Strictly uses `toFlexibleId()` for entity lookups and
  resolves collections through the runtime/domain entity registry, falling
  back to the per-class instance collections for CTS-native types that never
  enter the static registry. Instance documents are read through a status
  view projected from `states.main` and written back to `states.main` —
  the legacy `status` block is never written onto them.

The reusable workflow API is being extracted to
[`@perigram/workflows`](../../../packages/workflows/README.md). The current
`service.js` is the runtime adapter and delegates transition validation to the
package while using registered domain definitions, the app's existing event log,
and hook dispatch.

Workflow definitions are v2 region machines. Flat lifecycles are represented as
the `main` region; nested or parallel lifecycles add more regions under
`workflow.regions`. Entity `status.state` is a structured snapshot, not a
string; the canonical snapshot shape and workflow definition examples live in
[`@perigram/workflows`](../../../packages/workflows/README.md).

Use `getPrimaryState(status)` for primary lifecycle reads and
`getRegionState(status, regionId)` for scoped reads. Primary-state indexes and
filters use `states.main`.

`metadata` is transition-local context. Current lifecycle facts belong in
`status.lifecycle`, which is validated against each state's optional lifecycle
schema:

```js
status.lifecycle = {
  actors: [{ userId, capability, states }],
  attachments: { geometry, photos },
  data: { snapshots: {} }
}
```

When a target state declares a lifecycle schema, existing lifecycle facts carry
forward and incoming lifecycle fields patch over them. States without a
lifecycle schema do not retain lifecycle facts.
Lifecycle schemas may require transition descriptions, proof attachment slots,
and named relation snapshots. Descriptions are stored in `status.metadata.note`.
Uploaded proof files are persisted on the entity `attachments` block and
referenced from `status.lifecycle.attachments`, so the current entity owns file
metadata while `status_events.status.lifecycle` preserves which file proved the
transition. Snapshot declarations are generic: a state can name a target entity
type and lineage key, such as `cassette_design` by `queueId`; the status
runtime captures readable entity refs/counts into
`status.lifecycle.data.snapshots` during the transition.

### 2. Dynamic Hook Registry (`hooks.js` & App Registry)
Acts as a decoupled dispatcher for side-effects. Manufacturing-specific logic is NOT implemented in the core engine.
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
  `POST /api/state/transition` returns. Synchronous hook results are returned
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
| `GET /api/state/actions?typeId=<type>&id=<id>` | Returns transitions authorized for the current user and entity, after running `before` hooks as availability preflight. It also includes compiled manual process status-mutating `updateEntity` actions from the current role assignment when their entity type and source status match the target entity. |
| `POST /api/state/transition` | Executes a transition with full auth context and returns the updated entity, status, and refreshed actions. Optional `stateMeta.region` / `stateMeta.path` scopes a transition to a non-primary region. `stateMeta.metadata.note` carries the operator description, and `stateMeta.lifecycle.attachments` carries uploaded proof refs for schema-declared slots. |

Entity-specific PATCH routes must not be the primary status API for standard
workflow transitions. Runtime callers that know the business meaning of a
transition should call `stateService.applyIntent(typeId, id, intent, auth,
metadata)` instead of naming a target state. Raw `stateService.transition(...)`
is retained for the status API/runtime adapter and focused tests.
Process create actions use
`stateService.setInitialStateForOrganization(type, id, state, organizationId,
actor, metadata)` after the entity service creates the record. This helper is
creation-only: it validates that the target state exists in the active process
workflow, writes the entity status snapshot and history event, and does not run
transition validation from the feature service default state.
Status writes merge process workflow-state display metadata (`label`, `color`,
`severity`, and `icon`) into `status.metadata.display`. Caller-provided display
fields win, but missing severity/icon/color are backfilled from the resolved
workflow state so generated screens and shared entity cards render the actual
process-authored status badge instead of falling back to the global unknown
status style.
Process Change Status effects pass authored region/path scope plus metadata and
lifecycle evidence through this same transition boundary and return its updated
entity DTO. Archive effects use the compiled domain archive intent when one is
declared, otherwise the `ARCHIVED` target state; hard deletion does not pass
through the status engine.
Persisted entity status metadata never identifies an authored process graph:
the write boundary strips `producerOutputId` (used only to resolve the
producer-scoped workflow) before creating the status snapshot, and migration
scripts must not write process/run/action/node/workflow identifiers into
`status.metadata`. Caller-declared invocation context (`source`, e.g. the
process action runtime's `{ kind: 'process-run', actionId }`) is treated the
same way: lifted onto the status event record, stripped from persisted
`status.metadata`. Existing documents that still carry such provenance are
cleaned by `migrate-strip-status-process-provenance.js` (see
[scripts/README.md](../../scripts/README.md)); append-only `status_events`
history is intentionally left untouched.
Entity types without a registered workflow return an empty action list from the
actions endpoint; transitions for those types still remain invalid.
Action lookup runs only `phase: 'before'` hooks and does not write status events
or collect side effects. Business preflight failures hide the action, while
configuration errors still fail the endpoint so broken hook contracts are not
masked.

## Data Flow
1. User/System triggers `stateService.applyIntent(type, id, intent, ...)`,
   `stateService.transition(type, id, state, ...)` from the status runtime/API
   boundary, or `POST /api/state/transition`.
2. Transition is validated against the domain workflow, access requirements, lifecycle schema, and actor/capability assignments.
3. Entity's structured `status` block, including `metadata` and `lifecycle`, is updated and a history event is logged with `fromState`, `toState`, `fromStatePrimary`, `toStatePrimary`, and `region`, plus the first-class stamp fields: `actor` (who, from the auth context), `operation` (initialize/transition/intent with region and intent), and `evidence` (normalized description, attachment refs, and lifecycle, including snapshots). The canonical event record contract lives in
   [server/features/states/README.md](../../features/states/README.md).
   When a status mutation also carries an entity patch, the service requires a
   Mongo transaction for the status event plus entity snapshot. Standalone
   Mongo deployments that reject transactions fail the combined mutation
   without falling back to partial ordered writes.
4. **Hook Execution**:
    - Engine executes any `phase: 'before'` hooks before writing the new status.
    - It writes the event and entity status snapshot.
    - It executes `after` hooks; async hooks run in the background, while
      `mode: 'sync'` hooks are awaited and may return declared effects for the
      centralized effect runtime.
5. Parent's `summary` block is updated via `aggregator.js` (if `triggerAggregator` hook was called).

## Related
- [server/core/blocks/](../blocks/) (Standard Block classes)
- [server/utils/objectid.js](../../utils/objectid.js) (Flexible ID handling)
- [server/runtime/README.md](../../runtime/README.md) (Entity registry helpers)
- [packages/workflows/README.md](../../../packages/workflows/README.md) (Framework workflow package)
- [server/core/effects/README.md](../effects/README.md) (Effect processor)
