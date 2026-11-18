# COMPONENT: @perigram/processes

Parent: [packages README](../README.md). Target-state contract list:
[SPEC.md](./SPEC.md).

CTS declarations, process operations, and procedural/plugin operations are
domain contributions to the shared graph foundation. The canonical persisted
graph document, node/port contract, provider registry, compatibility rules,
and procedural evaluator are owned by [@perigram/core](../core/README.md#canonical-graph-documents),
[@perigram/plugin-sdk](../plugin-sdk/README.md), and root [SPEC §28](../../SPEC.md).

The existing CTS process-definition record shape and compiler are a legacy
migration source. They preserve domain-specific declaration, authorization,
and workflow semantics while being adapted to the canonical graph model.
The Plugin SDK owns the provider-neutral compatibility registry; Processes
registers the CTS-specific compatibility profile because its nominal type,
block, access, and cardinality rules belong to this domain. The process
execution profile may retain durable scheduling and lifecycle semantics,
but consumes the shared graph and node contracts. No second generic graph
format, socket algebra, provider registry, canvas protocol, or subgraph
mechanism belongs here.

Executable records remain species records from authored graph through
resolution, validation, compilation, orchestration, server execution, and
round-trip. `operationKindOf` is a classification helper; the species kind
and its socket contract stay authoritative. Producer outputs belong only to
actual entity origins; reads and consumer effects use the bound type's
declared workflow.

The primary palette admits CTS semantics and explicit process intent. Raw
storage-id lookup, producer-path joins, per-node packet matching, and
transport adapters are compiler concerns, hidden from authoring.
Type-changing traversal selects a declared children/parent/relation edge and
exposes that edge's exact target type. Plugin projection and service
contracts contribute plugin-owned palette groups through `pluginPaletteGroups`;
projection entries deduplicate by provider, declared group, and projection id, while
service entries retain their provider-qualified operation identity and preset. Group ids are provider-qualified; services and projections share the same `palette: { group, label, keywords, visible }` declaration, so equal group slugs from different plugins never merge. `visible: false` keeps construction and synchronous projection helpers out of graph-node discovery. Ungrouped visible plugin services fall into that provider's Operations section. The surface search
indexes labels, descriptions, operation ids, group ids, and provider-authored
search terms.

The canonical procedural node-provider contract is owned by [@perigram/plugin-sdk](../plugin-sdk/README.md#node-provider-palette-contract). The process adapter declares each operation's semantic palette group explicitly from its catalog family; graph palette categories are not inferred from operation-id prefixes. The canvas node's group label is projected from that same definition.

## Authoring seam

A process definition is data and its authoring path is one seam:
`createDefinitionAuthoring(domain, capabilities, seedData)` (`src/authoring.js`)
composes a definition exactly the way the designer does. The designer page
and its composables are a presentation adapter over this seam: everything
authorable in the browser is authorable headlessly, and a headlessly
composed definition loads in the designer as a first-class draft. A
headless drop takes the next slot of a default grid, so a composed
definition renders readably.

Each gesture has its removal twin:

| Gesture | Authoring | Removal |
|---|---|---|
| Declaration tree | `declareClass`/`declareField`/`declareTypeRef`/`declareState` plus `wireDeclaration` (declares/targets/children/binds/entry wires), gated by `declarationWireLegality`, interpreted by `interpretDeclarationEdges` | `unwireDeclaration` |
| Palette drop | record factory + preset; a construct's type binding is its `binds` declaration wire (class or type reference wired onto the construct) — `configure` refuses `typeId` on a construct and validation reports an unbound one | `removeNode` — removes the node with its record, its wires, and the producer outputs it anchored (join selections pointing at removed outputs reset) |
| Record configuration | the same writes the inspector performs — record semantics, socket input defaults (typed scalars; the entityRef picker writes `{type, id}`), and the declaration nodes' authored fields (state `value`/`label`/`severity`/`icon`, class `name`/`glyph`, field `name`/`descriptor`) | — |
| Connection | the canvas host registers the Processes CTS profile (`port-compatibility.js`) with the shared Plugin SDK registry; the headless seam applies the process socket rule (`processSocketsCompatible`) to the legacy socket dialect; both check nominal type, block, access, and cardinality. The authoring adapter still projects legacy `data:<id>` and `control:<id>` handles until G10 removes that storage vocabulary; typed source inference remains a process-domain authoring rule | `disconnect` |

An effect's trigger mode derives from the graph on every sync
(`effectTriggerFor`): a wired event socket wins; an unwired entry with an
authored `trigger.schedule` starts at its time, one with an authored
`eventId` starts on that event, and the rest stay manual.

Children wires land child-first — `wireDeclaration(childId, parentId,
'children')` wires the child's output into the parent's declare input — and
accept type-reference children, so an org type's containment may name pack
types, other registry types, and itself (recursive containment, SPEC §6).

A definition whose vocabulary is declared in-tree follows the Apply shape:
compose the tree, post its compiled declarations, then re-seat the seam on
the overlaid domain (`withDomain`) and compose the graph over it.

`seedData` (a stored authored document) re-seats the seam onto the existing
graph — authored keys only, activation-written records stay out — so the
same gestures edit a stored draft as compose a fresh one (the agent-bots
tool catalog's `edit_process_definition` rides this path through the
definition service's `editDefinition`).

Authored socket defaults and relation selections survive a vocabulary
gap: a node whose bound type the current domain lacks keeps its authored
selections until a full-domain sync re-derives the ports; validation owns
the unknown-type report.

Save floors — the save seam rejects what they flag and persists the
collapse; semantic validity stays with the validator:

- `graphIntegrityProblems(data)`: nodes carry a unique id, a canvas type,
  and a numeric position, and address their processNodes/ctsTypes records;
  edges address existing nodes.
- `graphEdgeSocketProblems(data)`: every data edge handle addresses a
  socket the addressed record carries.
- `collapseEffectAccessGrants(data)`: an effect's access collapses to its
  primary grant; `configure` writes an effect's access as the lane gesture
  does — one grant.

Every palette item must drop, configure, and round-trip through the seam
headlessly — pinned by `authoring.spec.js`, which walks every palette item
and the canvas double round-trip.

### Declaration graph

The declaration graph uses Class/Field/State/TypeRef nodes and typed
declaration edges; `declarationWireLegality` and `declarationNodePorts`
are its only connection contracts. A state node is a flat lifecycle
value (SPEC §7): an `entry` wire into a construct's or transition's
state socket authors that operation's state — the construct's initial,
the transition's target, the wire being the value — and a `nested` wire
into another state's state input nests under it (the wire's source is
the parent). Transitions are operation nodes; the from-state is the
arrival state on the transition's entity wire. `compileTreeDeclarations`
posts classes with their fields and children edges — state records
declare no type facet — and draft acceptance calls
`declarationsFromCtsRecords` with the same declaration graph, so nested
state and edge semantics match between preview and APPLY.

A class node's transient `data.migrate` carries SPEC §11 migration steps
until the declaration post consumes and clears them. Authored field names
are free text in any script; the row key derives at the CTS seam
(`rowFieldId`: latin segments in lowerCamelCase, else a stable digest of
the name) and the name lands as the descriptor `label`. The class
inspector
authors the record-naming field as a dropdown over the class's field nodes
— the single-holder `identifier` move, with the empty pick leaving it
unowned and the declaration carrying the identifier compile error
(SPEC §4); the field inspector authors the name
and the row descriptor, and display tokens derive. Declaration binding
edges are live channels interpreted over the declaration graph, while
process species records persist the resolved type and retain their
executable ports.

Generic construction exposes declared row fields and declared construct
operators: mode inputs are the operator's record fields, and the
construct-addressable lineage/relation edge inputs ride every mode beside
them (`constructionInputsForContract` is the one derivation the catalog
ports, the compiler's construction normalization, and the designer's node
sync share). An unbound lineage input takes the entity of its declared type
among the construct action's context entity and that entity's ancestors
over the declared containment; explicit input data and typed entity context
take priority.

Compiler-side construction normalization lives in `src/construction-compilation.js`;
`node-catalog.js` remains the owner of mode and edge socket derivation. The
compiler merges authored prompts with that declaration contract without
maintaining a second input vocabulary.

### Services

Services expose registered V→V signatures — a service node is an effect
species: the event contract (`control:in` → `completed`) wraps its
signature-derived data sockets; a `list` signature field projects as the
element-typed socket with List access (a runtime collection, so aligned
item sources and single broadcast items wire in past the packArray
boundary); an output `ref` field projects as a typed entityRef socket.
Input signatures are ref-free (`Ref` is a value, SPEC §2; dereferencing
belongs to the projection, SPEC §8 purity). Signature ports resolve from
the projected domain's `serviceContracts`, read from the contract on every
sync pass: the designer replaces its domain when the served organization
projection (mounted packs plus installed plugins) arrives, and a service
node loaded before it re-resolves its ports. An unknown operator is a
compile-time diagnostic. A type configured on the service node binds the
derived run action to that type's screens — the run button executes
against the opened instance, and the command's scalar parameters are its
prompted inputs. Palette translations are presentation only; generated
action captions derive from typed declarations. Callers provide the
current semantic graph directly, protocol version included.

Draft preview evaluates a value service as a data node (SPEC §28): in
preview scope, with a `previewService(operator, parameters)` channel on
the evaluation environment, the service's signature inputs resolve from
the graph into one parameters record (a list field passes its whole
list), the channel dispatches, and the returned value becomes the
`result` packet — memoized per output for the pass's fan-out consumers.
Runtime scope keeps services opaque to the dataflow evaluator: the
effect executor owns execution there, and downstream reads wait for the
completed step's outputs.

Signature fields may declare a value `kind` (a namespaced slug,
`document.report`): the socket carries it and compatibility gates on
it — a kinded socket accepts its own kind alone, an unkinded `json`
socket is the universal acceptor, and the universal `toJson` coercion
skips kinded targets, so converting between value kinds stays an
explicit operation the graph shows (the same lattice `entityRef`'s
typeId already uses).

## Designer round trip

Process definitions use canonical semantic records as the editing source of
truth. `definitionToCanvas()` projects process nodes and status definitions
into deterministic Vue Flow nodes and `canvasToDefinition()` writes canvas
layout/edges back; deleting one of those canvas nodes deletes its record.
Every other record kind — producer outputs, actions, services, sockets,
value inputs — is panel-owned: it survives the canvas round trip untouched,
so focused panels own its lifecycle.

Canvas projection identifies records by both node type and stable semantic
reference. When a derived action and its executable effect share an id, the
saved executable node keeps its graph id and the definition-plane node
receives a namespaced canvas id; both retain the same `data.refId`, so both
survive round-trip validation. Declaration records (`ctsTypes`) project
with their full authoring key set — a class/type binding normalizes to a
non-empty string or `null` on both halves — so an authored record survives
the canvas cycle byte-identical. Field-node descriptors carry the SPEC §4
display dictionary (`label`/`display`/`control` plus the closed
`identifier`/`depiction` flags) verbatim, and class nodes round-trip their
authored `glyph`.

`validateRoundTrip()` verifies round-trip stability before activation: the
normalized definition is cycled definition → canvas → definition twice, and
the first-generation result must equal the second (canvas nodes legitimately
carry defaulted presentation data — glyphs, severities — the paired records
never materialize, so the comparison targets the generations). Idempotence
still catches real projection loss: a pipeline that drops or rewrites
semantics never stabilizes. Vue Flow node positions are presentation data;
runtime behavior comes from the semantic records.

The designer removes incoming data edges whenever a node contract change
removes their target socket, deriving a filtered edge list off the reactive
canvas state before serializing a draft, so saved drafts carry only live
edges and preview recomputation stays acyclic.

## Palette

The grouped authoring palette arrives through
`createProcessDesignerContract(domain)`, the framework-owned projection for
visual process designers: a designer supplies one `defineDomain`-shaped
implementation — the shipped source is the CTS registry view projected
through `@perigram/cts` `projectDomainFromView` (CTS SPEC §13) — and
receives normalized entity, workflow, command, task, event, hook, effect,
attachment-kind, construction, field-policy, field-group, canonical-block,
and grouped-palette contracts. The generic designer package imports no
concrete domain.

The palette law is owned by CTS SPEC §8; the designer-facing facts: groups
cover declaration items, type-bound constructs, effect species, typed
instance sources and navigation (generic read presets, bound at configure
time), values, list/tree algebra, flow, and pack-owned plugin tabs
(`packPaletteGroups`; a packless service falls back to `servicesPaletteGroups`)
— a pack's declared data operations (the documents pack's `table-data`
tab, the facade pack's `facade` tab) surface pre-bound in the pack's own
section. Every palette group carries its registration provenance
(`source: 'pack' | 'framework'`) — declared by the group's projection,
never inferred from its id or label — and the palette renders the pack
tiers first. The `instances` group carries the pinned-entity source: a
`source.literalItem` pre-typed `entityRef` whose value is one authored
instance pick — the exact-record producer a graph wires into any
construct's ref sockets (the create dialog drops the supplied row).

The value and list/tree groups are exhaustive over the catalog's
author-facing basics (SPEC §8): every
tree-algebra kind (flatten, graft, simplify, branch, zip, unzip, cross,
transpose, clean, stats), the list reshapes (reverse, shift, partition,
reduce), the value utilities (cast, select, convertUnit, coalesce,
format, required, validate), and the current-time source are palette
items. `value.string` owns parsing (`toNumber`, `toDateTime` — string in,
typed value out; `value.cast` asserts shape and converts nothing). The
fixed-arity `collection.makeList` and the persisted-array boundary
(`collection.packArray`/`unpackArray`) stay catalog-only: a graph reaches
stored reference arrays through declared-edge reads (`cts.read
select=related` resolves stored refs into an entity stream).
`control.switch` and `control.fork` stay catalog-only beside them: an
equality dispatch composes from `control.if` chains, and fan-out is the
multi-wire gesture — every effect's `completed` output wires to each
consumer. The palette keeps the branch, the rendezvous
(`joinAll`/`joinAny`), the loop pair, and the terminals.

Record-carried semantics are configured on the record through the seam and
the inspector:

| Item | Configuration |
|---|---|
| `source.literalList` | An authored list literal is a value; lives in the values group. |
| `collection.join` | Keys `leftKey`/`rightKey`. |
| `value.recordField` | `path` plus authored output type. |
| `value.cast` | Authored output base over the re-base vocabulary (json, record, list, string, number, boolean); the input is the universal json acceptor, so every source wires in and the node asserts the value already matches the target base. |
| `value.required` / `value.validate` / `value.coalesce` | Authored operand base (`type`). |
| `value.format` | Authored operand base (`type`) plus `template`; an empty template formats numerically. |
| `value.convertUnit` | `fromUnit`/`toUnit` over the convert unit set (the shared factor table in the operation registry). |
| `record.construct` | `fields`. |
| `value.format` | Template with named `{key}` slots substituted from a wired record (missing keys keep their placeholder, `{value}` from the value input); template-free formatting is numeric. |
| `forEachEntity` | Authors the loop PAIR: dropping it creates `control.forEach` and its `control.forEachEnd` closer. |

One home per operation (SPEC §8): `value.compare` owns value comparison and
`value.logic` composes boolean algebra (the null tests stay on it as unary
boolean tests). The polymorphic kinds (math, string, dateTime, compare,
logic, list reduction) carry their operations in one registry
(`operations.js`: sockets and evaluation per operation); the catalog's port
projection, the evaluator, and the authoring defaults derive from it.
Numeric list reductions (`collection.reduce`: sum, average, min, max) join
the collection family.

Current species ports mint `entityRef`; the `entity` spelling lives in the
persisted-v4 compatibility tier and the wire coercion (`types.js`), and
producer-output acceptance recognizes both spellings.

### Readable principals

Party types (`user`, `organization`) project as readable principals under
CTS SPEC §13; the party wire and its membership gates are owned by
[server/runtime](../../server/runtime/README.md). The processes-specific
facts: the `source.currentUser`/`source.currentOrganization` palette items
resolve the acting user and the active organization from the run context at
execution (fixed `entityRef` outputs, no binding — the party twin of the
current-time source); the capability projection emits list/getById only for
party entities whatever the raw service bindings advertise; and validation
refuses `cts.construct`/`cts.mutate`/`cts.transition`/`cts.remove` bound to
a party type.

## Compiler and validation seams

Compiler implementation is separated by responsibility:
`normalization.js` owns authored process-definition normalization;
`validation.js` orchestrates diagnostics; `workflow-compilation.js` owns
lifecycle and per-output workflow compilation; `screen-compilation.js` owns
screen projection and inference, child-region composition, screen merging,
and navigation; `screen-analysis.js` detects redundant authored screens;
`access-compilation.js` owns role/assignment access compilation; and
`access.js` owns role-assignment resolution and access projection.
`action-labels.js` owns action target-state resolution, user-facing action
captions, and the domain type-label lookup. `graph-normalization.js` is
legacy process-definition storage normalization only; it is scheduled for
removal with the one-time canonical graph migration (root SPEC §28 / TODO G10).
`compiler-core.js` retains shared compiler primitives and the remaining
non-screen compilation algorithms. `index.js` is the public barrel — there
are no forwarding-only modules presented as architecture boundaries.
The compiler turns current species records into runtime contracts for access,
screens, navigation, declared workflow overlays, field policy, actions,
services, and sockets.

`prepareAuthoredDefinition` resolves CTS ids and declared row paths through
`@perigram/cts` `resolveCtsDefinition` (canonical contract:
[cts README](../cts/README.md), SPEC §14) and runs the declaration binding
checks beside it; authored definitions speak the current species
vocabulary.

### Diagnostics

`validateProcessDefinition` returns a `diagnostics` array beside `errors`,
each record carrying `{ message, nodeId?, edgeId?, socketId?,
producerOutputId? }` graph anchors. Edge, join/convergence, required-input
availability, and lineage-binding diagnostics emit anchors; `errors` strings
remain the derived `message` list. Diagnostics name process nodes the way
the designer renders them — the humanized catalog operation label plus the
canvas node id, with an authored node label winning. The activation adapter
merges the package diagnostics with the availability and lineage passes, so
validate and activate responses carry one anchored diagnostic list the
designer can focus.

Validation also emits non-operational warnings: any process node whose
values cannot reach a persistence effect (reverse reachability over graph
edges with the effect species as the operational sinks) is reported as
inspect-only through the compiled `warnings` channel the designer renders —
an intentionally inspectable pure-data subgraph stays valid while being
surfaced as a dead-end diagnostic. A manual action no compiled role
carries (authored grants, lane wiring, and the current role catalog
resolved together) warns the same way: its action compiles, and no role
can see or run it.

### Required inputs

Required inputs have exactly one availability contract, enforced at
activation by `validateRequiredInputAvailability` after
`validateProcessDefinition` and type/access inference. Species records
classify through `operationKindOf`: a `cts.construct` carries the
create-effect availability contract and a manual `cts.service` prompts like
the command effect it is; manual species effects are entry triggers for
reachability the same way. A required input is satisfied by a connected
upstream value, an authored `inputDefaults` fallback, a domain-owned
`default`, a generated manual prompt (manual actions only), or the run
context (manual actions only); a prompt serves manual actions alone, so an
event-triggered effect must be complete on its own. Control nodes with
required data inputs (`control.if` condition, `control.switch` value,
`control.forEach` items) run under the automatic-path rule: a wire, a
fallback, or a domain default. The emptiness rule is
shared by authored fallbacks and domain defaults: `null`/`undefined`
satisfy nothing; an empty collection or attachment fails a required
entity-list/attachment input; an empty string or zero satisfies a required
primitive where the domain type permits; entity and block values must be
non-null references, and enum/status values must be declared members. On a
List/Tree-declared socket
only an actual array or data tree uses the collection rule; a scalar
fallback is one broadcast item and satisfies by the scalar rules. When the
construction contract declares the `name` row, that row is the identity
source for a generic create.

### Construction contracts

Compilation hydrates create-action construction and prompt policy from the
domain construction contract: a sparse visual action for `cassette`
(editor protocol) compiles with zero prompted inputs — its editor surface
owns the create — and an `xlsx-workbook` upload action prompts its
payload file alone. Domain construction
contracts own structural input metadata during compilation — field id,
label, path, type, and accepted entity types come from the current domain
registry; process projections preserve the domain-declared `required` flag,
and an input whose domain contract declares a `default` projects as
non-required. `resolveConstructionMode` (`node-catalog.js`) resolves the
executed mode everywhere — the authored mode when the contract declares
it, else the contract default, else the first declared mode — shared by
the catalog port projection and the server's effect boundary, so ports,
drafts, and effect execution speak one mode; a stored mode outside the
type's current modes normalizes before compiling.
Compilation discards construction inputs and prompt fields the current
domain contract has retired, drops a canonical block whose fields the
current schema has all marked non-constructible (blocks the schema disowns
stay validation errors), and normalizes derived relation actions' embedded
creators from the same current contract.

Missing domain construction stays `null` through normalization and
validation, so Create Entity and Run Producer reject an entity or mode the
domain construction registry does not declare. Effective creation authority
is the intersection of declared modes and registered runtime handlers
(`projectEntityProcessCapabilities`): `createModes` is that intersection
and `create` follows `createModes.length > 0`. Typed constructors such as
baked cassette designs or OCCS template creation are bound to named
handlers at the application registry. Derived entities stay outside
generic Create; domain constructors project as fixed producer-service
effects (`bakeCassetteDesignFromTemplate` delegates to the cassette
template construction service with its own typed inputs). Ancestry is
validated from typed Lineage composition and compiled from actual graph
edges; root creation is an owning-service decision.

Compiled creators always carry attachment kinds as the expanded `[{ kind,
creation }]` array: the domain-authored `'userCreatable'` selector is
expanded during compilation even when an authored action node re-declares
it verbatim, so clients and services consume one shape. Canonical block
composition suppresses separate typed inputs only for `genericCreate` and
only when block data arrives from the graph — a composer wired into one of
the create's block sockets; the `blocks` list persisted on construct nodes
is the designer's presentation of the type's canonical blocks, and a typed
constructor keeps its domain-declared service inputs beside any canonical
blocks it accepts.

### Relations

Relations composed by the process graph are executable process contracts. A
manual effect that consumes a composed relation derives one `Link
<relation>` / `Unlink <relation>` pair per authored relation entry for the
owner action surface: the caption names the relation's authored field
label, the prompt accepts every declared target type of the entry (an
authored ref field may wire several targets — the union stays one entry and
one storage key), and Unlink receives the already-rendered target reference
and renders inline at that reference
([shared/ui-mapping](../../shared/ui-mapping/README.md)). The pair belongs
to the entry — the first manual action over it owns the derivation. The
compiled contract carries the relation key, accepted target types,
cardinality, the declared target domain (`where`, CTS SPEC §6 — pickers
offer what writes accept, and the write boundary evaluates the same
expression), and access grants (each accepted type's read); an entry
declaring `unlink: 'delete'` rides the compiled Unlink action's
`relationMutation.unlink` (Link actions carry no policy); array
cardinality is inferred from the typed Collect Array output when the entry
sits outside the global domain relations, and a same-target domain relation
leaves an independently authored graph entry its own key.

A relation entry fed by a typed Create Entity effect retains that effect as
its embedded creator: it is authorized and executed through the Link
action, and its connected entity source and containment path define the
eligible existing targets and creator sources in the current owner context,
so generated pickers stay inside that context. A relation entry on a
payload-bearing type may select declared upload-backed attachment
kinds (the payload-trait projection keyed by type id; an empty
selection uses every upload-backed kind the domain declares); the
creator contract sits on the Link input with role-scoped write through
the same action window. Command- and workflow-produced kinds are
separate process effects.

### Create and update effects

Create and update effects own zero leaf mutation fields. Create consumes
constructible typed blocks plus a dedicated status value; Update consumes
an entity, connected modified/replacement blocks, and status — only values
present in connected blocks reach the owning feature update boundary.
Compose and Modify Block own field selection and inline primitive
fallbacks; collection changes happen in list/tree nodes before the block
socket. At Create, an open canonical block is accepted when the target
entity declares that block, and authored open entries stay open entries at
both node-level and connected-edge validation; fixed-field blocks validate
every selected path against entity constructibility, with managed Origin,
Status, Provenance, and Summary excluded. A manual Update fed by a modified
Relations block compiles and renders like every other generated
entity-detail action; manual screen input policy is traced from connected
block composers, so generated forms and graph execution use the same field
contract.

### Parent contracts

Parent contracts are valid only when the domain declares a child lineage
relation for the created entity; entity-typed construction inputs are data
inputs (cassette-design `templateId` is a constructor input). A graph edge
connecting an action output to another action's `parent` input is
authoritative over stored parent metadata; a root create action carries a
generic optional parent socket for canvas connectability, and compilation
treats a parent as semantic only when it resolves to a real parent entity
type. An unsupported parent edge (`queue -> create sheet_design`) is
ignored and compiles an unparented target-list create; a create whose type
can take a lineage parent but whose graph has none strips the stale parent
and exposes a root create — the runtime entity service decides whether
organization-root creation is valid (queue creation creates
organization-root lineage). A create action always compiles onto its target
entity screen, so users can create the target from that list with a parent
selector when needed; the parent entity detail screen receives the action
as contextual chrome when the parent contract is a valid lineage relation,
and detail screens carry actions for the opened entity (status/update
transitions) plus valid contextual parent-child creation. One create
affordance renders per (type, construction mode, initial state) on a
surface: the first compiled create owns the button while same-shape sibling
constructs stay executable actions.

### Apply diff

`contract-diff.js` owns the semantic Apply diff between two compiled
contracts: `diffProcessContracts(previous, next)` reports added/removed/
changed actions (with the changed semantic fields), screens, and role
grants; per-type-id CRUD capability changes; per-producer workflow changes
(states with region prefixes, `from->to` transitions, entry states);
field-policy section changes; and `removedInstanceStates` — primary-region
statuses whose removal strands live entities, computed per entity type as
the union of that type's producers. `hasProcessContractChanges` is the
emptiness check. The diff is pure over compiled outputs; callers recompile
both sides. Stored active process definitions keep a compiled activation
snapshot for inspection; auth hydration and manual action execution compile
the current canonical process graph at access time, so visible actions and
executable actions come from one compiler version.

## Workflow synthesis

Lifecycle machines are authored vocabulary only (SPEC §7: graph-derived at
compile). A producer's machine compiles from the draft's state records (the
state vocabulary), the construct's authored state default (the machine
entry), and its transition nodes' authored targets: a transition node
declares its target, and the machine edge is the concrete state-to-state
pair declared by the wiring — the from-state is the arrival state of
instances on the transition's entity wire (the upstream producer's output
state, derived from the wiring's status windows at compile), the to-state
is the node's target. A state node wired into another state node's state
input becomes that state's child, so the compiled machine is a recursive
tree with canonical dotted paths in which a parent state is itself a leaf
(SPEC §7). The transition inspector authors the target only; at execution
the status engine validates the operated instance's current state against
exactly the declared edges.

One derivation feeds every from-state consumer: `declaredTransitionSources`
— the arrival states on an action's entity wires (an authored `from` reads
as fallback input) — feeds the machine edges (both compiler branches), the
compiled action's status window (`state.from`, carried through the manifest
projection), and the client's action filter, so a transition's button
appears exactly in the states its wiring declares. The scoping fact is
kind-general: any state-bound effect wired from a single arrival state
scopes by it (a delete wired from one state renders only there; wired from
several states or unwired, it stays unscoped and the server runtime still
guards execution).

