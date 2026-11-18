# COMPONENT: @perigram/core

Framework-neutral contract kernel. It owns canonical entity block DTOs,
status and workflow lifecycle helpers, isolated registries, domain definition
helpers, and normalized result helpers. It must not import Vue, Nuxt, MongoDB,
workers, or CNC-specific code.

Parent: [packages README](../README.md).

## Public Contract

- DTOs: `BaseEntity`, `Identity`, `Status`, `Lineage`, `Relations`,
  `Provenance`
- Canonical block registry: `CANONICAL_ENTITY_BLOCKS` defines the ordered
  framework block vocabulary used by domain definitions and generic design
  tools: `identity`, `origin`, `status`, `lineage`, `relations`, `provenance`,
  `specs`, `attachments`, `data`, and `summary`.
- Canonical block schemas: `CANONICAL_BLOCK_SCHEMAS` defines fixed fields for
  fixed-shape blocks. Open blocks are represented by one whole typed value:
  Lineage is a map of ancestry keys to ids, while Relations, Provenance,
  Specs, Attachments, Data, and Summary are structured objects. Domain entity
  field inventories must not be unioned into these schemas. Structural fields
  also declare readable, writable, and constructible authoring capabilities.
  `identity.uid` is readable but never writable or constructible: the owning
  entity service creates stable identity.
- Registry: `createRegistry()`
- Definitions: `defineDomain`, `defineCommand`, `defineTask`
- Validators: `validateDomain` plus the per-kind checks
  `validateCommandDefinition`, `validateTaskDefinition`,
  `validateEventDefinition`;
  `normalizeStatusLifecycle`, `normalizeEntityOutputContracts`, and
  `validateResultEntityOutputs` for result entity-output contracts
- Runtime bindings: `registerInstanceService`,
  `registerInstanceServiceResolver`, `registerCommandHandler`,
  `registerHookHandler`, `registerProjectionHandler`
- Result refs: `createInstanceRef`, `normalizeInstanceRef`, `createProvenance`,
  `createAttachmentRef`,
  `createCommandResult`, `createTaskResult`
- Block helpers: `createIdentity`, `createStatus`, `createStatusState`,
  `normalizeStatusState`, `getPrimaryState`, `getRegionState`,
  `getStatusRegions`, `createData`, `inheritLineage`,
  `createAttachment`
- Lifecycle runtime: `normalizeWorkflow`, `getWorkflowRegions`,
  `getWorkflowRegion`, `createWorkflowState`, `applyWorkflowTransitionState`,
  `validateTransition`, `validateLifecyclePayload`, `hasLifecyclePayload`,
  `resolveWorkflowStatePath`

