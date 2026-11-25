```yaml
doc_id: SERVER-FEATURES-PROCESS-DEFINITIONS-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Process Definitions

The organization's business-process feature: definitions are authored
as semantic process graphs, validated, and activated into the compiled
runtime contract (actions, screens, workflows, grants, navigation,
services) the organization backend serves continuously; a definition is
turned on or off in organization settings — the whole lifecycle (root
SPEC §18, §19). Consumers: the
compiler ([packages/processes](../../../packages/processes/README.md)),
state and command/task runtimes, generated screens, agent authoring.

Parents: [features README](../README.md) · [features SPEC](../SPEC.md) · neighbors: [cts-types](../cts-types/README.md)
(registry ownership), [workflow-overrides](../workflow-overrides/README.md),
[core machines](../../core/machines/README.md).

## Contracts owned here

### Lifecycle: author → validate → activate

| Phase | Law |
|---|---|
| Author | Definitions store current semantic records: the graph, its `processNodes`/`producerOutputs`/`screens`/`services`/`sockets`/`stateDefinitions`/`valueInputs`/`ctsTypes`/`servicePrincipals` maps, and `roleGrants`. Saves carry a structural floor — unique node ids, designer-renderable canvas type, numeric position, addressed records, edges addressing existing nodes, data edges naming both sockets and socket-valid handles. Identity-only PATCH leaves data untouched. |
| Validate | Recompiles both sides from canonical records and produces the semantic Apply diff (`diffProcessContracts`): actions, screens, role grants, per-typeId CRUD capabilities, per-producer workflows, field-policy sections, and the entity statuses the next contract removes. Draft validation overlays the draft's own declarations. |
| Activate | Requires canonical semantic records, validates the draft, verifies transpiler round-trip, compiles the contract, marks the definition `ACTIVE`, writes the activated snapshot to `data.activated` (the runtime compiles `data.activated || data`), records the superseded snapshot in `data.history` (cap 50). |
| Deactivate | Removes one definition from the active set (state returns to `DRAFT`, editable, re-activatable) and re-derives the runtime contract. |
| Type lifetime | Definitions reference type ids. An org type lives until explicitly deleted through the [cts-types](../cts-types/README.md) removal ceremony; activation and deletion leave types and their data untouched. |

Activation is additive: several `ACTIVE` definitions compile as one
canvas — `mergeActiveDefinitions` concatenates graph nodes/edges with id
dedupe, key-unions the record maps, unions per-role `roleGrants`, later
activations winning key conflicts. Gates compare the activating draft
against the merged remaining-active contract; `/active` returns the most
recently activated definition for boot convenience.

### Migration gate and plan

Activation gates removed workflow states: live entities holding a
removed state fail with 409 `migrationRequired` plus the plan.
`migration-plan.js` owns the plan — one row per type with live instances
in removed primary states, `{ statuses: [{ typeId, removed:
[{ state, count }], targets }] }`, targets recomputed server-side; the
plan is the apply's whole database impact statement. Migrations are
authored data on the definition (`data.migrations.statuses: [{ typeId,
from, to }]` via `declareStatusMappings`): every removed state with a
live count needs one mapping to a retained target; partial or off-target
declarations return 400 with the plan; a stale row is a no-op; an empty
declaration restores the 409 gate. Activate-then-migrate runs in one
request (the status machine resolves the *active* contract): each
affected instance re-targets through `setInitialStateForOrganization`
(initial-state semantics, `fromState: null`, mapping kept in
`data.migrations.applied`) via the registered service's `processList`
under the activating actor's auth. Re-posting activate resumes; a
mid-migration failure returns 500 `migrationIncomplete` with the partial
summary; every re-target publishes the typed invalidation event.

### Action execution seam

Activation compiles the contract; execution serves it continuously (root
SPEC §19: no durable process runs; `command_runs` and
`task_runs` are the audit trail).

- **Manual actions** evaluate the authored dataflow in-process over the lowered
  definition, to settled or the first async boundary, every effect re-entering its
  registered service/command/status boundary under the originating actor's access
  snapshot (incl. compiled `effectivePermissions`).
- **Async completion**: an async command effect parks the evaluation at the task boundary;
  the enqueued task-run id keys the in-process continuation. The task runtime's terminal
  boundary calls `continueActionFromTask` / `failActionFromTask` here; the parked evaluation
  resumes with the task's projected completion output (terminal `TaskResult` entities land
  on the declared sockets) under the originating actor. An uncorrelated task-run id is a
  no-op; a restart drops the continuation, the task's terminal handler still applying its
  domain effects.
- **Effect kinds**: create (generic blocks + typed construction modes; `action.state.to`
  applied as the process initial state; one `created` invalidation per completed tuple),
  update (replacement blocks through the owner's `processUpdate()`, writable fields only),
  change status (authored region/path scope, lifecycle evidence, actor assignments via the
  status runtime), relation link/unlink (cardinality-merged, duplicate-free, relation-domain
  validated at the write boundary), run-command/run-service (socket values partitioned into
  the command envelope's `entities`/`parameters`; results projected onto declared
  entity/attachment sockets), derived exports (`(typeId, kind)` plugin bindings).
- **Action-scoped grants**: create/update/run-command actions execute with request-local
  grants for the target feature and declared source types; they expire with the request
  and join no persisted role. Before a compiled Create or Modify persistence, Relations
  replacements resolve every target through `processGetById` under the run auth, apply
  read access and active-organization isolation, and drop duplicates by type/id; a
  failed check leaves the owner persistence method uncalled.
- **Serialization**: missing-field markers leave through
  `serializeProcessResult` as `{ missing: true, path }` at any depth;
  present `null` stays `null`.

### Compiled outputs and gates

Activation validates every effect node's service binding against the
registry's per-type `processCapabilities` record — `cts.construct` requires
`create` (a registered create mode matching the construction mode),
`cts.mutate` requires `processUpdate`, `cts.remove` requires `delete`, and
`cts.transition` requires `archive` for an archive intent, else a status
workflow — as deterministic `validation.errors` entries (400), and resolves
required entity profiles from command metadata. `cts.payload` writes the
owning file type's payload through its instance service and requires a
declared payload and revision scope. Auth hydration compiles the current semantic graph before
resolving screens, actions, workflows, and grants; the stored compiled
snapshot serves inspection — runtime boundaries compile fresh.

### Deadline scanner, authoring seams, bootstrap

The scanner sweeps active compiled machines on an interval
(`DEADLINE_SCAN_INTERVAL_MS`, default 60s, `0` disables): states with
declared deadlines whose `stateChangedAt` is overdue move through the
status engine as SYSTEM. Scan input is the stored compiled snapshot;
auth decisions compile their own path; rescans self-stabilize (moved
instances leave the query, refusals retried); `listActiveWorkflowStates`
serves the agent wake rules from the same snapshot-read law.
`createDefinitionAuthoring` is the headless authoring seam the designer
and agents share: `composeDefinition` / `editDefinition` apply the step
grammar onto a fresh or stored draft; declaration steps re-seat the
session onto the draft-overlay domain (in-tree declarations are ports
immediately; refused declarations surface as named `Unknown port`
causes). `applyTreeDeclarations` compiles the draft's declaration tree
through the cts-types `defineType` boundary (idempotent re-posts;
registry refusals return per-type failures); the persistence rewrites
(`rewriteRetiredWirePaths`) normalize stored drafts at the resolution
seam. `createActiveEmptyProcess()` authors the organization's first
definition through the same seam — empty, stationing the packs' and
plugins' starter constructs as manual constructs granted to `role_admin`,
then compiles and activates.

## Laws

- `typeId`/`id` wire vocabulary end to end (root SPEC §14).
- Business-entity reads and writes go through registered service adapters
  (`processList`/`processGetById`/`processUpdate`/`processDelete`); generic
  Mongo writes for business entities: zero.
- Task/claim protocol and worker auth: [core/tasks](../../core/tasks/README.md);
  transition boundary and stamps: [core/machines](../../core/machines/README.md);
  compiler and evaluator semantics: [packages/processes](../../../packages/processes/README.md);
  CTS declaration language: [packages/cts](../../../packages/cts/README.md).

## End state

The README states the lifecycle, gates, plan, and execution seam at this
precision in `typeId` vocabulary, one headed section per contract.
