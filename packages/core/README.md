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
- Graph documents: `normalizeGraphDocument`, `validateGraphDocument`,
  `assertValidGraphDocument`; canonical format `perigram.graph` v1,
  provider-qualified and version-pinned operations, explicit graph interfaces,
  and pinned `Use Graph` references.
- Procedural preview: `evaluateProceduralGraph` evaluates an acyclic graph in
  preview mode, resolves pure/read providers through explicit callbacks, and
  supports pinned subgraph invocation. Commit/effect execution is deliberately
  not part of this initial evaluator.
- Lifecycle runtime: `normalizeWorkflow`, `getWorkflowRegions`,
  `getWorkflowRegion`, `createWorkflowState`, `applyWorkflowTransitionState`,
  `validateTransition`, `validateLifecyclePayload`, `hasLifecyclePayload`,
  `resolveWorkflowStatePath`

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


## Procedural graph foundation

`graph.js` owns the canonical, JSON-safe graph document contract. A graph
stores its stable identity and authored revision, public input/output
contracts, provider-qualified node operation references (including pinned
definition versions), JSON configuration, layout coordinates, and explicit
edges. It does not store evaluated values or provider runtime objects.

Graph Input and Graph Output nodes bind the authored canvas to the declared
public interface. Use Graph nodes pin both graph identity and immutable
revision. The evaluator rejects recursive subgraph invocation and dependency
cycles. Subgraph interfaces are resolved from the pinned child revision.

`procedural-evaluator.js` is an intentionally narrow first execution profile:
it topologically evaluates pure and read nodes for preview, with provider
execution supplied by callbacks. It refuses proposal, commit, and external
effect nodes. Reads must still pass through the host's authoritative
authorization boundary. The evaluator is not the durable process scheduler
and does not persist outputs.

The initial evaluator transports values as opaque JavaScript values and
supports one incoming wire per input. Collection/tree mapping, incremental
evaluation, output caching, diagnostics envelopes, execution records,
read-set capture, and materialization are subsequent slices; they must not be
silently inferred from this initial contract.