The provider-neutral node contract is owned by [@perigram/plugin-sdk](../plugin-sdk/README.md#node-provider-palette-contract). Every registered definition carries an explicit semantic palette group; the host derives palette grouping and search from that declaration rather than operation-id prefixes.

## Canonical graph documents

Core owns the versioned `perigram.graph` JSON document and its preview evaluator.
The document stores graph identity and revision, public input/output interfaces,
provider-qualified nodes with pinned definition versions, JSON configuration,
canvas positions, and typed edges. Public interface ports carry both transport
shape and semantic descriptors; each port has one Graph Input or Graph Output
boundary node. Use Graph nodes pin an immutable graph revision.

- `normalizeGraphDocument`, `validateGraphDocument`,
  `assertValidGraphDocument` own document normalization and validation.
- `GRAPH_DOCUMENT_FORMAT`, `GRAPH_DOCUMENT_VERSION`, and the three
  `GRAPH_*_OPERATION` constants identify the format and core boundary operations.
- `evaluateProceduralGraph` evaluates data dependencies in preview mode,
  resolves exact provider definitions, composes pinned subgraphs, and awaits
  the optional `context.finalizeExecution(executionId)` hook in its settlement
  path. Connected required inputs fail when their source output is absent or
  undefined; non-nullable inputs reject null values and null defaults, and primitive/record bases are checked against runtime values. The same execution id is exposed to every node invocation and
  the finalizer. It returns graph outputs and per-node outputs for host preview
  channels. Hosts can select `executionTarget: 'browser' | 'server'`; server evaluation requires every operation to explicitly declare server support. This is a target-validation seam only: `@perigram/core` does not provide server scheduling, package pin resolution, capability authorization, or execution-record persistence. The graph-executions feature currently records caller-supplied execution envelopes and materializes selected outputs; it does not yet orchestrate a saved graph through the managed plugin task worker. Those are owned by the server graph-executions integration, which remains open in the root TODO. `context.signal` cooperatively cancels provider resolution and node execution, and the execution finalizer still runs on cancellation.
- `createGraphExecutionRecord`, `validateGraphExecutionRecord`, and
  `assertValidGraphExecutionRecord` own immutable, versioned execution
  envelopes with pinned graph revisions, inputs, outputs, diagnostics,
  invocation provenance, read sets, and artifact references. Construction
  validates JSON values before cloning so serialization cannot erase invalid
  `undefined`, non-finite, or non-JSON values.
  Profiles distinguish procedural preview, Commit, Bake, Export, and durable process execution.
- `createCoreGraphDataProvider` registers the platform CTS instance-query node. It supports bounded typed queries and exact-instance selection; its executor receives an authorized host query capability and forwards the returned consistency boundary and read dependencies into the shared recorder.
- `createGraphReadSetRecorder` captures deduplicated instance, relation, and
  query/range dependencies across parent and pinned child evaluations. It
  records a consistency label and optional snapshot/change-sequence boundary;
  distinct query snapshots collapse to a `sequence-bracketed` execution
  boundary only when every read shares the same stable organization sequence.
  Divergent or unverified reads downgrade the whole set to `unverified`.
  Read providers record dependencies only after their authorized read completes.
- Preview accepts pure and read node definitions; effect, proposal, commit,
  stateful, and control operations are refused by the evaluator.

The graph document and evaluator are application-neutral. Persistence,
authorization, provider execution bindings, preview rendering, Commit, Bake,
and Export are host responsibilities. The architecture contract is
[ root SPEC §28](../../SPEC.md#28-unified-node-graph-system).

## Internal module boundaries

The public barrel is intentionally a compatibility surface; implementation
ownership is split by contract:

- `registry.js` owns in-memory domain/command/task/event registries and
  definition validation.
- `entities.js` owns canonical entity-block DTOs, structural block schemas,
  entity references, and entity construction helpers.
- `results.js` owns normalized command/task results and declared entity-output
  contract validation.
- `status.js` and `workflows.js` own status and workflow lifecycle logic.

Keep new behavior in its owning module rather than extending the barrel.

## Vocabulary

| Term | Definition |
|---|---|
| Entity | Persisted business object described by canonical blocks. |
| Command | Synchronous business intent and access boundary. It validates entity refs and permissions, invokes one registered handler, and records `command_runs`. |
| Task | Async execution boundary for worker/server work. It is queued in `task_runs`, claimed by a worker or executor, and completed with a normalized task result. |
| Workflow | Entity lifecycle machine: region states, transitions, access requirements, hooks, and lifecycle data policy. |
| Hook | Transition side-effect contract plus app-registered handler. |
| AttachmentKind | A payload-bearing type's upload contract: MIME type, creation protocol, preview mode, size limit (payload traits keyed by type id). |
| Adapter | Application binding that connects pure domain definitions to infrastructure. |

Commands and tasks are intentionally separate: a command expresses user/system
intent, while a task is retryable asynchronous execution. A command may enqueue
zero or more tasks.

## Boundaries

Core stores definitions and handler references only. Authorization, persistence,
HTTP routes, MongoDB repositories, worker protocols, and file IO belong to app
runtime packages and server modules.

`BaseEntity.toJSON()` is strict: it emits root `_id` plus canonical blocks only.
Identity fields stay under `identity`; containment ancestry stays under
`lineage`; non-owning links stay under `relations`; immutable derivation facts
stay under `provenance`; feature-specific data stays under `data`, `specs`,
`attachments`, or `summary`.

`CANONICAL_BLOCK_SCHEMAS` owns fixed structural fields.
`CANONICAL_BLOCK_COMPOSITION` separately classifies open blocks as lineage
ancestors, named relations, named attachments, or named typed values. This is
composition behavior, not a registry of entity-specific fields; domains supply
declared lineage slots, entity types, and attachment kinds.

`Status.state` is a v2 structured object with `primary`, `active`, and
`regions`; state comparisons go through `getPrimaryState()` or
`getRegionState()`. This region model serves
workflows defined through this kernel; types declared through CTS carry
their state law in [CTS SPEC §7](../cts/SPEC.md).

Core is the canonical implementation of status readers, lifecycle payload
normalization, workflow-tree normalization, and transition validation.
Workflow definitions are supplied by process compilation or the
workflow-overrides feature; core maintains no mutable global workflow registry.

`BaseEntity.toJSON()` projects the current status block onto the flat wire
`states` map. Every active workflow axis is emitted as its canonical leaf
path; `main` is only the primary-axis convention, not the sole state slot.
Transition evidence remains one status envelope. The constructor rehydrates
all persisted axes, so stored documents round-trip losslessly — the canonical
round-trip contract lives in
[server/core/blocks](../../server/core/blocks/README.md).

## Related

- [server/core/blocks](../../server/core/blocks/README.md)