Only status-mutating actions compile machine edges; deletes compile none.
When the machine compiles no edge for an exposed status-mutating action (a
no-op arrival-to-target pair), the action reaches neither the compiled
execution channel nor the manifest, so surfaces offer only transitions the
runtime would execute. An event-triggered transition's edge compiles as
process-owned (`processOwned: true`): the orchestration executes it, manual
surfaces omit it, and the trigger mode, the availability window, and the
edge carry one ownership fact. A producer whose type declares no states
compiles no machine — instances of such types are stateless, creation
writes no status, and the status runtime refuses transitions for them.
Creation without an authored state default stamps the compiled machine's
entry; every region stays independent, and recursive state trees stay
nested inside their region.

When a single status-mutating update action is reused from several source
states (`Создано -> Отправлено`, `Отклонено -> Отправлено`), the compiled
workflow emits one transition per source state with the same target status
definition and the executable role window from each source edge. At
runtime, a command output wired into a downstream status-mutating update
node receives that process-authored target state after the command returns
its entity refs — the state projection derives from graph edges and typed
output handles (`output:nesting_run`).

### Guards, actors, field policy

Guards and actors are authored under CTS SPEC §7; the processes half of the
contract:

- A transition node's `guard` (boolean expression AST over `{ value }`,
  row-relative field paths) rides the derived action onto the machine edge
  — the first declaration of an edge owns it. The declaration-check seam
  row-checks its paths and restricts its vocabulary to the boolean
  expression subset. The status runtime evaluates it at commit and hides
  guard-failing edges from action availability
  ([server/core/machines](../../server/core/machines/README.md)). The
  transition inspector edits it as a flat all-of/any-of condition list — a
  projection of the same AST, with field picks derived from the bound
  type's projected rows as row-relative ids.
