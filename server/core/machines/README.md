# COMPONENT: State Machine Engine - v24 Standardized

Governs entity lifecycles: transition validation, status snapshots, and
status-event history.

## Architecture
The engine is `service.js` plus the hook dispatch contract. Machines are
graph-derived (SPEC §7) — this module never defines machines itself.

### 1. State Machine Engine
- **`service.js`**: Orchestrates transitions, performs lifecycle/capability validation, delegates access checks to `server/core/access/`, updates entity snapshots (`status` block), and logs history to `status_events`.
- **Machine resolution**: For an organization, the engine resolves the target
  type's machine from `server/features/workflow-overrides` in order: the
  producer-scoped compiled process workflow (when the caller names a producer
  output), any compiled producer output emitting the type, then the
  organization's stored override row. Without an organization or when none of
  those exist there is deliberately no machine: creation through the status
  runtime fails loudly (`No state machine defined for entity type`), because
  no static workflow table remains — an org that wants a lifecycle authors it
  in the process designer.
- **Process workflows**: the compiled machine is the vocabulary (SPEC §7): its states come from the
  process's state records, its initial from the creating construct's state
  socket, and transitions from authored transition nodes. There is no
  declaration-derived machine and no system-transition composition: an org
  process that wants a system flow declares its states and transitions
  itself.
  A compiled transition may carry a `guard` — a boolean expression AST
  over `{ value }`, the operated instance's row (a §3 instance's flat
  `fields`; a legacy block doc's merged `data`/`specs`). The engine
  re-evaluates it atomically at commit against the loaded instance and
  refuses the transition (409) when it no longer holds; the actions
  listing omits guard-failing edges (an evaluation error hides the
  action — execution still surfaces it loudly). Intent availability
  (`assertIntentAvailable`) does not guard-filter: named-intent callers
  receive the commit-time refusal.
  A compiled transition may instead be a deadline edge (`deadline: true`
  with system-only access): declared on the state record (SPEC §7),
  executable only by the system actor, and driven by the deadline
  scanner — never a user action. A transition declared by an
  event-wired process action compiles its edge as process-owned
  (`processOwned: true`): availability (`GET /api/state/actions`, the
  ui-mapping legal-move contract) keeps it out of every manual surface,
  while the transition boundary executes it for the orchestration.
  Every flat state write stamps `stateChangedAt` (the §3 entered-state
  clock, SPEC §3/§7): creation through the instance boundary and every
  status transition. The deadline scanner
  ([server/features/process-definitions](../../features/process-definitions/README.md))
  sweeps the organizations' active compiled machines on an interval
  (`DEADLINE_SCAN_INTERVAL_MS`, default 60s, disabled at `0`) and moves
  overdue instances through this engine's transition boundary as SYSTEM
  with `source: { kind: 'deadline' }` — stamps, guards, lifecycle
  validation, and hooks unchanged.
  Process-authored user transitions are authorized by their compiled
  `processRoleIds`. Status-scoped entity grants produced by the target status
  node describe access after the transition and must not be required on the
  source-state entity before the transition can run.
  The compiled machine is the authority for `GET /api/state/actions` and for
  transition execution: the instance's current state is resolved to its
  canonical nested path, and a compiled manual process action surfaces and
  executes only when the machine declares the exact state-to-state edge.
  A manifest action that the machine dropped — a no-op into the state the
  instance already occupies — is neither offered nor executable.
  Process actions that target the entity's current primary state are not
  returned from the status action API; no-op current-state buttons belong in
  neither generated process actions nor `InstanceState`.
- **Standardization**: Strictly uses `toFlexibleId()` for entity lookups and
  resolves collections through the runtime/domain entity registry, falling
  back to the per-class instance collections for CTS-native types that never
  enter the static registry. The write world follows the document (SPEC §3):
  a typed instance document persists one flat `state` string (the engine
  projects it into the machine view internally); a legacy status-block
  document keeps its block. Evidence, lifecycle facts, and display metadata
  are event-sourced — `status_events` carries the full snapshot, the flat
  instance carries the state. Field edits ride the same trail (SPEC UI):
  the instance patch transport calls `appendFieldChangeEvent`, whose records
  keep the current state on both ends and carry
  `operation: { kind: 'field_change', changes: [{ field, from, to }] }`
  with the acting principal — the history surface renders them beside
  transitions as who changed what.

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
`getRegionState(status, regionId)` for scoped reads. Flat instance
documents persist the primary state as one `state` string; the engine
projects it into the machine view.

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
transition. Snapshot declarations are generic: a state can name a declared
child type and its lineage key; the status runtime captures readable entity
refs/counts into `status.lifecycle.data.snapshots` during the transition.

### 2. Hook Dispatch (App Registry)
Acts as a decoupled dispatcher for side-effects. Domain logic is NOT implemented in the core engine.
- **Resolution**: The engine reads hook handlers from the active app registry
  (`registry.registerHookHandler`), falling back to hooks exported by the
  owning instance service. No handler is registered today; a pack that wants
  transition side effects mounts `hookHandlers` beside its domain.
- **Typed Settings**: Hook handler ids and parameter fields are declared in
  a registered domain's hook contracts — the engine resolves the declaring
  domain and owns no handler names. The engine validates required and
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

### 3. HTTP Status API

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
