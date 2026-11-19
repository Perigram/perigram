```yaml
doc_id: PACKAGES-PROCESSES-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: @perigram/processes — the process compiler

CTS declaration records and designer authoring in; runtime contracts out. The server runtime consumes the compiled contracts at activation, auth hydration, and action execution; the designer consumes the authoring seam, palette, and canvas round trip. Node- and browser-safe. The [CTS SPEC](../cts/SPEC.md) owns the declaration language; the [package layer](../SPEC.md) owns the workspace map. The section list below is the README's target table of contents.

## Contracts owned here

### Authoring seam

| Aspect | Law |
|---|---|
| Seam | `createDefinitionAuthoring(domain, capabilities, seedData)` is the one authoring path; the designer page is a presentation adapter over it; `seedData` re-seats it on a stored authored document (authored keys only). Everything authorable in the browser is authorable headlessly. |
| Gestures | Each gesture has its removal twin: declaration-tree authoring (`declare*` + `wireDeclaration` under `declarationWireLegality` / `unwireDeclaration`), palette drop / `removeNode`, record configuration (inspector writes, socket input defaults), connection under `processSocketsCompatible` / `disconnect`. Children wires land child-first; type-reference children give recursive containment. |
| Apply shape | In-tree vocabulary composes tree → posts compiled declarations → re-seats the domain (`withDomain`) → composes the graph over it. |
| Save floors | `graphIntegrityProblems`, `graphEdgeSocketProblems`, `collapseEffectAccessGrants` (an effect's access is one grant, the lane gesture); semantic validity stays with the validator. Every palette item drops, configures, and round-trips headlessly (`authoring.spec.js`). |

### Designer round trip

| Aspect | Law |
|---|---|
| Canvas records | Process nodes and status definitions are canvas records; every other record kind (producer outputs, actions, services, sockets, value inputs) is panel-owned and survives the round trip untouched. A derived action and its effect sharing an id keep one `data.refId` under namespaced canvas ids. |
| Stability gate | `validateRoundTrip` cycles definition → canvas → definition twice at activation and the generations match; `ctsTypes` records round-trip byte-identical (full authoring key set; `null` binding stays `null`); canvas positions are presentation data. |

### Relationship to the unified graph architecture

Root SPEC.md §28 is authoritative for the canonical graph document,
procedural execution profile, reusable subgraph interface, plugin-provider
contract, preview, Commit/Bake, and graph-format migration. This package's
node-model section is the process profile's compatibility contract for
those shared definitions; it must not fork or redefine them.

Process orchestration remains a distinct execution profile. Its control
tokens, durable task boundaries, event starts, waits, retries, workflow
lifecycle, role grants, and effect guarantees remain process-owned. Process
definitions persist the canonical graph format; `createProcessGraphDocument`
and `authoredProcessDataFromGraphDocument` are the two projections between
the canonical envelope and the authored process domain.

### Kernel- and library-agnostic node model

The provider-neutral node contract described here is shared platform architecture,
not a process-package-owned graph model. Its authoritative provider-facing contract
belongs to `packages/plugin-sdk`; canonical graph documents and procedural graph
mechanics belong to `packages/core` (root SPEC.md §28). This section records the
requirements the process execution profile consumes and must remain compatible with.
The process package owns process-specific authoring, CTS operation semantics, durable
orchestration, lifecycle, authorization, and effects; it does not define a parallel
universal graph format, provider registry, or procedural evaluator.

The common node contract is independent of execution kernel, programming language,
domain library, and UI framework. Sharing that contract does not require replacing the
existing process compiler with the procedural evaluator or forcing every domain into
one closed type system.

| Aspect | Law |
|---|---|
| Definition | A node is a versioned semantic operation contract: stable provider-qualified identity, human label/documentation, input/output port contracts, configuration schema, execution classification, effects/capabilities, and compatibility requirements. Display names and UI component names are never identity. |
| Provider boundary | A provider discovers or declares operations and implements their execution. Its native callable, class, runtime object, or remote endpoint remains provider-owned. The platform normalizes metadata into the common contract; it does not import or execute provider-native objects. Static declarations and runtime introspection are equally valid discovery mechanisms. |
| Data values | Values cross the boundary as opaque runtime payloads accompanied by semantic descriptors. The platform may inspect declared metadata and platform-owned envelopes, but must not assume it can inspect, clone, serialize, or interpret arbitrary provider values. Serialization and preview require explicit provider capabilities. |
| Open-world semantics | Do not require a universal closed enum of data types. A port descriptor supports platform-known primitives and structures, provider-qualified nominal types, structural schemas, refinements/constraints, unions, collections, nullability, and an opaque/unknown fallback. Unknown provider types remain identifiable and connectable only under declared compatibility rules; they must not silently collapse into an unrelated primitive. |
| Compatibility | Compatibility is a relation, not a single global type equality. A provider or semantic adapter may report exact, safe coercion, conditional/runtime-checked, explicit-conversion-required, or incompatible. The result includes the reason and any required conversion. The platform owns generic rules only where semantics are genuinely universal (for example integer-to-number); domain-specific rules belong to a registered semantic adapter. |
| Data semantics | Keep value shape separate from value meaning. Item/list/tree/map/tuple and mapping/alignment/access describe how values are transported and applied; nominal identity, schema, units, constraints, entity identity, and domain meaning describe what they represent. Neither dimension may be inferred solely from the other. |
| Execution semantics | Pure computation, stateful computation, external effects, control flow, streaming/mapping, determinism, and idempotency are declared independently of presentation. The executor/provider validates and enforces the semantics it owns; the graph engine enforces only platform-level guarantees. |
| Interface derivation | Node cards, sockets, inspectors, defaults, enum selectors, structured editors, and diagnostics are projections of the normalized contract plus optional declarative presentation hints. Hints select a supported editor or schema renderer; they do not embed operation-specific component logic into the canvas. Missing hints fall back to generic inspection/editing or read-only opaque display. |
| Discovery and stability | Discovery output is normalized, validated, and versioned. Stable operation and port identifiers survive label/documentation changes. Provider version changes and contract changes are explicit; persisted graphs retain the operation identity/version and enough authored configuration to diagnose unavailable or changed providers. |
| Domain separation | This package's CTS/process species, authorization, entity lifecycle, and workflow rules remain process-profile semantics layered on the shared node contract. They are not universal node primitives and must not leak into the kernel-neutral base contract. Generic graph mechanics are owned by `packages/core`; provider-facing declarations are owned by `packages/plugin-sdk`; neither is reimplemented here or separately by plugins. |

#### Type-system decision

A strongly typed, closed-world universal type system is not a goal. Perigram handles data whose
meaning is defined by plugins, declared schemas, user-defined types, runtime objects, and external
systems. Pretending all such values can be statically understood would either erase semantics into
`json/any` or create a central registry that cannot keep pace with providers.

Use a **gradual, extensible semantic contract** instead:

1. Preserve provider-qualified nominal identity when a provider knows a type.
2. Carry structural schema and constraints when available; treat them as evidence, not proof that
   arbitrary runtime values conform.
3. Keep transport shape and semantic type as separate descriptors.
4. Permit opaque values without pretending they are structurally compatible with everything.
5. Make uncertain compatibility explicit and defer validation to the provider/runtime where
   necessary.
6. Require explicit conversion nodes when a conversion changes meaning, loses information, or
   cannot be proven safe.

This gives the editor enough information to derive useful interfaces and catch known mistakes
without claiming static guarantees the underlying data cannot support.

### Palette

| Aspect | Law |
|---|---|
| Groups | Declaration items, type-bound constructs, effect species, typed instance sources and navigation (generic read presets, bound at configure time), values, list/tree algebra, flow, and pack plugin tabs (`packPaletteGroups`; a packless service falls to `servicesPaletteGroups`). |
| Exhaustiveness | The value and list/tree groups cover the catalog's author-facing basics; catalog-only: `collection.makeList` (fixed arity) and `collection.packArray`/`unpackArray` (the persisted-array boundary). The loop item authors the pair `control.forEach` + `control.forEachEnd`. |
| One home per operation | The polymorphic kinds (math, string, dateTime, compare, logic, list reduction) carry sockets and evaluation in one registry (`operations.js`); catalog ports, the evaluator, and authoring defaults derive from it. `value.compare` owns comparison; `value.logic` owns boolean algebra. |
| Hidden machinery | Storage-id lookup, producer joins, packet matching, and transport adapters stay compiler-internal. |

### Compiler and validation seams

| Aspect | Law |
|---|---|
| Boundaries | `compiler.js` owns top-level compile orchestration; `normalization.js` owns authored process-definition normalization; `validation.js` orchestrates process, input, and lineage diagnostics; `workflow-compilation.js` owns lifecycle and per-output workflow compilation; `compiler-core.js` owns shared graph/action/field-policy primitives and remaining non-screen compilation algorithms; `access-compilation.js` owns role/assignment access compilation; `access.js` owns role-assignment resolution and access projection; `screen-compilation.js` owns compiled screen projection, role/type inference, child-region composition, screen merging, and navigation; `screen-analysis.js` owns redundant authored-screen detection; `screen-contract.js` and `contract-diff.js` own the reusable screen contract and diff. The public barrel exports the compiler API directly; forwarding-only files are not treated as module boundaries. `prepareAuthoredDefinition` resolves ids and row paths through CTS `resolveCtsDefinition` plus declaration checks. |
| Diagnostics | `validateProcessDefinition` returns `{ errors, diagnostics }`; each diagnostic anchors `{ message, nodeId?, edgeId?, socketId?, producerOutputId? }`, named by humanized catalog label + canvas id (an authored label wins). Inspect-only warnings report values that reach no effect species. |
| Required inputs | Activation runs `validateLineageBindingResolution` and `validateRequiredInputAvailability`; a required input is satisfied by a connected value, an authored `inputDefaults` fallback, a domain default, a manual prompt (manual actions only), or the run context (manual actions only); `null`/missing satisfies nothing; emptiness follows the input kind (scalar, collection, attachment). |
| Apply diff | `diffProcessContracts(previous, next)` is pure over compiled outputs: actions, screens, role grants, per-type CRUD, producer workflow changes, field-policy sections, `removedInstanceStates`. The stored `compiled` snapshot is inspection-only; hydration and manual execution compile the current graph at access time. |

### Workflow synthesis

| Aspect | Law |
|---|---|
| Machine edges | Derived from wiring: from-state = the arrival state on the transition's entity wire (`declaredTransitionSources` — one derivation feeds machine edges, manifest `state.from`, and client filters); to-state = the authored target socket. Recursive state trees compile with canonical dotted paths; a parent state is itself a leaf (CTS SPEC §7). |
| Guards | Boolean AST over `{ value }` with row-relative paths; compiles onto the machine edge, the first declaration of an edge owning it; the status runtime re-evaluates it atomically at commit ([server/core/machines](../../server/core/machines/README.md)). |
| Actors | The user-typed `actors` input: the resolved set applies to every state, replaces the previous set, and the actor guard governs later transitions. |
| Field policy | `fieldPolicy { visible?, editable? }` authors on the typed operation (transition → target state, construct → initial state); the first declaration of a state owns the facet; `editable` stays within `visible`; `normalizeStateFieldPolicy` is the one normalization home; the write boundary enforces, surfaces filter. |
| Edge discipline | Only status-mutating actions compile machine edges; a no-op arrival-to-target pair reaches neither channel nor manifest; an event-triggered edge is `processOwned` (orchestration executes it); a type declaring no states compiles no machine. |

### Producer outputs and lineage

| Aspect | Law |
|---|---|
| Identity | `producerOutputId = nodeId:outputSocketId`; only `cts.construct` and entity-producing operators mint outputs. Consumers resolve their type from the entity input; an upstream `producerOutputId` carries optional field/lineage policy; lifecycle comes from the type declaration; same-type streams are ordinary typed list dataflow. |
| Bindings | `lineageBindings`: `{ childTypeId, parentTypeId, lineageKey, producerOutputId, sourceProducerOutputId, sourceNode, sourceSocket, consumingNode, consumingSocket }`, deduplicated on the full identity. Compiled bindings are the authoritative hierarchy for access scoping and grant windows; presentation placement reads the merged view — compiled bindings first, then org-authored children edges. |

### Screens and inference

| Aspect | Law |
|---|---|
| Screen record | Fixed template; typed sources (stable id, entity type, list/single mode, own required access, scalar filters or identifier); regions (slot `main`/`children`/`supporting`, surface within `SCREEN_REGION_SURFACES`); scalar or `$assignment.<key>` bindings. `validateScreenContract` runs inside `validateProcessDefinition`. |
| Inference | Grants infer paired list/detail screens per role and entity (child regions from lineage children, parent-bound creates, declared many-relations) plus the per-user `home` screen at `HOME_SCREEN_ROUTE` (`/home`). |
| Delta authoring | Authored screens customize exactly the station they equal in kind; a projection-equal screen is refused (`redundantAuthoredScreens`); zero inferred stations compile zero screens; multi-role users receive merged effective screens. |
| Manifest | The per-user manifest speaks one vocabulary (`projectUiScreen`/`projectManifestAction`); compiled channel field names stay server-side. Create captions are procedural: an authored label wins, a generic one derives the target class and folds a distinguishing construction mode (`Create <Type> from <Mode>` compiled, `New <Type> from <Mode>` projected). |

### Access and roles

| Aspect | Law |
|---|---|
| Composition | Organizations own role identity and user assignment; definitions own `{ roleId, level }` mappings (`write`, `admin`, `read`); the compiled contract is user-independent; `resolveRoleAssignmentAccess` combines one assignment with it at auth time. |
| Status-scoped windows | A create opens the created state's window; a status-mutating update inherits the incoming window until modified, then its grant rows are the complete target-state set; parent-scoped windows carry lineage scope forward; command actions inherit the incoming window for declared output entities. Transition authority rides the edge as `processRoleIds`; the target-state grant describes access after the transition. |
| Services | Service identities live in `servicePrincipals` with `access.runPrincipals`/`viewPrincipals`; `billing.mode: prepaidTokens` with `tokenCost` debits the organization after successful execution. |

### Runtime orchestration

| Aspect | Law |
|---|---|
| Modes | Effects execute as `manual` (authorized UI) or `event` (incoming control socket). A process definition is a contract generator: manual actions evaluate the authored dataflow in-process; async command effects park on the task boundary; `command_runs`/`task_runs` are the audit trail ([root SPEC](../../SPEC.md) §19). |
| Control plane | `orchestration.js` carries control tokens, foreach scopes, join arrivals, attempts, and step outputs; data subgraphs evaluate lazily for the operational node consuming them; data/control cycles reject at activation; declaration wires (`role: 'type'`) stay outside dataflow. |
| Manual inputs | An explicit run input is authoritative over the connected edge; a context entity may bind an upstream entity socket as the current entity window; prompts exist on manual actions only. |
| Mutations | The mapped species (`cts.construct`/`mutate`/`transition`/`remove`) share one type-agnostic mapper: preflight alignment before the first write; one authorized call per aligned tuple in branch/item order; bare shape-preserving output on full success; `{ result, failures, completedMutations }` continue-and-collect envelope on any failure (manual runs invert it into a 400). A construct publishes one typed `created` invalidation after construct, block application, and initial state all succeed. |
| Transitions | The optional `note` persists as `status.metadata.note`; the step emits the updated entity DTO. |

### Catalog and protocol

| Aspect | Law |
|---|---|
| Process storage | Process definitions persist the canonical `perigram.graph` envelope. `PROCESS_PROTOCOL_VERSION = 4` and `dataflowVersion: 4` identify the authored process projection inside graph metadata; the canonical graph format stays authoritative. |
| Domain semantics | Authored process records use namespaced kinds — `source.*`, `value.*`, `collection.*`/`tree.*`, `record.construct`, `control.*`, `cts.*` — and map to provider-qualified canonical nodes and shared port contracts. The authored projection feeds the process compiler; the canonical envelope feeds the graph runtime. |
| Legacy socket adapter | `base` plus orthogonal qualifiers and `access` describe current stored process sockets. `ports.js` owns only legacy handle decoding/migration. The Plugin SDK owns the provider-neutral compatibility registry; Processes registers the CTS profile that preserves nominal type, block, access, and cardinality semantics until G10 removes the legacy adapter. |
| Constructors | `collection.makeList` exposes exactly four optional item sockets (`MAKE_LIST_INPUTS`), consumed in socket order, an unconnected node yielding the empty list; `collection.concat` is the two-list join retaining element type, topology, order. |
| Selectors | Filter, Dispatch, Sort, Distinct, and Group By share strict `alignSelectorPackets` alignment and reject mask or path mismatch. |

### Dataflow semantics

| Aspect | Law |
|---|---|
| Packet trees | Values are ordered `{ branches: [{ path, items }] }` trees; per-input Simplify, Flatten, Graft run before Longest (repeat-last), Shortest (truncate), Cross (Cartesian); Item access maps items, List runs per branch, Tree receives the structure; every polymorphic operation is list-aware. |
| Coercions | Implicit on the wire: safe integer→number, date→date-time, entity→entityRef, JSON transport. Nullable→required, unit change, narrowing, restructuring demand explicit author intent. |
| Missing vs null | Path reads produce a frozen `$missingField` marker carrying the path (also below a present `null`); `isNull`/`isNotNull` distinguish; Coalesce and required validation treat missing as absent; a marker reaching an effect fails before the handler naming input and path; `serializeProcessResult` is the single boundary rewriting markers, at any depth, to `{ missing: true, path }`. |
| Equality | Status and enum values compare as scalars; references and structured values by stable structural equality (sorted-key serialization), which Distinct and Group By key on. Filter/Dispatch return original items over an equal-length aligned mask. |
| Effects | Only the effect species persist changes or invoke external work; reads resolve through the registered entity service boundary with full run auth context. |

### Persisted-data rewrites

| Aspect | Law |
|---|---|
| Boundary rewrites | One-way at load/save: `normalizeProcessNodesForDomain` (comparison ops → `value.compare`), `normalizeRowRelativeFieldRefs` (block-prefixed spellings → row-relative ids), legacy edge-id handle extraction, stale parent stripping. |
| Identity backfill | `migrateProducerOutputIdentities` derives stored producer identity; a stale self-binding drops and re-derives; ambiguous same-type ownership returns diagnostics. |
| Stored graphs | One-shot migrations live in [server/scripts](../../server/scripts/README.md) and report unmigratable shapes. A stored definition carrying `data.compiled` with no canonical records fails clearly at the designer and activation. |

## Time and events (owner direction 2026-10-27, target state)

| Aspect | Law |
|---|---|
| Wait/delay | A process can park its control flow until a dateTime and continue from the same token; a parked run survives and is woken by the platform, and the wake contract is the same boundary async command effects park on. |
| Fire on date | A process can be started by time (authored date or schedule on an entry), beside the manual start. |
| Event values | Events are values a graph can construct, deconstruct, and carry through data sockets (typed payload, occurred-at). |
| Event emission | A process step can emit an event; an emitted event starts processes authored to receive it. |

## Structure

| Modules | Role |
|---|---|
| `index.js` | public barrel over the boundaries below |
| `types.js`, `node-catalog.js`, `operations.js`, `ports.js` | protocol, catalog, operation registry, socket handles |
| `authoring.js`, `designer.js` | authoring seam; declaration-tree compilation (`compileTreeDeclarations`) |
| `compiler.js` | top-level normalize → validate → compile orchestration |
| `normalization.js` | process-definition and node/input normalization |
| `validation.js` | process, input, and lineage validation |
| `workflow-compilation.js` | lifecycle normalization and workflow compilation |
| `compiler-core.js` | normalization and compiler algorithms, plus compiled contract generation |
| `access-compilation.js` | role/assignment access compilation |
| `access.js` | role-assignment resolution and read projections |
| `screen-compilation.js` | compiled screen projection and inferred-screen assembly |
| `screen-analysis.js` | authored-versus-inferred screen redundancy detection |
| `screen-contract.js`, `ui-contract-projection.js`, `assignment-bindings.js`, `contract-diff.js` | screen contract, manifest projection, binding discovery, Apply diff |
| `evaluator.js`, `data-tree.js`, `orchestration.js` | dataflow evaluation, packet-tree solver, control plane |
| `transpiler.js`, `missing-field.js`, `migration-v4.js`, `migration-producer-identities.js`, `capabilities.js`, `hierarchy-utils.js`, `test-support.js` | round trip, missing marker, persisted rewrites, helpers, fixtures |

## Laws

| Consumed contract | Home |
|---|---|
| Declaration language and registry view projection (states, guards, field policy, graph protocol, `projectDomainFromView`) | [CTS SPEC](../cts/SPEC.md) §4 §6 §7 §13 §14 |
| Readable principals, party wire | [CTS SPEC](../cts/SPEC.md) §13; [server/runtime](../../server/runtime/README.md) |
| Workflow transition validation at runtime | [server/core/machines](../../server/core/machines/README.md) |
| Per-state field-policy display map | [shared/ui-mapping](../../shared/ui-mapping/README.md) |
| Designer surface and connection gate | [components/process-designer](../../components/process-designer/README.md) |
| Process runtime law (contract generator, audit trail) | [root SPEC](../../SPEC.md) §19 |
| Workspace package map | [packages SPEC](../SPEC.md); [packages README](../README.md) |