- A transition node's actor assignment: the user-typed `actors` input takes
  assignees from a wire or an authored socket default. At execution the
  effect adapter writes the resolved users into the transition context's
  lifecycle actors; the status runtime persists them and the actor guard
  governs later transitions (an assigned actor is the only caller who may
  move the instance; availability hides actor-denied edges).
- A state record may declare a `fieldPolicy` (SPEC §7/§10): `{ visible?,
  editable? }` row-field whitelists that ride the compiled workflow state
  beside the display policy. The facet authors beside the guard on the
  typed operation (SPEC §7): a transition carries its target state's
  policy, a construct its initial state's; the first declaration of a state
  owns the facet, and state nodes carry display policy only.
  `normalizeStateFieldPolicy` (in `designer.js`, re-exported with the
  authoring seam) is the one normalization home; the declaration-check seam
  row-checks the lists against the bound type's rows and refuses `editable`
  outside `visible`. The instance write boundary enforces `editable` (and
  `visible`, since an invisible field is uneditable); display surfaces
  filter by `visible` through
  [`shared/instance-field-access`](../../shared/README.md) with the
  per-state map derived by
  [`shared/ui-mapping`](../../shared/ui-mapping/README.md)
  `stateFieldPolicyByType`.

### Status definitions

`cts.transition` consumes an entity reference and the typed target state on
its state socket (a `note` rides the optional note socket; an archive
intent is expressed by `record.archiveIntent`). A status definition
projects one typed `status` output into the authoring graph; the persisted
wire stores the stable definition reference while execution resolves its
current status id. Status definitions compile into workflow state metadata
(`label`, `color`, `severity`, `icon`) and into the compiled action target
state, so runtime execution and UI status rendering use the same value and
visual metadata. A definition may declare an optional `parentStatusId`: the
child compiles as a nested workflow state under that parent and flattens
to its dotted id with its state `path` (`PRODUCTION.cut` ->
`['PRODUCTION', 'cut']`), selected and targeted like any other status
value; unknown or cyclic parents are validation errors naming the
definition. Definitions carry lifecycle evidence schema (`description`,
`attachments`, `snapshots`) onto the generated workflow state: runtime
status actions use that schema to require operator notes, store proof
files as entity attachments, and capture declared relation snapshots when
the transition enters the state. Status definitions are entity-agnostic by
default: when a referenced action creates or transitions a concrete entity
type, the compiler adds that target state to the entity workflow and
applies the referenced metadata and lifecycle schema there. The same
display metadata is preserved on each compiled role action manifest entry
(`role.actions[].status`) for generated screens, and status-mutating update
action labels derive from the target status definition label (or the
target state id) whenever the authored label is a generic palette
placeholder.

