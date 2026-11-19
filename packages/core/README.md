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
  channels. Hosts can select `executionTarget: 'browser' | 'server'`; server evaluation requires every operation to explicitly declare server support. This is a target-validation seam only: `@perigram/core` does not provide server scheduling, package pin resolution, capability authorization, or execution-record persistence. The server graph-executions feature supplies those host concerns: authenticated saved-graph evaluation, installed package-pin resolution, isolated managed plugin tasks, cancellation/deadlines, per-call capability evidence, and persisted procedural-preview records. Its remaining work is broader capability-scope unification, effect/lifecycle policy, non-JavaScript runtimes, and cross-target parity (tracked in the root TODO). `context.signal` cooperatively cancels provider resolution and node execution, and the execution finalizer still runs on cancellation.
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

## Typed IR

`lowerGraphToTypedIR({ graph, resolveNodeDefinition, resolveGraph,
resolveCompatibility?, executionTarget })` lowers one validated
`perigram.graph` document into an immutable, JSON-pure
`perigram.typed-ir` v1 document:

- `source` pins the graph identity and revision the IR was lowered from;
  `executionTarget` records the requested target.
- `operations` carry, per node in document order: the operation identity,
  the host-resolved package pin when the definition supplies one, the
  execution declaration (kind, targets, capabilities, deterministic,
  idempotent), typed input/output slot contracts, the authored config,
  boundary interface bindings, and Use Graph invocation pins with the
  pinned subgraph interface.
- `dependencies` carry, per edge in document order: the edge kind, source
  and target endpoints, and the resolved compatibility decision
  (`{ status, compatible, reason, conversions }`).
- `capabilities` and `executionKinds` aggregate the resolved operations;
  `diagnostics` map every lowering problem to its node, edge, and port.

Lowering is a pure function of the pinned document and the resolution
callbacks: identical inputs construct an identical IR. Structural
document failures return `{ ir: null, diagnostics }`; semantic problems
(unresolved operations, unsupported targets, incompatible edges,
unresolved subgraphs) lower an IR that carries the diagnostics.
`validateTypedIR` checks format, version, and JSON purity. The default
compatibility check compares transport shapes and semantic bases; hosts
inject the shared comparator (`resolveCompatibility`) for the full
semantic contract, so `@perigram/core` stays independent of
`@perigram/plugin-sdk`. Control edges carry their authored `kind`;
explicit iteration constructs enter the IR when the graph format
declares them.