## Producer outputs and lineage

An entity-emitting origin socket is identified by `producerOutputId =
nodeId:outputSocketId`. Only construct and entity-producing operator
origins create producer outputs; reads, field projections, and consumer
species mint none. A producer output owns field policy, lineage/provenance,
and an optional overlay of the bound type's declared workflow.
Existing-instance consumer actions may omit a producer output and execute
against the bound type declaration; a present `producerOutputId` must name
an output of the same type. Consumer actions resolve their type from the
entity input and may carry an upstream `producerOutputId` for
field/lineage policy; lifecycle comes from the CTS type declaration. Every
lifecycle region derives its entry from the CTS declaration, and a
transition action references a declared transition, carrying its process
roles as execution authorization. Multiple same-type streams are ordinary
typed list dataflow. Each compiled producer output owns its field policy:
`read` fields are public display fields, `write` fields require write
grants, `private` fields require admin grants.

### Lineage bindings

The compiler emits `lineageBindings` from graph edges: each binding carries
`{ childTypeId, parentTypeId, lineageKey, producerOutputId,
sourceProducerOutputId, sourceNode, sourceSocket, consumingNode,
consumingSocket }` — `producerOutputId` is the consuming Create/Run
Producer output and `sourceProducerOutputId` the entity-emitting source
output, so same-type producers keep separate bindings and deduplication
uses the full identity. The child type derives from the wired entity
consumer, so persisted composers carry no manually selected
`targetEntityType`.

Composition path: a Lineage ancestor socket derives both its entity type
and canonical camel-case id key from the connected entity output (`project`
becomes `projectId`), and definition normalization repeats that inference
so a saved graph is independent of inspector state; parentage stays a field
of a composed Lineage block. Native species path: a construct's
construct-addressable `lineage.<lineageKey>` input (the domain-derived
construction input a declared parent edge exposes, persisted on the record)
receives the producer's entity output through a `data:lineage.<lineageKey>`
edge, and `compileLineageBindings` emits the same binding — the input's
declared entity type backfills an ancestor the wire cannot resolve.

Compiled lineage bindings are the authoritative hierarchy contract for the
active process; access scoping and grant windows read them alone.
Presentation placement — home eligibility, root scoping, inferred child
regions, contextual action placement — reads the merged hierarchy view:
compiled bindings first per child/parent pair, then org-authored children
edges (containment triples the domain projection marks `declared: 'org'`),
so containment declared on the org's own types places child collections on
its own. The client explorer merges the same two sources through
`useEffectiveContainment`. Once resolved, the compiler recognizes one
lineage entity reference as contextual parent scope while the effect
boundary persists its normalized id; fixed-field and open-entry composers
contribute to the same schema set. Persisted field paths resolve against
the effect's target entity schema first.

### Activation passes

Activation runs one further producer-scoped binding pass,
`validateLineageBindingResolution`: every `entry:*` edge into a Lineage
composition must resolve — the entry exists on the target record, the
source node resolves to a process record, the ancestor entity type is
derivable (source entity port, source record type, or entry declaration)
and is a type other than `organization`, and a lineage key exists for the
ancestor type. An entity-emitting lineage source socket must also resolve
to a producer output record — by exact `nodeId:outputSocketId` key, by
authored socket alias, or as the single same-type candidate — because
`compileLineageBindings` carries that identity on every binding as
`sourceProducerOutputId`. A native `data:lineage.<lineageKey>` edge into a
construct resolves by the same rules. Each error names the edge id plus the
responsible node, entry, and socket. Dataflow edge incompatibilities and
required-input availability errors carry the same producer context: an
entity edge error names the source `producerOutputId`, and a required
effect input error on a producer names `producerOutputId` beside the socket
id.

### Action records

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `updateEntity`, `runCommand`,
`emitEvent`, and `sendToOrganization` actions against the domain entity,
construction, field-policy, status-definition, value-input, and command
registries,
preserves their typed inputs/outputs and completion events, and emits
trigger contracts. `trigger.mode` is only the execution mode: `manual`
means a user starts the action from UI; `event` means another node's
completion event starts it automatically. Effect records derive the same
semantic action manifest consumed by screen and access compilation —
grants, trigger mode, entity type, fields, construction contract, command,
and status target are the same contract action evaluation and generated UI
use. Entry effects start runs three ways: manual (user action),
scheduled (authored `trigger.schedule`), and event-subscribed (authored
`eventId`, mode `event`) — an emitted event carrying that type starts the
subscribed entry, the event record riding the run trigger (the
`eventPayload` source, `source.triggerPayload`, reads it). Emit
(`cts.emit`) is the event-producing effect: a type string plus an
optional payload persist one `process_events` record and dispatch it to
every active subscriber entry.

Generic Entity creation accepts typed canonical block values. Entity-valued
sockets carry explicit element types. An open Relations entry authors its
stable storage key and element type, and the connected producer, downstream
consumer, and composer leave those choices alone; a single reference or an
intrinsic `array<entityRef>` composes like any other explicit value.
Selection, ordering, aggregation, append, removal, and replacement are
ordinary list/tree dataflow ahead of persistence.

## Screens and inference

Screen records are route-level UI entries attached to roles and the source
for process-composed app navigation; they compile into generated screen
manifests. A screen declares a fixed template (`typeList`, `instanceDetail`,
`table`, `formAction`, `home`, or app-owned system templates such
as `route`, `organizationOverview`, `organizationAccount`), typed entity
sources, template regions, required access, and manual process action ids.
Each source has a stable id and label, entity type, list/single loading
mode, independent required access, and the mode-specific loading contract:
single sources carry one scalar identifier; list sources carry a flat
scalar filter map and may carry the canonical compiled-lineage binding
fields. Each region has a stable id and label and independently selects its
template slot, source, registered domain display surface, and action ids.
Screen bindings are keyed literal string, number, or boolean values, or
valid `$assignment.<key>` references; the `supporting` slot is reserved for
generated/system templates with secondary accounting or history regions.

`screen-contract.js` owns the authored screen contract: normalization, the
canonical region surface registry (`SCREEN_REGION_SURFACES`: `card`,
`compact`, `detail`, `table` — the surfaces the generated
region components render), and pre-activation validation.
`validateScreenContract` runs inside `validateProcessDefinition`, so
`compileProcessDefinition` and the activation adapter reject malformed
screens before anything is compiled. Beyond template/source/region
membership it rejects:

- duplicate source or region ids;
- single-mode sources without a resolvable identifier;
- non-scalar identifiers and filter values, and filters that are not flat
  scalar maps;
- malformed or empty `$screen.*`/`$assignment.*` placeholders, and
  `$screen.bindings.<key>` references to bindings the screen does not
  declare;
- region surfaces outside the registry, region-level action ids missing
  from the process action manifest, and region slots outside
  `main`/`children`/`supporting` (others normalize onto `main`);
- bindings that can resolve to neither literal scalar nor `$assignment`
  reference at compile time.

Assignment bindings replace `$assignment.*` placeholders in screen routes,
authored scopes, bindings, source identifiers, source filters,
required-access scopes, and grant rules, so one user can receive
overloaded copies of the same screen for different projects or entities;
screens with incomplete bindings are skipped with compiler warnings.
`discoverAssignmentBindingRequirements()` walks those locations plus
process role/action access and returns each selected key with its scalar
type and contributing locations.

### Inference

Grants infer screens. For each role and entity type the compiler infers a
paired list/detail screen: each inferred role/entity list screen gets a
paired `entityDetail` screen with the same required access and action set
(opening through `screen.scope.instanceId`), and inferred `auto_*` list
surfaces seed the synthesized process `home` screen so the active process
opens on a stable home surface. Each inferred list screen carries its own
list region so class-level actions (the create button) render through the
same region mechanism authored screens use; both inferred surfaces take
the entity's authored render label as title. Grant-only inferred screens
are valid destinations. Domain entities marked `meta: true` are excluded
from inference — they represent organization configuration,
administration, or provenance; their grants still compile into effective
permissions, and an authored or system screen may expose them explicitly.
Inference resolves the grant's authored entity type directly, so types
sharing one collection (org-authored file-class types, for example) each
get their own screen; grants beyond an authored entity type resolve by
feature.

Inferred detail screens receive child collections from three declarations:
lineage children the merged hierarchy places under the type, parent-bound
creates, and declared `many` relations (each a relation-scoped list source
`<targetType>_<key>_related`, read-gated by the target feature). Child
collections ride as `slot: 'children'` regions — the one slot the
ui-mapping composer nests, so child collections render beside the record.
Single-target relations stay chip rows on the record body, and a relation
child region's key covers that chip row. A role with read access to both a
parent and a child entity receives the child region; the parent-bound
create action attaches only when the same role can execute it. The graph
input alone decides nothing here — it may be construction context: a
project-to-create-queue graph compiles the project detail screen with a
queue source filtered by the domain relation key `projectId:
'$screen.scope.instanceId'`, and the create-queue action attaches to that
child region; a cassette child collection appears only when the domain
summary registry declares cassette a project child. Entity-typed
construction inputs stay create-dialog fields or wired data sockets (a
cassette-to-create-cassette-design graph compiles a target-list action
with a `templateId` constructor input).

Typed create nodes expose their mode-specific constructor inputs together
with canonical constructible block inputs and `states.main`; canonical
blocks augment the entity the selected constructor produces.
Relation-derived actions are update actions: on an entity-detail surface
the opened entity is the implicit relation owner, and when the domain
declares one relationship for that owner/target pair, its key and
cardinality replace the composer's provisional socket-derived key.
Relationship context is separate from lineage: after a design is created,
the action runtime may link it through a declared domain relationship such
as `queue.relations.cassettes`.

### Home screen

Each user assignment with generated list screens receives a
compiler-synthesized `home` screen — a projection of the user's effective
access, prepended to the screen and navigation manifests as the process
start screen. Home sources are top-level entity-list sources only: when the
compiled Lineage projection nests one accessible list under another, the
child is suppressed from home and stays reachable through its own route or
parent detail context. Home regions keep the target list route and the
list-level manual action ids, so generated UI shows one horizontal section
per top-level entity with its matching process action buttons.
User-specific compiled screens use canonical generated routes under
`/screens/:screenKey`; home serves at the stable shell route
`HOME_SCREEN_ROUTE` (`/home`) under the per-user `home_<userId>` key, with
the original semantic route preserved as `sourceRoute`.

### Delta authoring

Inference owns default stations; authored screens are deltas that
customize exactly the station they equal in kind. Suppression is per
station kind: an authored `typeList` (template or kind) for a role + type
suppresses only the inferred list station, an authored `instanceDetail`
only the inferred detail, and any other authored template for the role +
feature (formAction, table, home, route, system templates) stands in for
both generated stations. A projection-equal authored screen only
suppresses an identical inference; `redundantAuthoredScreens`
(script-facing wrapper `detectRedundantScreens(definition, domain,
orgRoles)`) detects them by running the pure inference and comparing
normalized projections over exactly the fields inference sets — any
authored customization (label, route, bindings, extra sources/regions)
makes a screen distinct. Validation refuses a redundant screen
("duplicates the inferred station").

A process whose grants infer zero stations compiles to zero screens:
authoring is delta-only, and the designer Screens tab explains the state
(stations derive from role access grants) for such processes
([components/process-designer](../../components/process-designer/README.md)).

### Effective manifests

When an assignment contains multiple role ids, generated and authored
screens from every selected role merge into one screen manifest:
compiler-inferred role/entity screens stay separate per role and entity so
a multi-role user receives every matching operational screen, while
user-specific screen manifests merge generated screens by
entity/template/scope into one effective screen (`auto_cassette`,
`auto_cassette_detail`) with merged status windows and merged runnable
actions. Explicit screen records naming several roles compile to one shared
screen key. Inferred read sources are unstatused: wiring-derived state
windows ride the permission grants and gate state-changing actions, while
reads list every state (an authored status window still scopes that
screen's reads; the frontend turns an authored `rule.any` into
`primaryStates` filters, and the entity API enforces the individual
status-scoped grants when filtering records). A role holding multiple
grants for one entity feature aggregates into one feature-level read
source at the maximum read level. Authored screens keep their authored
`required` verbatim; `screen.required` is a frontend requirement —
compilation resolves all additive authored grants first and includes a
screen only when those grants cover its requirement.

Navigation compiles from the screen manifest. When a role has access
grants but no authored screen for that entity feature, the compiler
creates a generated entity-list screen for that role/feature so
process-active users stay on generated routes; role-level compiled screens
keep role-prefixed ids for audit and designer previews.

The per-user manifest speaks exactly one vocabulary: hydration projects
every screen and action record (`projectUiScreen`/`projectManifestAction`
in `ui-contract-projection.js`) — `id`, `actionKind`, `typeId`,
`parentTypeId`, projected templates (`typeList`/`instanceDetail`), and the
rich execution fields (`inputPolicy`, `relationMutation`, status window,
`contracts`, exposure `inputs`) under their own names. Both projections
spread the source record and override only the vocabulary keys; every
other authored or app key (labelKey, icon, systemScreens, systemActions,
scope contracts) rides intact. Compiled execution channel field names
stay server-side; the lineage-binding payload hydrates
with `childTypeId`/`parentTypeId`.

Create captions are procedural in both channels (`displayActionLabel`
compiled, `projectUiAction` projected): an authored label wins; a generic
one names the target class and folds a distinguishing construction mode —
`Create <Type> from <Mode>` on the compiled contract, `New <Type> from
<Mode>` in the manifest (`genericCreate` and modeless creates stay the
plain `<verb> <Type>` form). `creationModeLabel(mode)` derives the mode's
display name (`convertDxf` → `Convert Dxf`) and is the one home both
templates and the generated creation-mode row read.

Manual screen actions execute through the active process action runtime,
which verifies the user's compiled action manifest before delegating to
entity, status, socket, or command services.

Auth hydration may append app-owned system screens beside compiled process
screens: organization overview, billing, team, and process-designer entries
use the same generated screen manifest shape and effective access rules;
billing `systemActions` execute fixed organization workflows, while team
and process designer entries are route screens. App-owned system templates
are valid screen contracts for rendering/normalization; the process
designer keeps them out of ordinary process screen authoring.

## Access and roles

Organization bootstrap starts from an empty authoring set. The definition
stores `roleGrants`; runtime behavior is driven by the activated process
plus current organization assignment.

Role access is compositional. Organization records own immutable role ids
and editable labels; process definitions own mappings from those ids to
behavior. Effect grants are explicit `{ roleId, level }` rows; the
compiler receives the organization role catalog explicitly and combines
`roleGrants` with grants derived from entity-profile `allowedRoles`,
action access grants, and screen `required` contracts. The compiled
contract is user-independent: `resolveRoleAssignmentAccess()` combines one
organization assignment with compiled roles and screens at auth time to
produce effective permissions, actions, screens, and navigation — the
resolved view is the organization's active access source at runtime.