The graph document and evaluator are application-neutral. Persistence,
authorization, provider execution bindings, preview rendering, Commit, Bake,
and Export are host responsibilities. The architecture contract is
[ root SPEC §28](../../SPEC.md#28-unified-node-graph-system).

## Authoring DSL

One language-independent structured authoring schema underlies the textual
syntax and JSON payload authoring described in
[SPEC §30.9.1](../../SPEC.md#3091-textual-dsl-and-structured-authoring). Both
encodings lower deterministically into a canonical `perigram.graph` document;
the syntax stays replaceable behind the schema.

### Structured schema (`perigram.graph-authoring` v1)

`normalizeAuthoringDocument` and `validateAuthoringDocument` own the schema
law. Normalized documents are deep-frozen and JSON-pure:

```json
{
  "format": "perigram.graph-authoring",
  "version": 1,
  "id": "graph.document",
  "revision": "rev-01",
  "name": "Document graph",
  "description": "Compose a document",
  "interface": {
    "inputs": [
      { "id": "source",
        "contract": { "shape": "item", "semantic": { "base": "entityRef" } },
        "required": true, "label": "Source", "default": { "kind": "draft" } }
    ],
    "outputs": []
  },
  "nodes": [
    { "id": "format-1",
      "operation": { "provider": "plugin.documents", "id": "document.compose", "version": "3" },
      "config": { "template": "brief" },
      "capabilities": ["documents:read"], "effects": ["read"] },
    { "id": "sub", "invoke": { "graphId": "graph.child", "revision": "rev-2" },
      "capabilities": [], "effects": [] }
  ],
  "edges": [
    { "id": "edge-1", "source": { "node": "source", "port": "value" },
      "target": { "node": "format-1", "port": "source" } }
  ],
  "presentation": { "positions": { "format-1": { "x": 20, "y": 40 } } }
}
```

| Rule | Law |
|---|---|
| Node kind | Each node declares exactly one of `operation` (provider-qualified, pinned version) or `invoke` (pinned subgraph revision). Core boundary and invocation operations are reserved: authoring rejects them as direct node operations. |
| Declarations | `capabilities` and `effects` are arrays of non-empty strings the author declares for the invocation. |
| `presentation` | Editor-only JSON object; evaluation and typed-IR lowering ignore it. |
| Identities | Graph, node, and edge ids follow the graph id pattern; interface port ids are unique across both directions and distinct from node ids, because each port lowers to a boundary node under its port id. |
| Edge ids | An omitted edge id synthesizes `edge-<position>` (1-based, document order). |
| Unknown keys | Unknown keys at any level are validation problems (`unknown-key` with the document path); normalization drops them. |

### Reader grammar

`readRestrictedEdn(source)` returns `{ forms, diagnostics }` for the
restricted EDN-inspired grammar: lists `()`, vectors `[]`, maps `{}`,
double-quoted strings, integers and floats (optional `-`, optional exponent),
`true`, `false`, `nil`, and simple or qualified keywords
(`:base`, `:plugin.documents/document.compose`). Whitespace and commas
separate forms; `;` comments run to end of line. Every other token — symbols,
`#` reader macros, any other character — is a diagnostic. Every form carries
`pos: { line, column, span: { start, end } }` (1-based line and column,
0-based character offsets); every diagnostic carries the position of the
offending form.

### Form vocabulary

```scheme
(:graph "graph.document" "rev-01"
  (:name "Document graph")
  (:description "Compose a document")
  (:interface
    (:input "source" :item {:base "entityRef"}
      {:label "Source" :required false :default {:kind "draft"}})
    (:output "document" :item {:base "document"}))
  (:node "format-1" :plugin.documents/document.compose "3"
    {:template "brief"} {:capabilities ["documents:read"] :effects ["read"]})
  (:invoke "sub" "graph.child" "rev-2" {:effects ["call"]})
  (:connect :source/value :format-1/source)
  (:connect "edge-2" :format-1/document :sub/source {:kind :control})
  (:presentation {:positions {:format-1 {:x 20 :y 40}}}))
```

| Form | Shape | Lowers to |
|---|---|---|
| `(:graph id revision body*)` | exactly one, the document root | graph identity and revision |
| `(:name s)`, `(:description s)` | once each | graph name / description |
| `(:interface port*)` | once | declared interface ports |
| `(:input id :shape semantic options?)`, `(:output …)` | inside `:interface` | port plus synthesized boundary node |
| `(:node id :provider/op "version" config? options?)` | any count | node with pinned operation and JSON config |
| `(:invoke id graphId revision options?)` | any count | `perigram.core.use-graph` node pinned to the subgraph revision |
| `(:connect endpoint endpoint)`, `(:connect id endpoint endpoint options?)` | any count | edge; omitted ids synthesize `edge-<n>` in form order |
| `(:presentation map)` | once | `metadata.presentation` |

Connection endpoints are qualified keywords `:node-id/port` referencing an
authored node or an interface port (its boundary node). Map keys are keywords
or strings; keyword values normalize to their name strings, so `{:mode :fast}`
and `{"mode" "fast"}` normalize identically. Option maps accept only the keys
listed for their form; on `(:node …)` a lone trailing map is config, and the
options map requires the config map to precede it. The transport `:shape`
must be one of the graph transport shapes. `parseAuthoringDsl`
returns `{ document, sourceMap, diagnostics }`; any syntax or shape problem
yields `document: null` with each diagnostic carrying `{ code, message, pos }`
(text layer) or `{ code, message, path }` (schema layer).

### Lowering contract

`lowerAuthoringDocument(document, sourceMap?)` returns
`{ graph, sourceMap, diagnostics }`:

- Boundary nodes are synthesized for every interface port (Graph Input and
  Graph Output, node id = port id) ahead of authored nodes in document order;
  `invoke` nodes lower to pinned `perigram.core.use-graph` operations.
- `presentation` passes through as `metadata.presentation`; declared
  capabilities and effects ride `metadata.authoring.declarations` keyed by
  node id — authoring provenance for host-side capability checks, while the
  execution-time capability law stays with operation contracts (§Typed IR).
- The graph is the `assertValidGraphDocument` normalized document. Lowering
  is deterministic; invalid input returns `{ graph: null, sourceMap: null,
  diagnostics }`. A malformed `sourceMap` argument throws.
- The sidecar (`perigram.authoring-sourcemap` v1) maps every lowered node and
  edge id to its DSL form position, boundary nodes included; the graph
  document itself carries only canonical fields.

### Round-trip law

`serializeAuthoringDsl(document)` regenerates text that re-parses to the same
normalized structured document; semantic equality is the law, byte identity
is an implementation detail. A valid DSL document lowers to a canonical
document with no semantic loss. Canonical graphs using constructs beyond
this vocabulary (node positions, edge metadata) stay editable through the
other authoring surfaces.

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
- `graph.js` owns the canonical graph document contract, `graph-ir.js`
  the typed IR and lowering, `graph-execution.js` the execution envelope,
  `graph-read-set.js` the read-dependency recorder, and
  `graph-data-provider.js` the platform instance-query provider;
  `procedural-evaluator.js` composes them for preview evaluation.
- `authoring-reader.js` owns the restricted reader grammar,
  `authoring-schema.js` the structured authoring schema, and
  `authoring-dsl.js` the form vocabulary, serialization, and lowering into
  canonical graph documents.
- `json.js` owns the shared JSON helpers (`isRecord`, `isJsonValue`,
  `cloneJson`, `deepFreeze`) used by the graph modules;
  `graph-execution.js` keeps its stricter plain-prototype `isRecord`.

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