Services use separate service identities stored in `servicePrincipals`
plus `access.runPrincipals`/`access.viewPrincipals`; manual user triggers
list only user roles. Service records may carry billing metadata:
`billing.mode: prepaidTokens` with a positive `tokenCost` compiles into
the runtime service contract, and the command runtime debits the active
organization's billing account after successful command execution; token
package prices live in runtime billing configuration.

Access levels:

| Level | Permits |
|---|---|
| `read` | Access to the resulting entity window. |
| `write` | Create/edit/update/run actions. |
| `admin` | Write and read; destructive or approval-style operations require it. |

### Status-scoped windows

Action access compiles through status-scoped access windows. A create
action opens the first window for the created entity state. A
status-mutating update action inherits the incoming entity window until
its `action.access.modified` flag is set; once modified, the selected role
grant rows on that node are the complete grant set for the target state —
removing a role from a modified node removes that role's access to
entities in the resulting status. Parent-scoped windows carry lineage
scope forward: a queue created from a project window scoped to
`$assignment.projectId` receives a `scope.projectId` grant, so access for
one project branch stays inside that branch. Command actions inherit the
incoming entity window for their domain-declared output entities unless
they define their own access grants or mark access as modified; output
entity types come from the domain command `output.entities` contract (a
value service such as `solveNestingValue` declares none — its result is
the raw handler value the graph consumes, while the command envelope
(recording, events, billing) stays in `command_runs`). When the domain
summary registry declares an output a child of the input entity, the
compiler carries lineage scope through that parent relation, so those
results receive the source entity's role window until a later graph node
changes it.

Manual action availability uses the same status-scoped access window as
grants: a status-mutating update action with unmodified access inherits
role-level grants from the incoming action output, so a status step placed
after a create step appears for users who received access to the created
state; a manual root create with no incoming window and no authored action
roles of its own inherits its producer output's create rights (write/admin
`allowedRoles` on the producer open the created-status window, surfacing
the class-level create action). For status-mutating updates, run
availability derives from the incoming entity window — roles with
write/admin access to the current state can execute the transition — while
the action's grant rows define access after the target state is reached.

Designers derive the entity type and source status from the incoming graph
socket and store `action.access.statusFrom`/`statusTo`; create and update
grants are type-id grants conditioned by the resulting state (`admin` on
"create project as NEW" is admin over `project` entities whose current
primary status is `NEW`). Compilation emits transition metadata plus a
`primaryState = statusTo` rule on the concrete entity feature and writes
the same transition into the compiled workflow with `processRoleIds`: the
status engine treats that process role match as the transition authority,
and the target-state grant describes access after the transition (a status
node may grant admin after the transition while write executes it). Action
graph compilation preserves all incoming edges for a node and uses the
first already-resolved upstream output window — a queue status node with
both a create input and a later reject/retry input keeps the resolvable
source edge that feeds downstream command output grants.

Designers select from process roles directly when authoring action grants;
entity-profile grants are an independent grant source.

### Command actions

Manual command actions preserve `commandId` in each compiled user action
manifest entry: generated entity tools use that id to place domain-specific
command panels (the queue nesting panel), while execution goes through the
active process action endpoint. They are placed on generated screens by
their input entity feature — a `solveNesting` button belongs on the queue
detail because the user executes it against a queue — while the same graph
window still grants access to produced `nesting_run` and `sheet_design`
records through command output windows.

Command action sockets are projected from the current command definition
during designer synchronization and compilation: `generateAttachment`
exposes its abstract attachment source and `kind` inputs. Generated
manual actions prompt for the same unconnected inputs; wired process
values and manual values reach the same command contract.

### Sockets

Socket definitions compile as runtime contracts. Outbound sockets consume
a concrete entity and produce a projected payload for another organization;
inbound sockets represent receiver inputs from another organization and
produce a received entity into the local process graph with the socket
receiver lifecycle contract.

## Runtime orchestration

Run and step states follow one transition table; `transitionProcessRun`
and `transitionProcessStep` enforce it and terminal states accept no edge.

| Record | From | Event | To |
|---|---|---|---|
| Run | `running` | every token parks (async effect, join, Wait Until) | `waiting` |
| Run | `running` | tokens empty or `stopSuccess` | `succeeded` |
| Run | `running` | node error or `stopFailure` | `failed` |
| Run | `running` | task cancellation | `cancelled` |
| Run | `waiting` | `wakeAt` due or effect completion | `running` |
| Run | `waiting` | resume failure | `failed` |
| Run | `waiting` | task cancellation | `cancelled` |
| Step | `pending` | token starts the node | `running` |
| Step | `running` | async effect or join parks | `waiting` |
| Step | `running` | node completes | `succeeded` |
| Step | `running` | node error | `failed` |
| Step | `running` | task cancellation | `cancelled` |
| Step | `waiting` | effect completion resumes it | `succeeded` |
| Step | `waiting` | resume failure or task cancellation | `failed` / `cancelled` |

`orchestration.js` executes the full runtime control plane. Effect nodes
have three execution modes: `manual`, exposed through authorized UI;
`event`, which requires an incoming control socket; and `schedule`,
authored on an unwired entry (`trigger.schedule`, a one-shot `at`
date-time or an ISO-8601 `interval` re-arming after each fire). An
evaluation carries
control tokens, foreach scopes, join arrivals, attempts, and step outputs
as in-process state; data subgraphs are evaluated lazily for the
operational node that consumes them, and data or control cycles are
rejected during activation. Wait Until (`control.waitUntil`) parks the
evaluation at the pending-effect boundary with `wakeAt` set; the run
store persists the parked execution beside its definition snapshot and
the scanner resumes it at the authored time through the same seam async
command effects resume on. Declaration wires (`role: 'type'`) survive
normalization with their role and label intact — machine vocabulary reads
them by node type and handle, and every role-classifying consumer (cycle
checks, data and control walkers) skips them, so a declaration wire,
including a class wired to itself, stays outside dataflow.

Durable orchestration resolves every data edge through the source node's
declared data ports before reading or evaluating it; a sole data output is
the canonical source when an edge uses the node-level handle. Trigger and
effect outputs are read only from the token's emitted-value cache. For the
manually started operational node, an explicit run input is authoritative
for its matching port and the connected data edge is the fallback, so an
embedded relation creator consumes the entity selected in its generated
form while the upstream Create effect that defines the designer-time
socket stays idle. When a manual downstream action is exposed in an
existing entity context, an upstream entity-producing effect socket may
bind to the matching typed entity from `context.inputs.entities` — the
current entity window; absent a matching context, manual execution omits
that input. Executable effects are represented only by their `processNode`
canvas node; compiler-derived action records project as no separate action
nodes and are removed when the canvas is serialized.

### Mutations

The mapped mutation species (`cts.construct`, `cts.mutate`,
`cts.transition`, `cts.remove`) share the type-agnostic effect mapper
(`executeProcessEffectNode` in `evaluator.js`). It preflights every input
tree before invoking the runtime adapter: scalar item packets may
broadcast, list/tree packets must have equal item counts and aligned branch
paths, a multi-item branch stays within its branch, and Cross matching is
rejected for mutations. A preflight failure fails the step and run before
the first write. Each aligned tuple then makes one authorized service call
in branch/item order, and the mapped data tree preserves those paths,
order, and item slots. Their input sockets declare List access in the
catalog so the designer and edge validation advertise collection
consumption; edge compatibility stays type-based, so item, list, and tree
sources all wire validly into the same socket. The same broadcast rule
applies to run-context values and authored `inputDefaults` on these
sockets — a scalar wraps as a one-item packet, an array spreads one packet
item per entry — on both input-resolution paths (the token-driven
operational pass and the pulled data-node pass), so the socket contract is
independent of how a node is executed.

Mutation effects fan out per aligned item (continue-and-collect, one
invocation each); an invocation whose input carries a missing-field marker
(an upstream path read matched nothing) fails before the handler with the
input id and the authored path named.

Result envelope: when every aligned call succeeds, the step output is
exactly the historical effect result — a single aligned item yields the
bare service DTO, a list/tree input the bare shape-preserving data tree.
When any aligned call fails, the step still completes and its output
becomes `{ result, failures, completedMutations }`: `result` is the
shape-preserving tree in which each failed slot carries its own
`{ operation, branchPath, itemIndex, entityRef?, error }` MutationFailure
record, `failures` is the flat list of those records, and
`completedMutations` identifies each write that finished. The calls are
per-item, and later failures roll back nothing: earlier completed
mutations remain applied and are identified through `completedMutations`.
Manual runs invert the envelope into an error: `startRun` inspects the
effect step for collected failures and throws the underlying mutation
messages (400), keeping a user-initiated action one intent; automated
batch flows keep the continue-and-collect contract.

Change Status carries an optional `note` string the workflow engine
persists as `status.metadata.note` on the transition, and emits the
updated entity DTO. Nested workflow states are targeted through their
dotted status id (`PRODUCTION.cut`) from the typed status input. Archive
Entity resolves to the domain's named archive intent when one exists,
otherwise to its `ARCHIVED` transition. Delete Entity is available only
when the canonical capability projection combines `operations.delete` with
a registered runtime `processDelete` adapter. Archive and delete retain
the same Item/List/Tree topology and per-slot failure contract as the
other mutations; manual hard deletion compiles as an admin action, rendered
only from the current user's action manifest and requiring confirmation.
Each successful Create call publishes one typed `created` invalidation
after construction, authored block application, and initial-status
persistence have all succeeded; publication leaves the shape-preserving
effect result as it is.

### Manual inputs

Manual effect inputs resolve the supplied entity from the persisted run
context when no data wire overrides that socket; entity access remains
resolved from persisted run input through the authorized feature service.
Manual generic Create actions expose `identity.name` as a prompt when no
Identity block supplies it. Prompts exist on manual actions and satisfy
manually evaluated inputs: a required input on an event-triggered effect
must be connected, defaulted, or supplied by the run context. Manual field
values resolve into fixed field sockets or stable open-block entry sockets
by canonical field path, so a composer node is optional for user-entered
creation data; wired sources take precedence and suppress the corresponding
prompt. Source nodes such as Current Time stay lazy, evaluated when the
consuming effect runs; date/date-time values flow into string fields as
their canonical temporal representation.

## Catalog and protocol

Existing process-definition records currently carry the legacy storage marker
`dataflowVersion: 4` (`PROCESS_PROTOCOL_VERSION = 4` in `types.js`).
This marker is not a platform graph or node-operation protocol and must not
be extended. During the G10 migration, these domain operations map to
provider-qualified nodes under the canonical graph contract. Until cutover,
the legacy compiler reads executable records under `processNodes` with a
namespaced kind from the catalog:
`source.*`, `value.*`, `collection.*`/`tree.*`, `record.construct`,
`control.*`, and the CTS species (`cts.*`). The catalog and evaluator throw
on retired kinds; persisted legacy drafts rewrite through
[`server/scripts/migrate-v4-drafts-native.js`](../../server/scripts/README.md)
(the SPEC §14 kind table; unmigratable shapes are reported, and send-to-
organization effects, patch algebra, and producer-path joins among them).
Roles, entity profiles, screens, assignments, and status definitions are
definition-plane records; status definitions alone project a typed status
value socket, resolved by orchestration from the referenced definition
while the definition itself stays definition-plane.

All entity-bound executable items are species records (`cts.*`): their
ports resolve directly from the record and projected declarations. Origin
species carry a Type pin; consumers infer their type from the entity
input. Entity-derived reads carry the exact declared edge target, so
parent, children, and relation traversal expose the target type. An
extract read (`cts.read select=extract`) is the declared entity→value gate
(SPEC §8): it dereferences a projection declared on the bound type —
output type, and either a stored `field` path or a pack-mounted handler —
through the projected domain's `projectionContracts`; the graph authors no
paths into stored payloads. `cts.mutate` exposes writable declared fields;
`cts.transition` consumes an entity and references a declared transition;
`cts.construct` exposes construction inputs.

### Socket types and ports

Socket types are structured element contracts. `base` describes the value;
nullable, entity type, schema, block, enum, unit, attachment, event, and
capability qualifiers remain orthogonal; socket `access` declares Item,
List, or Tree consumption, keeping topology out of the element type. (The
visual-designer view of these types is in
[components/process-designer](../../components/process-designer/README.md).)

Graph edges are validated through the typed port helpers
`normalizePortSpec()`, `portSpecsCompatible()`, `resolveNodePort()`, and
`validateProcessEdges()`. Value-plane mismatches delegate to the same
coercion lattice as the canvas connect gate (`processSocketsCompatible`),
so a wire the canvas accepts validates; an incompatible-port diagnostic
names the expected and received types beside the socket labels. Canvas
socket handles have one vocabulary home,
`ports.js`: `mintProcessSocketHandle()` mints `data:<id>`/`control:<id>`
by port role and `parseProcessSocketHandleId()` strips it (plus the legacy
`input:`/`output:` spellings persisted by older drafts). Edge
compatibility covers the current process values — entities, entity lists,
canonical blocks, data values, statuses, events, organization projections,
attachments, and task outputs — while generic authoring sockets (a create
action's parent input) stay open for compiler lineage validation. The
resolver treats the `input:parent` handle as a generic parent socket even
when a saved action record still carries stale concrete parent metadata,
so parent wires validate beyond one type. Command outputs that produce an
entity collection may feed same-entity row actions through `input:entity`,
with the entity type matching. The canonical node catalog resolves
operation ports: persisted socket snapshots stay under catalog contracts,
and connecting a wire mutates no open entry's semantic key or type.
Lifecycle and control values retain their semantic port kinds (`status`
and `event`) during edge validation.

### Constructors and selectors

Collection construction has one fixed-arity constructor. Make List
(`collection.makeList`) exposes exactly four optional item sockets
(`item1`–`item4`, `MAKE_LIST_INPUTS` in `node-catalog.js`), each accepting
at most one wire like any single-value socket (a fifth independent value
needs a second Make List or an upstream Concat); wired and defaulted
sockets are consumed in socket order, unwired sockets are skipped, and a
fully unconnected Make List evaluates to the empty list. Concat
(`collection.concat`) is the two-list join: element type, branch topology,
and order retained, an empty side contributing nothing. Collect Array
(`collection.packArray`) and Expand Array (`collection.unpackArray`) are
the explicit persisted-array boundary — packing one branch into one stored
array value and expanding it back, the empty array included; arbitrary
JSON text rejects as a typed array, and element-type compatibility is
enforced at the wire by edge validation.

Ordering, grouping, and windows consume the original item list plus an
aligned key list produced by Get Field:

| Node | Contract |
|---|---|
| Sort | `items` + `keys` (both required); original items in aligned key order; one canonical `direction` (`asc`/`desc`, default asc); stable for equal keys; null keys sort after non-null ascending. |
| Distinct | `items` plus optional `keys`: with keys, keeps the first item per aligned key value; keyless, dedups the items themselves by structural equality. |
| Group By | `items` + `keys`, grouped by the aligned key, appending a group index to each source branch path; the `keys` output emits the grouping key of each branch, tree-aligned with `groups`. |
| Slice / Item At | Authorable integer fallbacks (`start`/`end`, `index`) with native negative-index and empty-list semantics; Item At resolves an absent, out-of-range, or empty index to null. |

Sort, Distinct, and Group By reuse the strict `alignSelectorPackets`
alignment shared with Filter/Dispatch, rejecting any branch-path or
per-branch item-count mismatch.

## Dataflow semantics

### Composition algebra

The definition graph is the extension mechanism: a per-task need composes
from these runtime laws before it is treated as a capability gap.

1. A wired data socket takes its producer's packet at run time; an
   unwired prompted input is asked of the runner at run time.
2. A construct bound to an authored type carries the type's declared
   fields as inputs (`fields.*`): unwired, each declared field is a
   creation prompt; wired, each reads its producer.
3. `cts.field` reads one field off an instance packet; value operations
   (`value.string`, `value.math`, `value.compare`, …) transform packets;
   `record.construct` composes wired values into one record.
4. A control wire (`control:completed` → `control:in`) orders effects
   within one action run; the first construct's `result` socket feeds the
   chained effect as a packet.
5. Ref inputs resolve with their payloads: a file-instance ref carries
   its bytes to the consuming service.

`data-tree.js` owns the universal tree solver; `evaluator.js` executes
pure data nodes and authorized reads through it. Runtime values are
ordered `{ branches: [{ path, items }] }` trees. Per-input Simplify,
Flatten, and Graft run before Longest, Shortest, or Cross matching; Longest
repeats the last branch/item, Shortest truncates, and Cross computes the
Cartesian match. Item access maps matched items, List access runs once per
matched branch, and Tree access receives the complete structure. Every
polymorphic operation is list-aware through the packet tree, including
string `split` (each item's segments land as a sub-branch) and `join` (one
string per branch). Safe integer-to-number, date-to-date-time,
entity-to-entity-reference, single-value-to-array (a value satisfying the
array's item type wraps into a one-item array), and JSON transport
coercions are implicit wire
semantics and create no graph nodes; entity item sources broadcast into
entity collection sockets (`entity` → `entity_list`) with the element type
checked. Nullable-to-required, unit-changing, narrowing, and restructuring
connections require explicit author intent and reject when the selected
node contract cannot express it.

The structure species execute natively with the semantics their catalog
ports declare: `cts.compose` composes open entries into one block per
aligned tuple, and `cts.decompose` reads each declared facet path off the
instance (one facet when a specific output is pulled, the facet map
otherwise). Fixed-field and open-entry composers both evaluate through
aligned tuple matching, so list-shaped inputs emit one composed block per
aligned tuple and multi-entity creation needs no loop node. Duplicate
operations are consolidated: same-type stream concatenation is
`collection.concat` with an entityRef element type, `value.cast` owns
explicit base re-basing (asserting a value whose shape already satisfies
the target), and the wire law's implicit entity→entityRef and JSON
coercions cover reference and JSON needs; persisted drafts that still wire
the retired converter nodes reconnect through the one-shot migration.

Record Field (`value.recordField`) is the record elimination form: one
key read off each record value of the List input (a service row,
a composed parameter record), with the authored output type — the same
authoring gesture open-block Get Field uses, for plain record values; the
key arrives by wire (`key`, the socket-algebra gesture `cts.field`'s field
socket allows) or from the authored `path`, the wire winning; a
field whose value is an array emits one item per entry (the output
socket's List access — list projections itemize the same way at extract
reads). Select (`value.select`) is the typed ternary: a boolean condition
picks one of two same-typed operands, and a scalar condition broadcasts
over item operands. `record.merge` shallow-merges two records, the right
side winning; a missing side merges as absent content. Filter and
Dispatch are selectors: they return the original entity
values and require an equal-length mask with the same branch paths,
rejecting any branch or item mismatch. The authoring projection filters a
typed list with the same data algebra: read/deconstruct the compared field
over the list, evaluate it through the polymorphic Logic node to obtain an
aligned Boolean mask, and pass the original list plus mask to
`collection.filter`.

Comparison semantics are scalar for status and enum values — `states.main`
travels through the ordinary Get Field/Logic dataflow as the primary
status id string and compares as a scalar, and enum values compare as
their scalar string form — while typed entity references and other
structured values compare by stable structural equality (sorted-key
serialization): two values with the same content match regardless of key
insertion order, and Distinct/Group By key on the same stable form. Only
the effect species persist changes or invoke external work.

### Blocks and field schemas

Canonical entity decomposition starts from `@perigram/core`
`CANONICAL_ENTITY_BLOCKS`, narrowed to blocks the selected domain entity
declares; structural block operations read the domain's canonical
`blockSchemas` plus `blockComposition`; entity `fieldSchemas` own
membership plus read/write/construct policy, and wildcard access patterns
are authorization rules. Compose Block, Modify Block, and Get Field leave
the entity type out of selection and encoding; Create and Update validate
connected block fields against the target entity policy at the consumer
boundary.

Structural selectors come from `domain.blockSchemas`; open-block entry
behavior comes from `domain.blockComposition`; entity readers and effect
boundaries use `domain.fieldSchemas`. Each entry has an exact path,
canonical block, and structured type; entity schemas additionally own
read/write/construct capability. Intrinsic collection values use
`array<itemType>` and leave tree topology alone. Fixed-block Compose/Modify
expose selected fields; open-block Compose/Modify expose stable
`entry:<id>` sockets: Lineage entries author a storage key plus typed
entity reference; Relations author a storage key and referenced element
type explicitly (the value is one reference or an array assembled by
Collect Array; Modify Relations replaces the connected entry value, list
operations expressing collection changes beforehand); Attachments accept
named typed attachment references; Data/Summary/Provenance accept named
typed values. Renaming an entry keeps its wire. The evaluator lowers
Lineage entity references to the declared stored id key, and Get Field
restores that id as the declared typed reference. Get Field on other open
blocks authors the local key and output type explicitly.

`cts.decompose` is the instance elimination form (SPEC §14): every facet
the bound type's projected field schemas declare — identity, row fields,
`lineage.<key>` per declared edge, `relations.<key>`, the state axis,
provenance, `_id` — is its own typed output socket, derived from the
projection. The bound type follows the wired entity input (the consumer
binding contract), so the facet sockets render once a typed entity stream
feeds the node. A facet the runtime value does not carry reads as the
missing-field marker. `cts.field` is the single-field projection over the
same path vocabulary: its bound type follows the wired entity input, and
the record's `path` is the single persisted home of the field selection —
the declaration wire, the inspector pick, and every reader (catalog ports,
evaluator, compiler validation) speak that one key. A fresh node defaults
to the first declared row field, an authored path survives rebinds, and
raw storage ids stay behind the projection.

Compilation rejects a selected block the bound type does not declare with
the `uses block <block> outside <typeId>` diagnostic, and the evaluator
enforces the identical check whenever the domain contract is supplied to
the run or preview environment. All three reads evaluate through
`mapDataPacket`, so item, list, and branched-tree inputs keep their branch
paths and item order in the output, and the managed read-only blocks
(`origin`, `status`, `provenance`, `summary`) are readable through them
while writes to those blocks reject. Status is a dedicated lifecycle
socket; status-based find/filter reads `states.main` as a scalar through
Get Field and compares it with scalar equality. Producer services resolve
their declared entity/entity-list construction references at the effect
boundary.

### Reads

Entity reads are one species, `cts.read`, resolved through the
registered entity service boundary (`processGetById`/`processList`) with
the complete run auth context: `select: current`, `all`, `extract`,
`parent`, `children`, and `related`. Current Entity adopts the entity
type when action and screen context agree on one type (only ambiguous
context leaves the type author-selectable). Parent and Children derive
from the domain `containment` (lineage) contract and resolve by the
declared lineage key; Related derives from the domain `relations`
contract and resolves each stored reference by its declared target type.
A missing or denied entity fails clearly; a root entity with no declared
parent yields null, and an absent relation value yields an empty list.
The designer exposes per-entity read choices through the capability
projection: the `all`, `children`, and `extract` selects require the
`list` binding, the remaining selects offer every entity.

### Missing field vs null

The missing-field discipline is owned by CTS SPEC §15.2; the runtime
mechanics live here (`missing-field.js`): path reads produce a frozen
marker object carrying the reserved `$missingField` key and the read path
whenever a segment is absent — including below a present `null` — so the
distinction survives every packet operation (`structuredClone` drops
symbols and class instances, so the marker is a plain object). Logic
`isNull` is true only for a present `null` and `isNotNull` only for a
present non-null value; Coalesce and required validation treat a missing
value as absent; Required and validation error messages name the missing
path; patch append/remove and Compose/Modify Block treat a missing value
as absent content. `serializeProcessResult` is the single conversion point
for result emission and rewrites every marker, at any depth, to the
serializable tag `{ missing: true, path }` while leaving present `null`
values untouched; the process-definitions preview and action-evaluation
responses are emitted through it.

## Persisted-data rewrites

One-way rewrites at the load/save boundary:

- `normalizeProcessNodesForDomain` migrates comparison operations on
  stored graphs to `value.compare` (load boundary).
- `normalizeRowRelativeFieldRefs` heals block-prefixed persisted spellings
  to row-relative ids at resolution and the canvas round trip (guards and
  operation-carried field-policy lists alike).
- Legacy edge ids that embedded handles only in the generated id are
  normalized back to explicit `sourceHandle`/`targetHandle` before
  validation or compilation.
- `rewriteRetiredWirePaths` and `orientChildrenEdgesChildFirst`
  (`packages/cts` graph protocol) rewire persisted drafts at acceptance,
  save, and the designer's load projection: current row paths, edge
  handles, input-default keys, and child-first children wires.
- Stale parent values are stripped at compilation when the domain declares
  no such lineage relation.

`migrateProducerOutputIdentities()` is the one-way persisted-definition
rewrite for records created before producer identity was stored: it
derives entity sockets from the registered node/command catalog, writes
the stable node-and-socket key onto the producer and its derived action,
and moves a detached entity profile only when exactly one producer owns
that entity contract. A stale self-binding (the node selects its own
output key but the record fails to resolve — renamed socket, healed
snapshot, withdrawn type) drops and re-derives: it names no foreign
identity, so it cannot mask cross-node corruption, and validation owns
whatever stays unbound. Missing foreign selections and genuinely ambiguous
same-type ownership return graph-addressable diagnostics; the migration
leaves same-type selection to named identity. A type outside the supplied
vocabulary is left to validation's anchored unknown-type report; an
unsupplied vocabulary leaves the strict rewrite in place. Identity is an
entity-emitting concern: a typed effect with only a value output carries
no producer identity — its type places the run action and nothing more.

Stored process-graph vocabularies migrate through the one-shot scripts in
[server/scripts](../../server/scripts/README.md) — `migrate-v4-drafts-native.js`
(retired executable kinds) and `migrate-process-transition-role-access.js`
(stale compiled workflow `access.permissions` on process-role transitions
in stored process definitions) among them — each runnable once, reporting
unmigratable shapes. A stored process definition carrying `data.compiled`
with canonical semantic records absent fails clearly at the designer and
activation path; runtime output is never re-inferred into a visual design.

## Validation

`npx vitest run packages/processes` — the acceptance suites pin the
authoring seam (`authoring.spec.js` walks every palette item and the
canvas double round-trip), round-trip stability, the migration rewrites,
and the compiler surfaces (screens, access, contract diff, orchestration).

## Related

- [SPEC.md](./SPEC.md) — this package's target-state contract list.
- [CTS SPEC](../cts/SPEC.md) — declaration language: §7 states, §8
  operators and palette law, §15 expressions, §14 graph protocol;
  [cts README](../cts/README.md) — module map.
- [server/core/machines](../../server/core/machines/README.md) — status
  runtime: guards, actors, process-owned and deadline edges (CTS SPEC §7).
- [components/process-designer](../../components/process-designer/README.md) —
  designer surface and connection gate.
- [shared/ui-mapping](../../shared/ui-mapping/README.md) — per-state
  field-policy map, relation inline placement.
- [server/runtime](../../server/runtime/README.md) — party wire and
  membership gates.
- [server/scripts](../../server/scripts/README.md) — one-shot
  persisted-data migrations.


## Procedural graph provider adapter

`procedural-provider.js` exposes eligible pure process data operations to the
canonical graph evaluator under provider identity `perigram.processes`.

- `createProcessProceduralNodeDefinition(kind, record, catalogContext)`
  projects a catalog operation into a version-pinned provider definition.
- `createProcessProceduralExecutor({ context, catalogContext })` executes the
  existing data-node implementation through canonical plain port values.
- Dynamic ports derive from the operation record and catalog context.
- The adapter covers pure sources, values, collections, and record operations.
  CTS access, mutation, effects, and control-token operations remain owned by
  the process authorization and durable orchestration paths.

The canonical graph document and preview evaluator are owned by
[`@perigram/core`](../core/README.md); provider declarations and registration
are owned by [`@perigram/plugin-sdk`](../plugin-sdk/README.md). The process
execution profile remains owned here. See [root SPEC §28](../../SPEC.md#28-unified-node-graph-system).
