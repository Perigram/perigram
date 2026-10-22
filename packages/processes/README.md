# COMPONENT: @perigram/processes

## Authoring and execution planes

The designer shell has two semantic graphs. The declaration graph owns CTS
classes, fields, edges, recursive state machines, transitions, and operator
contracts. The process graph composes those declarations through native
species records. A process node may reference a declaration; it never
redeclares lifecycle structure or type identity through a data wire. The
normative state and species contracts live in
[CTS SPEC §7 and §20](../cts/SPEC.md).

Executable records remain species records from authored graph through
resolution, validation, compilation, orchestration, server execution, and
round-trip. `operationKindOf` is a classification helper only: it does not
replace a species kind or its socket contract. Producer outputs belong only
to actual entity origins; reads and consumer effects use the bound type's
declared workflow and never synthesize lifecycle identity.

The primary palette admits only CTS semantics and explicit process intent.
Raw storage-id lookup, producer-path joins, per-node packet matching, and
transport adapters are compiler concerns and are not author-facing node kinds.
Type-changing traversal selects a declared children/parent/relation edge and
exposes that edge's exact target type.

## Designer Contract

`createProcessDesignerContract(domain)` is the framework-owned projection used
by visual process designers. A designer supplies one `defineDomain`-shaped
implementation — the shipped source is the CTS registry view projected through
`@perigram/cts` `projectDomainFromView` (see
[packages/cts/SPEC.md](../cts/SPEC.md) §19) — and receives normalized entity, workflow,
command, task, event, hook, effect, attachment-kind, construction, field-policy,
field-group, canonical-block, and grouped-palette contracts. The generic
designer package does not import a concrete domain.

Canonical entity decomposition starts from
`@perigram/core/CANONICAL_ENTITY_BLOCKS` and is narrowed to blocks declared by the
selected domain entity. Structural block operations instead read the domain's
explicit canonical `blockSchemas` plus `blockComposition`. These contracts are
never inferred by unioning entity fields. Open canonical blocks use authored,
typed entries with stable socket ids while the resulting block remains one
map/object value. Entity
`fieldSchemas` own membership plus
read/write/construct policy, while wildcard access patterns remain
authorization rules only. Compose Block, Modify Block, and Get Field therefore
never select or encode an entity type. Create and Update validate connected
block fields against their target entity policy at the consumer boundary.

The grouped authoring palette is a curated projection of CTS semantics. Its
groups are declaration items, type-bound constructs, effect species, typed
instance sources/navigation (the generic read presets — an entity source
binds its type at configure time; party types bind as read-only principals,
and the two run-context sources resolve the acting user and the active
organization), values, list/tree algebra, flow, and
pack-owned plugin tabs. The value and list/tree groups are exhaustive over
the catalog's author-facing basics (owner direction 2026-10-10, SPEC §8):
every tree-algebra kind (flatten, graft, simplify, branch, zip, unzip,
cross, transpose, clean, stats), the list reshapes (reverse, shift,
partition, reduce), the value utilities (cast, parse, convertUnit,
coalesce, format, required, validate), and the current-time source are
palette items — only the fixed-arity `collection.makeList` and the
persisted-array boundary (`packArray`/`unpackArray`) stay catalog-only: a pack's
declared data operations — the documents pack's `tableData` tab (xlsx/csv
table decomposition, composition, and management) and the facade pack's
`facade` tab (cassette geometry extraction beside the solver) — surface
pre-bound in the pack's own section (`packPaletteGroups`); a packless
service falls back to the services tab (`servicesPaletteGroups`). The
exhaustive
runtime catalog is not an authoring palette: packet matching, transport
adapters, and producer identity remain compiler/runtime concerns.

Palette membership rules: an authored list literal (`source.literalList`) is
a value and lives in the values group; the persisted-array boundary
(`collection.packArray`/`unpackArray`) and the fixed-arity `makeList` stay
catalog-only — a graph reaches stored reference arrays through declared-edge
reads (`cts.read select=related` resolves stored refs into an entity stream),
never by unpacking raw arrays. The loop item (`forEachEntity`) authors the
loop PAIR: dropping it creates `control.forEach` and its `control.forEachEnd`
closer, because a loop without its closer is not authorable vocabulary.
Record-carried semantics are configured on the record through the seam and
the inspector: `collection.join` keys (`leftKey`/`rightKey`),
`value.recordField` (`path` plus authored output type),
`record.construct` (`fields`), and `value.format` (template — named
`{key}` slots substitute from a wired record, missing keys keep their
placeholder, `{value}` from the value input; no template means number
formatting).

One home per operation (SPEC §8 palette law): `value.compare` owns value
comparison and `value.logic` composes boolean algebra only (the null tests
stay on it as unary boolean tests). Stored graphs authored before the split
carry comparison ops on `value.logic`; `normalizeProcessNodesForDomain`
migrates them one-way to `value.compare` at the load boundary. The
polymorphic kinds (math, string, dateTime, compare, logic, list reduction)
carry their operations in one registry (`operations.js`: sockets and
evaluation per operation); the catalog's port projection, the evaluator,
and the authoring defaults derive from it and never restate operation
lists. Numeric list reductions (`collection.reduce`: sum, average, min,
max) join the collection family. Current species ports mint
`entityRef` — the `entity` spelling survives only inside the persisted-v4
compatibility tier and the wire coercion (`types.js`), and every
producer-output acceptance rule recognizes both spellings.

## Readable principals (party types in processes)

Party types (`user`, `organization` — CTS SPEC §13 readable principals)
project as read-only entities: they bind as instance-source types and
declared relation targets, their rows decompose like any entity, and the
`source.currentUser`/`source.currentOrganization` palette items resolve
the acting user and the active organization from the run context at
execution (fixed `entityRef` outputs, no binding — the party twin of the
current-time source). The capability projection emits list/getById only
for party entities whatever the raw service bindings advertise, and
validation refuses `cts.construct`/`cts.mutate`/`cts.transition`/
`cts.remove` bound to a party type: parties are readable, never
process-mutable. Party reads ride the framework party services on the §3
wire with their own membership gates and the derived `user.roles` row
([server/runtime/party-wire](../../server/runtime/README.md)).

## Headless definition authoring

A process definition is data and its authoring path is one seam:
`createDefinitionAuthoring(domain, capabilities, seedData)` (`src/authoring.js`)
composes a definition exactly the way the designer does — declaration-tree
authoring (`declareClass`/`declareField`/`declareTypeRef`/`declareState`
plus `wireDeclaration` for declares/targets/children/binds/entry wires,
gated by `declarationWireLegality` and interpreted by
`interpretDeclarationEdges`),
palette-item drops (record factory + preset), record configuration (the
same writes the inspector performs, including socket input defaults), and
port-gated connections (the same `processSocketsCompatible` gate the
canvas applies; socket handles — `data:<id>` and the legacy spellings —
are accepted wherever a bare socket id is, and minted by `ports.js` on
the stored edge), and the removal twins of all three: `disconnect` (the
data wire `connect` addresses), `unwireDeclaration` (the declaration
wire `wireDeclaration` addresses), and `removeNode` (a node with its
record, its wires, and the producer outputs it anchored — join
selections pointing at removed outputs reset). Children wires land
child-first — `wireDeclaration(childId, parentId, 'children')` wires the
child's output into the parent's declare input — and accept type-reference
children, so an org type's containment may name pack, other registry
types, and itself (recursive containment, SPEC §6). A definition whose vocabulary is declared in-tree
follows the Apply shape: compose the tree, post its compiled
declarations, then re-seat the seam on the overlaid domain
(`withDomain`) and compose the graph over it. The designer page and its
composables are a presentation adapter over this seam; everything
authorable in the browser is authorable without one, and a headlessly
composed definition loads in the designer as a first-class draft. A
headless drop has no mouse: every drop and declaration takes the next slot
of a default grid, so a composed definition renders readably instead of
piling onto the origin. `graphIntegrityProblems(data)` is the package's
structural floor (nodes carry a unique id, a canvas type, and a numeric
position, and address their processNodes/ctsTypes records; edges address
existing nodes), `graphEdgeSocketProblems(data)` requires every data
edge handle to address a socket the addressed record carries, and
`collapseEffectAccessGrants(data)` collapses an effect's access to its
primary grant — the save seam rejects what the floors flag and persists
the collapse, while semantic validity stays the validator's job.
`configure` writes an effect's access as the lane gesture does: one
grant. A
palette item whose record cannot be dropped, configured, and
round-tripped through the seam headlessly is a defect — pinned by
`authoring.spec.js`, which walks every palette item and the canvas
double round-trip.

The seam also seeds: `seedData` (a stored authored document) re-seats the
seam onto the existing graph — authored keys only; activation-written
records never enter — so the same gestures edit a stored draft as compose
a fresh one (the agent-bots tool catalog's `edit_process_definition` rides
this path through the definition service's `editDefinition`).

All entity-bound executable items are current species records (`cts.*`). Their
ports resolve directly from the record and projected declarations; no
operation-kind twin participates in validation or execution. Origin species
carry a Type pin. Consumers infer their type from the entity input.
Entity-derived reads additionally carry the exact declared edge target, so
parent, children, and relation traversal expose the target type rather than
reusing the source type. An extract read (`cts.read select=extract`) is the
declared entity→value gate (SPEC §8): it dereferences a projection declared
on the bound type — output type, and either a stored `field` path or a
pack-mounted handler — through the projected domain's `projectionContracts`;
the graph never authors paths into stored payloads. `cts.mutate` exposes
writable declared fields and no
status; `cts.transition` consumes an entity and references a declared
transition; `cts.construct` exposes construction inputs and no lifecycle-entry
socket.

The declaration graph uses Class/Field/State/Transition/Operator nodes and
typed declaration edges. `declarationWireLegality` and `declarationNodePorts`
are its only connection contracts. A state connected to a class is a root
state; a state connected to another state declares its single parent. A
state's scope is its declaring wire — the class wire, or a wire into a
type-reference node for registry types (SPEC §7, owner direction
2026-10-22); an unwired state stays an unscoped value token. A state wired into
a construct or transition state socket (wire role `entry`) authors that
operation's state: the construct's initial, the transition's target. A
transition declaration connects explicit `from` and `to` states. The compiler
builds recursive state machines through `compileTreeDeclarations`, including
one initial state per machine, cycle/duplicate checks, and canonical
dotted paths. Draft acceptance calls
`declarationsFromCtsRecords` with the same declaration graph, so nested state
and edge semantics cannot differ between preview and APPLY.

A class node's transient `data.migrate` carries SPEC §11 migration steps
until the declaration post consumes and clears them. Authored field names are
labels; `camelCaseId` derives the row key (letters and digits in any
script — a Cyrillic label derives a Cyrillic key). The class inspector
authors the record-naming field as a dropdown over the class's field
nodes — the single-holder `identifier` move, with the Auto pick
returning the choice to the registry boundary mint (SPEC §4); the field
inspector authors the name and the row descriptor, and display tokens
derive. Declaration binding edges are live
channels interpreted over the declaration graph, while process species records
persist the resolved type and retain their executable ports.

Generic construction exposes declared row fields and declared construct
operators — mode inputs are the operator's record fields, and the
construct-addressable lineage/relation edge inputs ride every mode beside
them (`constructionInputsForContract` is the one derivation the catalog
ports, the compiler's construction normalization, and the designer's node
sync share). An unbound lineage input takes the entity of its declared type
among the construct action's context entity and that entity's ancestors over
the declared containment; explicit input data and typed entity context take
priority. Services expose registered V→V signatures — a service node
is an effect species: the event contract (`control:in` → `completed`)
wraps its signature-derived data sockets, a `list` signature field
projects as the element-typed socket with List access (a runtime
collection, never a persisted array, so aligned item sources and single
broadcast items wire in without the packArray boundary), and an output
`ref` field projects as a typed entityRef socket. Input signatures carry
no `ref` fields — `Ref` is a value (SPEC §2), but dereferencing is the
projection's job, never a service's (SPEC §8 purity). Signature ports
resolve from the projected domain's `serviceContracts`, read from the
contract on every sync pass rather than captured at setup: the designer
replaces its domain when the served organization projection (mounted packs
plus installed plugins) arrives, and a service node loaded before it
re-resolves its ports. An unknown operator is a compile-time diagnostic.
A type configured on the service node binds the derived run action to
that type's screens — the run button executes against the opened
instance, and the command's scalar parameters are its prompted inputs.
Palette translations are presentation only; generated action captions
derive from typed declarations. Callers provide the current semantic
graph directly; normalization never infers a missing protocol version.

The declarative organization process compiler turns current species
records into runtime contracts for access, screens, navigation, declared
workflow overlays, field policy, actions, services, and sockets.

An entity-emitting origin socket is identified by
`producerOutputId = nodeId:outputSocketId`. Only construct and
entity-producing operator origins create producer outputs; reads and consumer
effects never do. A producer output owns field policy, lineage/provenance, and
an optional overlay of the bound type's declared workflow. Existing-instance
consumer actions may omit a producer output and execute against the bound
type declaration. A present `producerOutputId` must name an output of the
same type.

Every lifecycle region derives its entry from the CTS declaration. Compilation
never chooses a first state or turns a read into a creator. A transition action
references a declared transition; its process roles are carried as execution
authorization without forking the type declaration into a producer-owned
machine.
Validation also emits non-operational warnings: any process node whose values
cannot reach a persistence effect (reverse reachability over graph edges with the
effect species as the operational sinks) is reported as inspect-only. An
intentionally inspectable pure-data subgraph therefore stays valid while being
surfaced as dead-end diagnostics through the compiled `warnings` channel the
designer already renders.

Activation runs one further producer-scoped binding pass,
`validateLineageBindingResolution`, beside `validateRequiredInputAvailability`.
Every `entry:*` edge into a Lineage composition must resolve: the entry must
exist on the target record, the source node must resolve to a process record,
the ancestor entity type must be derivable (source entity port, source record
type, or entry declaration) and must not be `organization`, and a lineage key
must exist for the ancestor type. An entity-emitting lineage source socket must
also resolve to a producer output record — by exact `nodeId:outputSocketId`
key, by authored socket alias, or as the single same-type candidate — because
`compileLineageBindings` carries that identity on every binding as
`sourceProducerOutputId`. A native `data:lineage.<lineageKey>` edge into a
construct resolves by the same rules (the input must be declared on the
consuming record), so a dropped wiring binding fails activation exactly like a
dropped composition binding. Each error names the edge id plus the responsible
node, entry, and socket, so a dropped lineage binding is an activation failure
instead of a silently missing runtime binding. Dataflow edge incompatibilities
and required-input availability errors carry the same producer context: an
entity edge error names the source `producerOutputId`, and a required effect
input error on a producer names `producerOutputId` alongside the socket id.

Producer outputs are owned only by actual entity origins: `cts.construct` and
entity-producing `cts.service`/`cts.command` records. Reads, field projections,
and consumer species never mint output identity. Consumer actions resolve
their type from the entity input. They may carry an upstream
`producerOutputId` for field/lineage policy, but it is optional; lifecycle
comes from the CTS type declaration. Transition actions carry their process
role authorization into the status runtime for the referenced transition.

Multiple same-type streams are ordinary typed list dataflow. The compiler may
retain source provenance internally, but there is no author-facing producer
join, selected producer identity, or requirement to choose a lifecycle
producer merely to combine values.

Diagnostics are structured records: `validateProcessDefinition` returns a
`diagnostics` array beside `errors`, where each record carries `{ message,
nodeId?, edgeId?, socketId?, producerOutputId? }` graph anchors. Edge,
join/convergence, required-input availability, and lineage-binding diagnostics
emit anchors (graph node id, edge id, socket id, and producer output id where
applicable); `errors` strings remain the derived `message` list so existing
consumers are unchanged. Diagnostics name process nodes the way the designer
renders them — the humanized catalog operation label plus the canvas node id
(`Create entity processNode_42`), with an authored node label winning over
both; the raw-kind echo the designer sync persists as `label` (for example
`cts.construct`) is never surfaced. The activation adapter merges the package
diagnostics with the availability and lineage passes, so the validate and
activate responses carry one anchored diagnostic list the designer can focus.

`migrateProducerOutputIdentities()` is the one-way persisted-definition
rewrite for v4 records created before that identity was stored. It derives
entity sockets from the registered node/command catalog, writes the stable
node-and-socket key onto the producer and its derived action, and moves a
detached entity profile only when exactly one producer owns that entity
contract. A stale self-binding (the node selects its own output key but the
record no longer resolves — renamed socket, healed snapshot, withdrawn
type) is dropped and re-derived instead of refused: it names no foreign
identity, so it cannot mask cross-node corruption, and validation owns
whatever stays unbound. Missing foreign selections and genuinely ambiguous
same-type ownership return graph-addressable diagnostics; the migration
never selects the first same-type producer. A type the supplied vocabulary
does not know is left to validation's anchored unknown-type report rather
than refused here — without a supplied vocabulary the strict rewrite stays.
Identity is an entity-emitting concern: a typed effect with no entity
output (a value-output service or command) demands no producer identity —
its type places the run action and nothing more.

Authored definitions are current-vocabulary only: `prepareAuthoredDefinition`
resolves CTS ids and declared row paths through `@perigram/cts`
`resolveCtsDefinition` (see `packages/cts/README.md`, SPEC §20, for the
canonical contract) and runs the declaration binding checks beside it.
There is no v4 → v5 species rewrite at any seam and no legacy fallback
vocabulary.

Compiler entry points are separated by responsibility. `normalization.js`,
`validation.js`, `action-compilation.js`, `screen-compilation.js`,
`access-compilation.js`, and `hierarchy-projection.js` define the supported
package boundaries; `index.js` is only the public barrel. Runtime and UI
consumers import these public boundaries rather than compiler implementation
state.

`contract-diff.js` owns the semantic Apply diff between two compiled
contracts: `diffProcessContracts(previous, next)` reports added/removed/changed
actions (with the changed semantic fields), screens, and role grants;
per-type-id CRUD capability changes; per-producer workflow changes (states
with region prefixes, `from->to` transitions, entry states); field-policy
section changes; and `removedInstanceStatees` — primary-region statuses whose
removal strands live entities, computed per entity type as the union of that
type's producers. `hasProcessContractChanges` is the emptiness check. The diff
is pure over compiled outputs; callers recompile both sides because the stored
`compiled` snapshot is inspection-only.

Process definitions use canonical semantic records as the editing source of
truth. `definitionToCanvas()` projects process nodes and status definitions
into deterministic Vue Flow nodes and `canvasToDefinition()` writes canvas
layout/edges back; deleting one of those canvas nodes deletes its record.
Every other record kind — producer outputs, actions, services, sockets, value
inputs — is panel-owned: it is never projected as a canvas node and survives
the canvas round trip untouched, so focused panels (not duplicate canvas
anchors) own its lifecycle.

Durable orchestration resolves every data edge through the source node's
declared data ports before reading or evaluating it. A sole data output is the
canonical source when an edge uses the node-level handle. Trigger and effect
outputs are read only from the token's emitted-value cache; operational nodes
are never dispatched through the pure data/read evaluator.
Mutation effects fan out per aligned item (continue-and-collect, one
invocation each); an invocation whose input carries a missing-field marker
(an upstream path read matched nothing) fails before the handler with the
input id and the authored path named — a marker never reaches an effect
handler.
For the manually started operational node, an explicit run input is authoritative
for its matching port and the connected data edge is only the fallback. This is
how an embedded relation creator consumes the entity selected in its generated
form without executing an upstream Create effect merely because that effect
defines the designer-time source socket.
When a manual downstream action is exposed in an existing entity context, an
upstream entity-producing effect socket may bind to the matching typed entity
from `context.inputs.entities`. This represents the current entity window; it
does not recompute or rerun the upstream effect.
If no matching context exists, manual execution omits that input. A manual
action never runs a separate operational node merely to obtain its data output.
Executable effects are represented only by their `processNode` canvas node.
Compiler-derived action records are not projected as separate action nodes and
are removed when the canvas is serialized.
`validateRoundTrip()` verifies round-trip STABILITY before activation: the
normalized definition is cycled `definition -> canvas -> definition` TWICE,
and the first-generation result must equal the second. Comparing the raw
authored input demanded byte-stability of records persisted by older app
versions, whose canvas nodes legitimately carry data (defaulted glyphs,
authored severities) the paired records never materialized — a one-time
normalization that wrongly refused every re-activation of a legacy
process. Vue Flow node positions are
presentation data; runtime behavior must come from the semantic records.
Canvas projection identifies records by both node type and stable semantic
reference. When a derived action and its executable effect share an id, the
saved executable node keeps its graph id and the missing definition-plane node
receives a namespaced canvas id. Both retain the same `data.refId`, so neither
record shadows or deletes the other during round-trip validation.
Declaration records (`ctsTypes`) project with their full authoring key set —
a class/type binding normalizes to a non-empty string or `null` on both the
projection and the rebuild — so an authored record survives the canvas
cycle byte-identical (a `null` binding must not become `''`). Field-node descriptors carry the SPEC §4 display dictionary
(`label`/`display`/`control` plus the closed `identifier`/`depiction` flags)
verbatim through the cycle, and class nodes round-trip their authored `glyph`
(`null` on both halves when absent).

Lifecycle machines are authored vocabulary only (SPEC §7: graph-derived at
compile, never invented). A producer's machine compiles from the draft's
state records (the state vocabulary), the construct's authored state default
(the machine entry), and its transition nodes' authored targets (the
transitions): a transition node declares only its target, and the machine
edge is the concrete state-to-state pair declared by the wiring — the
from-state is the arrival state of instances on the transition's entity
wire (the upstream producer's output state, derived from the wiring's
status windows at compile), the to-state is the node's target. A state node
wired into another state node's state input becomes that state's child (the
wire's source is the parent), so the compiled machine is a recursive tree
with canonical dotted paths. A parent state is itself a leaf: targeting it
lands on the parent, not an implicit initial child, so a parent-to-child
transition is a real edge. No wildcard
or enumerated from-state ever enters the machine; the transition inspector
authors no from-state, and at execution the status engine validates the
operated instance's current state against exactly those declared edges.
A transition node may carry a `guard` (SPEC §7): a boolean expression
AST over `{ value }` with row-relative field paths. It rides the
derived action onto the machine edge — when several actions declare the
same edge, the first declaration owns the guard — and the declaration
check seam row-checks its paths and restricts its vocabulary to the
boolean expression subset. The status runtime evaluates it at commit
and hides guard-failing edges from action availability (see
[server/core/machines/README.md](../../server/core/machines/README.md));
the transition inspector edits it as a flat all-of/any-of condition
list, a projection of the same AST, with field picks derived from the
bound type's projected rows as row-relative ids (the vocabulary the
row-check and the runtime guard scope read). Block-prefixed persisted
spellings heal to row-relative ids at resolution and the canvas round
trip — guards and state field-policy lists alike
(`normalizeRowRelativeFieldRefs`).

A transition node carries an actor assignment (SPEC §7): the
user-typed `actors` input takes assignees from a wire or an authored
socket default and nothing else prompts. At execution the effect
adapter writes the resolved users into the transition context's
lifecycle actors — ownership: the set applies to every state and
replaces the previous set; the status runtime persists them and the
actor guard governs later transitions (an assigned actor is the only
caller who may move the instance; availability hides actor-denied
edges).

A state record may declare a `fieldPolicy` (SPEC §7/§10): `{ visible?,
editable? }` row-field whitelists that ride the compiled workflow state
beside the display policy. The instance write boundary enforces
`editable` (and `visible`, since an invisible field is never editable);
display surfaces filter by `visible` through
[`shared/instance-field-access`](../../shared/README.md) with the
per-state map derived by
[`shared/ui-mapping`](../../shared/ui-mapping/README.md)
`stateFieldPolicyByType`. `normalizeStateFieldPolicy` (in
`designer.js`, re-exported with the authoring seam) is the one
normalization home; the draft diagnostics and the declaration-check seam
row-check the list ids and refuse `editable` outside `visible`. The
state inspector's pick lists author those ids from the scoped type's
projected rows as top-level row keys — the granularity the write
boundary and the row-check address; pack-type lifecycles scope their
states through a type-reference wire and author facets the same way.
The same arrival state is projected onto the exposed (manifest) action as
`state.from`, so generated surfaces scope the button to the states the
transition actually leaves; the execution channel and the manifest carry
one arrival fact, and a button is never offered in its own target state.
The scoping fact is kind-general: any state-bound effect wired from a
single arrival state scopes by it — a delete wired from one state renders
only there (per-state delete buttons), while a delete wired from several
states (or unwired) stays unscoped and the server runtime still guards
execution. Only status-mutating actions compile machine edges; deletes
never do.
An exposed status-mutating action is the machine's edge: when the machine
compiles no edge for it (a no-op arrival-to-target pair), the action is part
of neither the compiled execution channel nor the manifest, so no surface
offers a transition the runtime would refuse. An event-triggered
transition's edge compiles as process-owned (`processOwned: true`): the
orchestration executes it, and no manual surface offers it — the trigger
mode, the availability window, and the edge carry one ownership fact. The compiled construction
contract is the create form: only create actions carry it — a delete or
transition hydrating the type's default contract would open the create
dialog for a non-create action. Action captions derive from the action
kind and the target type's authored name (`Delete <Type>`); a raw node-kind echo (`cts.remove`) is machinery vocabulary, never a caption, and
a run action names the service's declared render label (`Run Nesting
solver`), never its command id. A producer whose type carries none of these
compiles NO machine: instances of such types are stateless, creation writes
no status, and the status runtime refuses transitions for them. No
synthesized CREATED lifecycle exists — a state nobody declared is not
vocabulary. Creation without an authored state default stamps the compiled
machine's entry; every region remains independent, and recursive state
trees stay nested inside their region.

Organization bootstrap starts from an empty authoring set (starter
templates were removed with the producer panel editors). The definition
stores `roleGrants`; runtime behavior is driven only by the activated
process plus current organization assignment.

Role access is compositional. Organization records own immutable role ids and
editable labels. Process definitions own mappings from those ids to behavior;
they never own role identity or user assignment. Effect grants retain explicit `{ roleId, level }`
rows; authoring never coerces every selected role to `write`. The compiler
receives the organization role catalog explicitly and combines `roleGrants` with grants
derived from entity-profile `allowedRoles`, action access grants, and screen
`required` contracts.
The compiled contract is user-independent. `resolveRoleAssignmentAccess()`
combines one organization assignment with compiled roles and screens at auth
time to produce effective permissions, actions, screens, and navigation.
Services use separate
service identities stored in `servicePrincipals` plus
`access.runPrincipals` / `access.viewPrincipals`; those service identities are
not selectable as manual user triggers.
Service records may also carry billing metadata. `billing.mode:
prepaidTokens` with a positive `tokenCost` compiles into the runtime service
contract, and the command runtime debits the active organization's billing
account after successful command execution. Token package prices stay outside
process definitions in runtime billing configuration.
At runtime this resolved view is the organization's active access source.
The per-user manifest speaks exactly one vocabulary: hydration projects
every screen and action record (`projectUiScreen` /
`projectManifestAction` in `ui-contract-projection.js`) — `id`, `actionKind`,
`typeId`, `parentTypeId`, projected templates (`typeList`/`instanceDetail`),
and the rich execution fields (`inputPolicy`, `relationMutation`, status
window, `contracts`, exposure `inputs`) under their own names. No
`typeId`/`actionId` key crosses hydration; the compiled execution
channel keeps its internal field names server-side only, and the
lineage-binding payload hydrates with `childTypeId`/`parentTypeId`.
When an assignment contains multiple role ids, generated and authored screens
from every selected role are merged into that user's screen manifest. Explicit
screen records that name several roles still compile to one shared screen key;
compiler-inferred role/entity screens stay separate per role and entity so a
multi-role user receives every matching operational screen. Grants derived
from actions and producer outputs carry their authored entity type, and
inference resolves that type directly — types sharing one collection
(org-authored file-class types, for example) each get their own screen
instead of collapsing onto an arbitrary feature sibling; feature-only
grants keep legacy feature resolution. Each inferred
role/entity list screen also gets a paired `entityDetail` screen with the same
required access and action set, so generated collection names can open an
entity page through `screen.scope.instanceId`. The inferred detail
screen's child collections ride as `slot: 'children'`
regions — the one slot the ui-mapping composer nests, so child
collections render beside the record instead of below it. Child
collections come from three declarations: lineage children the merged
hierarchy places under the type, parent-bound creates, and declared
`many` relations of the type (each a relation-scoped list source
`<targetType>_<key>_related`, read-gated by the target feature like
containment children; single-target relations stay chip rows on the
record body, and a relation child region's key covers that chip row).
Inferred list
screens carry their own list region so class-level actions
(the create button) render through the same region mechanism authored
screens use, and both inferred surfaces are labeled by the entity's
authored render label — role names and raw type ids never reach screen
titles. Grant-only inferred screens are
still valid destinations, and inferred `auto_*` list surfaces also seed the
synthesized process `home` screen so the active process opens on a stable home
surface instead of jumping directly into the first inferred entity list.
Domain entities marked `meta: true` are excluded from this inference because
they represent organization configuration, administration, or provenance
rather than operational work. Their grants still compile into effective
permissions, and an authored/system screen may expose them explicitly.

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `updateEntity`, `runCommand`, and
`sendToOrganization` actions against the domain entity,
construction, field-policy, status-definition, value-input, and command
registries, preserves their typed inputs/outputs, preserves completion events,
and emits trigger contracts. `trigger.mode` is only the execution mode:
`manual` means a user starts the action from UI, and `event` means another
node's completion event starts it automatically. Role access is stored under
`action.access.grants` as `{ roleId, level }` rows and compiles into entity
grants plus manual action availability. `write` permits create/edit/update/run
actions, while `admin` includes write/read and is required for destructive or
approval-style operations. `read` grants describe access to the resulting entity
window but must not expose a runnable manual create/update/run action. Manual
action availability uses the same
status-scoped access window as grants: a status-mutating update action with
unmodified access inherits role-level grants from the incoming action output,
so a status step placed after a create step appears for users who received
access to the created state. A manual root create with no incoming window and
no authored action roles of its own inherits its producer output's create
rights: write/admin `allowedRoles` on the producer open the created-status
window, so granting create rights on the type's producer surfaces the
class-level create action even when the action record itself was never
granted explicitly. Compiled manifest action labels resolve the target
entity's authored render label through the domain projection — raw type ids
never reach button captions. Create captions stop at the class name
(`Create <Class>`): the initial state is never part of a create caption,
because the state is process machinery the surface reveals after creation.
For status-mutating updates, run availability is
derived from the incoming entity window: roles with write/admin access to the
current state can execute the transition, while the action's grant rows define
access after the target state is reached. The compiled workflow transition uses those same
incoming run roles in `processRoleIds`; the status engine treats that process
role match as the transition authority. The target-state entity grant is not
also written into the workflow transition, because that grant describes access
after the transition has happened. It must not use the target-state grant level
as the execution permission: a status node can grant admin access after the
transition without requiring admin access before it. Designers select from process roles directly when authoring
action grants; pre-existing
entity-profile grants are an independent grant source, not a filter for action
grant creation. Generic Entity creation accepts typed canonical block values.
Entity-valued sockets carry explicit element types. An open Relations entry
authors its stable storage key and element type; neither the connected producer
nor a downstream entity consumer rewrites those choices. A single reference or
an intrinsic `array<entityRef>` is composed like any other explicit value.
Selection, ordering, aggregation, append, removal, and replacement are ordinary
list/tree dataflow before persistence, not hidden relation-entry modes. A
Lineage ancestor socket derives both its entity type and canonical camel-case
id key from the connected entity output (`project` becomes `projectId`);
definition normalization repeats that inference so a saved graph never depends
on inspector state. Parentage remains a field of a composed Lineage block, not
an extra Create socket. The compiler emits `lineageBindings` from those graph
edges: each binding carries `{ childTypeId, parentTypeId, lineageKey,
producerOutputId, sourceProducerOutputId, sourceNode, sourceSocket,
consumingNode, consumingSocket }`. `producerOutputId` is the consuming
Create/Run Producer output and `sourceProducerOutputId` the entity-emitting
source output, so same-type producers keep separate bindings; deduplication
uses that full identity and never merges bindings merely because child type,
ancestor type, and lineage key match. The child type is
derived from the Create/Modify entity consumer wired to the composed block, so
persisted composers need no manually selected `targetEntityType`. Native
species graphs author the same hierarchy without a composer: a construct's
construct-addressable `lineage.<lineageKey>` input (the domain-derived
construction input a declared parent edge exposes, persisted on the record)
receives the producer's entity output through a `data:lineage.<lineageKey>`
edge, and `compileLineageBindings` emits the same binding from that wiring —
the input's declared entity type only backfills an ancestor the wire cannot
resolve. Each
compiled producer output exposes only its own `lineageBindings`. Compiled lineage bindings are the authoritative
hierarchy contract for the active process; access scoping and grant
windows read them alone. Presentation placement — home eligibility, root
scoping, inferred child regions, contextual action placement — reads the
merged hierarchy view: compiled bindings first per child/parent pair, then
org-authored children edges (containment triples the domain projection
marks `declared: 'org'`), so declaring containment on the org's own types
places child collections and suppresses child home sections without
wiring a Lineage composition. System pack containment never participates
— static framework opinion still neither creates nor repairs process
hierarchy. The client explorer merges the same two sources through
`useEffectiveContainment`. Once resolved, the compiler recognizes one lineage entity
reference as contextual parent scope while the effect boundary persists its
normalized id. Fixed-field and open-entry composers contribute to that same
schema set, so contextual action placement does not depend on how the block was
authored. Persisted field paths are resolved against the effect's target entity
schema first; an open structural block schema describes its container, not the
entity-specific fields stored inside it. Derived
entities are not selectable in generic Create. Domain constructors project as
fixed producer-service effects; for example,
`bakeCassetteDesignFromTemplate` delegates to the cassette template
construction service with its own typed inputs.
For derived entity constructors, the current domain input contract is
authoritative: stale authored construction inputs and prompt fields that are no
longer declared are discarded during compilation instead of resurfacing in
designer nodes or generated dialogs.
Create-node normalization applies the same rule to canonical blocks. When an
entity's current field schema marks every field in a previously persisted block
as non-constructible, that block and its inline defaults are removed before
action derivation and validation. Unknown blocks remain validation errors; this
normalization only removes blocks whose ownership is explicitly declared by the
current domain schema.
Derived relation actions normalize their embedded creator from that same
current construction contract. Generated Link dialogs therefore cannot revive
removed constructor fields from the creator action's persisted input-policy or
construction snapshots. Canonical block composition suppresses separate typed
inputs only for `genericCreate`, and only when block data actually arrives
from the graph — a composer wired into one of the create's block sockets.
The `blocks` list itself is the designer's presentation of the type's
canonical blocks (persisted on every construct node) and never implies
composition; a typed constructor may also accept canonical
blocks, but its domain-declared service inputs remain present in the compiled
creator and generated form.
Compiled creators always carry attachment kinds as the expanded
`[{ kind, creation }]` array: the domain-authored `'userCreatable'` selector
(which means every domain kind with an `upload`/`capture`/`editor` creation
mode) is expanded during compilation even when an authored action node
re-declares it verbatim on a construction input or prompt field, so clients
and services consume one shape and never need the domain registry to decode
selector strings.
The canonical node catalog resolves operation ports. Persisted socket snapshots
do not override catalog contracts, and connecting a wire never mutates an open
entry's semantic key or type. Lifecycle and control values retain their
semantic port kinds (`status` and `event`) during edge validation.
Graph edges are validated through exported typed port helpers:
`normalizePortSpec()`, `portSpecsCompatible()`, `resolveNodePort()`, and
`validateProcessEdges()`. Canvas socket handles have a single vocabulary
home beside them in `ports.js`: `mintProcessSocketHandle()` mints
`data:<id>` / `control:<id>` by port role, and `parseProcessSocketHandleId()`
strips it (plus the legacy `input:`/`output:` spellings older drafts
persisted) — nothing outside `ports.js` regexes a handle. The v1 contract covers existing process values only:
entities, entity lists, canonical blocks, data values, statuses, events,
organization projections, attachments, and task outputs. It prevents clear
kind/entity mismatches while keeping generic authoring sockets, such as
create-action parent inputs, available for later compiler lineage validation.
The resolver treats the `input:parent` handle as a generic parent socket even
when a saved action record still contains stale concrete parent metadata, so old
`label: cassette` or `parentTypeId: cassette` values do not make every
parent wire validate as cassette-only. Command outputs that produce an entity
collection may feed same-entity row actions through `input:entity`; the entity
type still has to match.
Legacy saved edges that embedded handles only in the generated edge id are
normalized back to explicit `sourceHandle` and `targetHandle` fields before
validation or compilation. This preserves old wires such as
`...-output:nesting_run-...-input:entity-...` and prevents them from falling
back to stale generic record ports.
When a graph edge connects an action output to another action's `parent` input,
that edge is authoritative over stale stored `parentTypeId` or parent input
metadata. This keeps detail-screen child regions aligned with the visual graph
after entity types are changed on existing nodes.
Root create actions may still carry a generic optional parent socket for canvas
connectability. Compilation treats a parent as semantic only when it resolves to
a real parent entity type. Stale same-entity parent values from older graphs are
stripped unless the domain summary registry declares that entity as its own
parent relation, so a root create action remains a list-level action instead of
being hidden on entity detail screens.
Parent contracts are valid only when the domain declares a child lineage
relation for the created entity. Entity-typed construction inputs are not
parents: for example, cassette-design `templateId` stays a constructor data
input rather than a cassette parent socket. Stale unrelated parent values are
stripped during compilation; for example, `cassette -> queue` is not valid when
the domain declares queues under projects. A create action is always compiled
onto its target entity screen so users can create the target from that list with
a parent selector when needed. The parent entity detail screen may also receive
the action as contextual chrome when the parent contract is a valid lineage
relation. Entity detail screens do not inherit root create actions for their own
entity type; detail actions are for the opened entity, such as status/update
transitions, plus valid contextual parent-child creation.
If a create action targets an entity that can have a domain lineage parent but
the graph contains no valid parent, compilation strips the stale parent and
exposes a root create action. The runtime entity service decides whether
organization-root creation is valid for that entity. Queue creation supports
this path: a stale `cassette -> queue` parent compiles to a root queue create,
and the queue service creates organization-root lineage instead of requiring a
project concept that the process graph did not define.
Compilation hydrates create-action construction and prompt policy from the
domain construction contract. A sparse visual action for `cassette`
therefore still compiles with promptable `name` and `templateId` fields,
so generated screens open the input dialog even when the draft did not persist
`construction.inputs` or `inputPolicy.fields`. Generic `cassette` creation
keeps the canonical constructible block sockets; the cassette entity service
owns the invariant that every created cassette has a complete editable OCCS
template. When stored actions carry a construction mode that no
longer belongs to the selected entity type, compilation normalizes the mode to
the current domain default before compiling the active runtime contract.
Formerly generic Artifact create nodes therefore compile as the domain's typed
upload constructor. Its selected upload/capture/editor kinds travel in that
construction contract, so generated artifact actions open the file creator
rather than the generic identity-name dialog.
Domain construction contracts own structural input metadata during compilation:
field id, label, path, type, and accepted entity types come from the current
domain registry, not stale action snapshots. Process projections preserve the
domain-declared `required` flag through `socket()`, `normalizePortSpec`, and the
compiler's derived-input projections; a construction or command input whose
domain contract declares a `default` projects as non-required because that
default satisfies it. Queue creation therefore still compiles to a queue shell
action that prompts for its name rather than blocking on an unconnected
cassette-design selection.
Required inputs have exactly one availability contract, enforced at activation
by `validateRequiredInputAvailability` after `validateProcessDefinition` and
type/access inference. Species records classify through the operation-kind
seam (`operationKindOf`): a `cts.construct` carries the create-effect
availability contract and a manual `cts.service` prompts like the command
effect it is; manual species effects are entry triggers for reachability the
same way. A required input is satisfied by a connected upstream
value, an authored `inputDefaults` fallback, a domain-owned `default`, a
generated manual prompt (manual actions only), or the run context (manual
actions only). Activation rejects a required input with none of these sources;
a prompt never satisfies an automatically evaluated data path, so an
event-triggered effect must be complete without a UI prompt. On a generic
create, the legacy identity block socket yields to the composer-less
contract: when the construction contract declares the `name` row, that row is
the identity source and the block socket stays an optional path for migrated
v4 wiring instead of a second required input — the v5 construct surface never
renders block sockets, so a block requirement there would be unsatisfiable.
The emptiness rule
is shared by authored fallbacks and domain defaults: `null`/`undefined` never
satisfy; an empty collection or attachment never satisfies a required
entity-list/attachment input; an empty string or zero satisfies a required
primitive only where the domain type permits. On a List/Tree-declared socket
only an actual array or data tree uses the collection rule; a scalar fallback
is one broadcast item and satisfies by the scalar rules.
Relations composed by the process graph are executable process contracts even
when they are not global CNC-domain relations. A manual effect that consumes a
composed relation derives one `Link <relation>` / `Unlink <relation>` pair per
authored relation ENTRY for the owner action surface (never per-target
buttons): the caption names the relation's authored field label, the prompt
accepts every declared target type of the entry (an authored ref field may
wire several targets — the union stays one entry and one storage key), and
Unlink receives the already-rendered target reference, so it never opens an
entity selector — its rendering home is that reference (the mapping
contract's inline placement, see
[shared/ui-mapping](../../shared/ui-mapping/README.md)). The pair belongs to
the ENTRY, so sibling constructs over the same type and relation derive it
once: the first manual action over the entry owns the derivation. The compiled
contract carries the relation key, the accepted
target types, cardinality, the declared target domain (`where`, CTS SPEC §6 —
pickers offer what writes accept; the write boundary evaluates the same
expression), and access grants (each accepted type's read).
The compiled contract preserves the authored owner type, entry key, accepted
target types, and scalar/array cardinality. Array cardinality is inferred from the
typed Collect Array output when the relation entry is not a global domain
relation; a same-target domain relation does not rename an independently
authored graph entry.
When a relation entry is fed by a typed Create Entity effect, the compiled Link
contract retains that effect as its embedded creator. The creator is not exposed
as an unrelated top-level action: it is authorized and executed only through
the Link action. Its connected entity source and containment path also define
the eligible existing targets and creator sources in the current owner context,
so generated pickers do not fall back to a global target collection.
Artifact relation entries select declared upload-backed `AttachmentKind`
values in their always-visible creation selector. An empty selection uses every
upload-backed kind declared by the domain; selecting values narrows that set.
The compiler places that creator
contract on the Link input and grants the exposed role scoped artifact write
access through the same action window. Command- and workflow-produced kinds
remain separate process effects and are not presented as file uploads.
There is no compiler construction-mode fallback. Missing domain construction
stays `null` through normalization and validation, so Create Entity and Run
Producer reject an entity or mode that the domain construction registry does not
declare. Effective creation authority is the intersection of those declared
modes and the registered runtime handlers (`projectEntityProcessCapabilities`):
`createModes` is that intersection and `create` is derived as
`createModes.length > 0`, never from the presence of a service `create` method.
Typed constructors such as baked cassette designs or OCCS template creation are
bound to named handlers at the application registry, not inferred by the
package.
The CNC registry-wide Create acceptance matrix covers all 14 creatable entity
contracts and every declared mode. Generic modes expose their constructible
canonical blocks rather than duplicate leaf constructor sockets; typed modes
expose their exact required/defaulted inputs and typed entity constraints, then
the same allowed blocks and typed initial-status socket. Creator and attachment
restrictions remain on the normalized construction input consumed by generated
manual forms. None of these contracts declares `parentEnforcement`: ancestry is
validated from typed Lineage composition and compiled from actual graph edges,
while root creation remains an owning-service decision.
Create and update effects never own leaf mutation fields. Create consumes
constructible typed blocks plus a dedicated status value. Update consumes an entity,
connected modified/replacement blocks, and status; only values present in connected
blocks reach the owning feature update boundary. Compose and Modify Block own
field selection and inline primitive fallbacks; collection changes happen in
list/tree nodes before the block socket.
At Create, an open canonical block is accepted when the target entity declares
that block. Authored open entries are not reinterpreted as fixed leaf-field
selectors. Both node-level persistence validation and connected-edge validation
use this same block boundary. Fixed-field blocks still validate every selected path against entity
constructibility; managed Origin, Status, Provenance, and Summary remain excluded.
A manual Update effect fed by a modified Relations block therefore compiles and
renders like every other generated entity-detail action; a block or data wire
alone never creates an action. Manual screen input policy is
traced from connected block composers, so generated forms and graph execution
use the same field contract.
V4 effect records also derive the semantic action manifest consumed by screen
and access compilation. Their selected process-role grants, trigger mode,
entity type, fields, construction contract, command, and status target are
therefore the same contract used by action evaluation and generated UI; a new
canvas effect is not a runtime-only box.
`dataflowVersion: 4` is the sole current operation protocol. Every executable
canvas record lives under `processNodes` and has a namespaced kind from the
catalog: `source.*`, `value.*`, `collection.*`/`tree.*`, `record.construct`,
or `control.*` beside the CTS species (`cts.*`). The retired v4 executable
kinds (`effect.*`, the `record.*` block substrate, `predicate.*`,
`producer.join`) are deleted from the catalog and every execution path: the
catalog and evaluator throw for them exactly as they do for the retired
read kinds, the server effect executor is keyed on species records, and
persisted drafts rewrite through
[`server/scripts/migrate-v4-drafts-native.js`](../../server/scripts/README.md)
(the SPEC §20 kind table; unmigratable shapes — send-to-organization
effects, patch algebra, producer-path joins — are reported, not guessed). Roles, entity profiles,
screens, assignments, and status definitions are definition-plane records and
are not executable operations. Status definitions alone may project a typed
status value socket; orchestration resolves that socket from the referenced
definition without treating the definition as an executable step.

Socket types are structured element contracts. `base` describes the value;
nullable, entity type, schema, block, enum, unit, attachment, event, and
capability qualifiers remain orthogonal. Socket `access` declares Item, List,
or Tree consumption without duplicating topology in the element type. (The
visual-designer view of these types is in
[components/process-designer/README.md](../../components/process-designer/README.md).) Runtime
values always use ordered `{ branches: [{ path, items }] }` trees. Per-input
Simplify, Flatten, and Graft run before Longest, Shortest, or Cross matching.
Longest repeats the last branch/item, Shortest truncates, and Cross computes
the Cartesian match. Safe integer-to-number, date-to-date-time,
entity-to-entity-reference, and JSON transport coercions are implicit wire
semantics and do not create graph nodes. Entity item sources broadcast into
entity collection sockets (`entity` → `entity_list`) with the element type
checked — the same wire rule the effect mapper's broadcast applies at
runtime. Nullable-to-required, unit-changing,
narrowing, and restructuring connections require explicit author intent and
are rejected when the selected node contract cannot express that intent.

`data-tree.js` owns the universal tree solver. `evaluator.js` executes pure data
nodes and authorized reads through it. Record Field (`value.recordField`)
is the record elimination form: one authored key read off each record
value of the List input (a service row, a composed parameter record),
with the authored output type — the same authoring gesture open-block Get
Field uses, for plain record values; a field whose value is an array
emits one item per entry (the output socket's List access — list
projections itemize the same way at extract reads). The structure species execute natively
with the same semantics their catalog ports declare: `cts.compose` composes
open entries into one block per aligned tuple, and `cts.decompose` reads
each declared facet path off the instance (one facet when a specific
output is pulled, the facet map otherwise — the same facet list its ports
derive from the field schemas). Duplicate kinds are consolidated rather
than kept beside their twins: same-type stream concatenation is
`collection.concat` with an entityRef element type (`cts.join` is
deleted), `value.cast` owns type conversion (`value.parse` shared its
evaluator and `value.enum` was cast-to-string), and the wire law's
implicit entity→entityRef and JSON coercions absorbed `value.toEntityRef`
and `value.toJson` — persisted drafts reconnect through those nodes via
the one-shot migration. Every polymorphic operation is
list-aware through the packet tree, including string `split` (each item's
segments land as a sub-branch) and `join` (one string per branch) — no
operation flattens to the first item. Item access maps matched items, List
access runs once per matched branch, and Tree access receives the complete
structure. The authoring projection filters any typed list
with the same data algebra: read/deconstruct the compared field over the list,
evaluate it through the polymorphic Logic node to obtain an aligned Boolean
mask, and pass the original list plus mask to `collection.filter`. Filter and
Dispatch are selectors, not replacements: they return the original entity
values and require an equal-length mask with the same branch paths, rejecting
any branch or item mismatch instead of silently repeating the last mask entry.
Comparison semantics are scalar for status and enum values — `states.main`
travels through the ordinary Get Field/Logic dataflow as the primary status id
string and compares as a scalar, and enum values compare as their scalar string
form — while typed entity references and other structured values compare by
stable structural equality (sorted-key serialization): two values with the
same content match regardless of key insertion order, and Distinct/Group By
key on the same stable form. Only the effect species may persist changes or
invoke external work.

The mapped mutation species (`cts.construct`, `cts.mutate`,
`cts.transition`, `cts.remove`) use the same type-agnostic
effect mapper (`executeProcessEffectNode` in `evaluator.js`). It preflights
every input tree before invoking the runtime adapter: scalar item packets may
broadcast, list/tree packets must have equal item counts and aligned branch
paths, a multi-item branch cannot be broadcast across tree branches, and Cross
matching is rejected for mutations. A preflight failure fails the step and run
before the first write. Each aligned tuple then makes one authorized service
call in branch/item order, and the mapped data tree preserves those paths,
order, and item slots. Their input sockets declare List access in the catalog
so the designer and edge validation advertise collection consumption; edge
compatibility stays type-based, so item, list, and tree sources all wire
validly into the same socket. A single item source is one broadcast item, and
the same broadcast rule applies to run-context values and authored
`inputDefaults` on these sockets: a scalar is wrapped as a one-item packet
rather than rejected as a list arity error, while an array spreads into one
packet item per entry. Both input-resolution paths shape values this way —
the token-driven operational pass and the pulled data-node pass — so the
socket contract does not depend on how a node is executed.

When every aligned call succeeds the step output is exactly the historical
effect result: a single aligned item yields the bare service DTO, and a
list/tree input yields the bare shape-preserving data tree — no reporting
envelope is added. When any aligned call fails the step still completes and
its output becomes `{ result, failures, completedMutations }`: `result` is the
shape-preserving tree in which each failed slot carries its own
`{ operation, branchPath, itemIndex, entityRef?, error }` MutationFailure
record, `failures` is the flat list of those records, and
`completedMutations` identifies each write that finished (operation, branch
path, item index, entity ref when known). These calls are not
collection-atomic: a later failure does not roll back earlier writes or
prevent subsequent aligned items from being attempted, so earlier completed
mutations remain applied and are identified through `completedMutations`.
Manual runs invert the envelope into an error: `startRun` inspects the
effect step for collected failures and throws the underlying mutation
messages (400), because a user-initiated action is a single intent and a
failed slot behind a success toast is a silent no-op — automated batch
flows keep the continue-and-collect contract.
Change Status carries an optional `note` string that the workflow engine
persists as `status.metadata.note` on the transition, and emits the updated
entity DTO rather than the transition wrapper. The former raw `region`, `path`,
`metadata`, and `lifecycle` json sockets are gone: nested workflow states are
targeted through their dotted status id (`PRODUCTION.cut`) from the typed status
input, and normalization drops any persisted edges into the removed sockets. Archive Entity resolves to the domain's named archive intent when one
exists, otherwise to its `ARCHIVED` transition. Delete Entity is available only
when the canonical capability projection combines `operations.delete` with a
registered runtime `processDelete` adapter. Archive and delete retain the same
Item/List/Tree topology and per-slot failure contract as the other mutations.
Manual hard deletion compiles as an admin action; generated surfaces render it
only from the current user's action manifest and require confirmation.
Each successful Create call publishes one typed `created` invalidation only
after construction, authored block application, and initial-status persistence
have all succeeded. Publication does not alter the shape-preserving effect
result or make a collection mutation atomic.

Collection construction has one fixed-arity constructor. Make List
(`collection.makeList`) exposes exactly four optional item sockets
(`item1`–`item4`, `MAKE_LIST_INPUTS` in `node-catalog.js`), each accepting at
most one wire like any single-value socket; a fifth independent value needs a
second Make List or an upstream Concat. Wired and defaulted sockets are
consumed in socket order, unwired sockets are skipped, and a fully
unconnected Make List evaluates to the empty list, so the constructor never
fails on missing inputs. Concat (`collection.concat`) stays the two-list
join: it retains element type, branch topology, and order, and an empty side
contributes nothing. Collect Array (`collection.packArray`) and Expand Array
(`collection.unpackArray`) remain the explicit persisted-array boundary —
packing one branch into one stored array value and expanding it back —
including the empty array; arbitrary JSON text is never treated as a typed
array. Element-type compatibility is enforced at the wire: connecting a
source whose type does not match the constructor's element type is rejected
by edge validation rather than coerced.

Ordering, grouping, and windows consume the original item list plus an aligned
key list produced by Get Field, never hidden raw property paths. Sort takes
`items` + `keys` (both required) and returns the original items in the aligned
key order, exposing one canonical `direction` (`asc`/`desc`, default asc) read
by the evaluator and written by the inspector; equal keys keep their original
order (stable) and null keys sort after non-null keys in ascending order.
Distinct takes `items` plus an optional `keys` list: with keys it keeps the
first item per aligned key value, without keys it dedups the items themselves
by structural equality rather than serializing a whole entity. Group By keeps
`items` + `keys` and groups by the aligned key, appending a group index to each
source branch path. Sort, Distinct, and Group By reuse the strict
`alignSelectorPackets` alignment shared with Filter/Dispatch, rejecting any
branch-path or per-branch item-count mismatch instead of repeating the last
key. Slice `start`/`end` and Item At `index` are authorable integer fallbacks
with native negative-index and empty-list semantics; Item At resolves an
absent, out-of-range, or empty index to null.

Entity read sources are authoring nodes, not repository readers. Current Entity
(`read.currentEntity`), Entity by ID (`read.entityById`), Entity by Reference
(`read.resolveEntityRef`), Parent (`read.parent`), Children (`read.children`),
Related (`read.related`), and Select Entities (`read.queryEntities`) all resolve
through the registered entity service boundary (`processGetById` /
`processList`) with the complete run auth context, never an unfiltered
collection read. Current Entity adopts the entity type when action and screen
context agree on one type; only ambiguous context leaves the type
author-selectable.
Entity by ID consumes an id socket with an explicitly selected
entity type; Entity by Reference consumes a typed reference directly. Parent and
Children derive from the domain `containment` (lineage) contract and resolve by
the declared lineage key; Related derives from the domain `relations` contract
and resolves each stored reference by its declared target type. A missing or
denied entity fails clearly instead of returning a silent empty value, while a
root entity with no declared parent yields null and an absent relation value
yields an empty list. The designer exposes per-entity read choices through the
capability projection: Select Entities and Children require the `list` binding,
and the remaining read sources require `getById`.

Structural selectors come from `domain.blockSchemas`; open-block entry behavior
comes from `domain.blockComposition`; entity readers and
effect boundaries use `domain.fieldSchemas`. Each entry has an exact path,
canonical block, and structured type, while entity schemas additionally own
read/write/construct capability. Intrinsic collection values use
`array<itemType>` and do not overload tree topology.
Wildcard field-access entries remain authorization patterns and never become
field choices or guessed sockets. Fixed-block Compose/Modify expose selected
fields. Open-block Compose/Modify expose stable `entry:<id>` sockets: Lineage
entries author a storage key plus typed entity reference. Relations author a
storage key and referenced element type explicitly. Their value can be one
reference or an array assembled by Collect Array. Modify Relations replaces the
connected entry value; list operations express collection changes beforehand.
Attachments accept named typed
attachment references, and Data/Summary/Provenance accept named typed values.
Renaming an entry does not break its wire. Fixed-field and open-entry
composers both evaluate through aligned tuple matching, so list-shaped inputs
emit one composed block per aligned input tuple and multi-entity creation
needs no separate loop node. The evaluator lowers Lineage entity
references to the declared stored id key and Get Field restores that id as the
declared typed reference. Get Field on other open blocks authors the local key
and output type explicitly rather than selecting invented global fields;
`cts.decompose` is the instance elimination form (SPEC §20): every facet
the bound type's projected field schemas declare — identity, row fields,
`lineage.<key>` per declared edge, `relations.<key>`, the state axis,
provenance, `_id` — is its own typed output socket, derived from the
projection with no hardcoded block filtering. A facet the runtime value
does not carry reads as the missing-field marker. `cts.field` remains the
single-field projection (the same path vocabulary). Its bound type follows
the wired entity input, and the record's `path` is the single persisted
home of the field selection — the declaration wire, the inspector pick,
and every reader (catalog ports, evaluator, compiler validation) speak that
one key. A fresh node defaults to the first declared row field rather than
an identity slot, an authored path survives rebinds, and pre-fix authoring
artifacts heal on sync: the machine `_id` path default re-defaults to the
row field, and `field` socket defaults older drafts carry (packet, string,
or junk) unwrap into the path once and the channel key retires. Raw
storage ids are not an author-facing projection.
Compilation rejects any other selected block with the same
`uses block <block> outside <typeId>` diagnostic used by the legacy block
kinds, and the evaluator enforces the identical check whenever the domain
contract is supplied to the run or preview environment, so an undeclared block
fails instead of silently reading `undefined`. All three reads evaluate through
`mapDataPacket`, so item, list, and branched-tree inputs keep their branch
paths and item order in the output, and the managed read-only blocks
(`origin`, `status`, `provenance`, `summary`) are readable through them even
though writes to those blocks are rejected. Status remains a dedicated
lifecycle socket and never travels through a
generic mutable block. Status-based find/filter reads `states.main`
as a scalar through Get Field and compares it with scalar equality; it never
constructs or mutates the status block. Producer services resolve their declared
entity/entity-list construction references at the effect boundary.

A missing field is never the same value as a present `null`
(`missing-field.js`). Path reads produce a frozen marker object carrying the
reserved `$missingField` key and the read path whenever a segment is absent —
including below a present `null` — so the distinction survives every packet
operation (`structuredClone` drops symbols and class instances, which is why
the marker is a plain object). Logic `isNull` is true only for a present
`null` and `isNotNull` only for a present non-null value; Coalesce and
required validation treat a missing value as absent; Required and validation
error messages name the missing path instead of reporting a null; patch
append/remove and Compose/Modify Block treat a missing value as absent
content rather than writing the marker into an entity. The marker never
crosses a runtime boundary as-is: `serializeProcessResult` is the single
conversion point for result emission and rewrites every marker, at any depth,
to the serializable tag `{ missing: true, path }` while leaving present
`null` values untouched. The process-definitions preview and action-evaluation
responses are emitted through this helper, so no missing value
silently degrades to `null` over JSON.

`orchestration.js` executes the full runtime control plane. Effect nodes have
only two execution modes: `manual`, which is exposed through authorized UI, and
`event`, which requires an incoming control socket. An evaluation carries
control tokens, foreach scopes, join arrivals, attempts,
and step outputs as in-process state. Data subgraphs are evaluated lazily for the operational node
that consumes them. Arbitrary data or control cycles are rejected during
activation. Declaration wires (`role: 'type'`) survive normalization with
their role and label intact — machine vocabulary reads them by node type and
handle — and every role-classifying consumer (cycle checks, data and control
walkers) skips them, so a declaration wire, including a class wired to itself,
never counts as dataflow.

Manual effect inputs resolve the supplied entity from the persisted run context
when no data wire overrides that socket. Entity access remains resolved from
persisted run input through the authorized feature service.
Manual generic Create actions expose `identity.name` as a prompt when
no Identity block supplies it. Generated prompts exist only on manual actions
and never satisfy an automatically evaluated data path; a required input on an
event-triggered effect must be connected, defaulted, or supplied by the run
context. Manual field values are resolved into either
fixed field sockets or stable open-block entry sockets by canonical field path,
so a composer node is optional for user-entered creation data. Wired sources
take precedence and suppress the corresponding prompt. Source nodes such as
Current Time remain lazy and are evaluated when the consuming effect runs;
date/date-time values may flow into string fields as their canonical temporal
representation.

`cts.transition` consumes an entity reference and the typed target state
on its state socket (a `note` rides the optional note socket; an archive
intent is expressed by `record.archiveIntent`). The status may be supplied by a literal or configured from a
definition-plane status record. A status definition projects one typed `status`
output into the authoring graph; the persisted wire stores the stable
definition reference while execution resolves its current status id. Status
definitions compile into workflow state metadata
(`label`, `color`, `severity`, `icon`) and into the compiled action target
state, so runtime execution and UI status rendering use the same value and
visual metadata. A definition may declare an optional `parentStatusId`
referencing another definition's status id: the child compiles as a nested
workflow state under that parent, and compiled workflows flatten it to its
dotted id with its state `path` (`PRODUCTION.cut` -> `['PRODUCTION', 'cut']`),
so a nested state is selected and targeted like any other status value.
Unknown or cyclic parents are validation errors naming the definition. They also carry lifecycle evidence schema
(`description`, `attachments`, and `snapshots`) onto the generated workflow
state. Runtime status actions use that state schema to require operator notes,
store proof files as entity attachments, and capture declared relation
snapshots when the transition enters the state. Status definitions are entity
agnostic by default: when a referenced action creates or transitions a concrete
entity type, the compiler adds that target state to the entity workflow and
applies the referenced severity/icon/color/label and lifecycle schema there.
The same display metadata is preserved on each compiled role action manifest
entry, because generated screens read `role.actions[].status` when filtering
and rendering process action buttons.
Status-mutating update action labels are also derived from that target status
definition label, or the target state id when no label exists, whenever the
authored label is only a generic palette placeholder such as `Action`, `status`,
or the raw action kind.
Their access grants are type-id grants conditioned by the resulting state:
the designer derives the entity type and source status from the incoming graph
socket, carries the type to the output socket, and stores
`action.access.statusFrom` / `action.access.statusTo` from that graph context
and target status input. Compilation emits transition metadata plus a
`primaryState = statusTo` rule on that concrete entity feature, and the same
transition is written into the compiled workflow with `processRoleIds`. Manual execution remains controlled by the action
availability contract; the access grant itself describes which entity type the
role may access after the status change. Create-action access grants are
conditioned by the created status in the same way, so `admin` on "create project
as NEW" means admin over `project` entities whose current primary status is
`NEW`, not global project admin.
Action access compiles through status-scoped access windows. A create action
opens the first window for the created entity state. A status-mutating update
action inherits the incoming entity window until its `action.access.modified`
flag is set; once modified, the selected role grant rows on that node become
the complete grant set for the target state. Removing a role from a modified
status-mutating update node therefore removes that role's access to entities in
the resulting status instead of leaving an older additive grant behind. Parent-scoped
windows carry lineage scope forward: a queue created from a project window scoped to
`$assignment.projectId` receives a `scope.projectId` grant, so access for one
project branch does not apply to queues under another project branch.
Command actions inherit the incoming entity window for their domain-declared
output entities unless the command action explicitly defines its own access
grants or marks access as modified. Output entity types come from the domain
command `output.entities` contract, not from frontend assumptions; a value
service such as `solveNestingValue` declares none — its result is the raw
handler value the graph consumes, while the command envelope (recording,
events, billing) stays in `command_runs`. When the
domain summary registry declares an output as a child of the input entity, the
compiler carries lineage scope through that parent relation, so those results
receive the same role window as the source entity unless
a later graph node changes it.
Action graph compilation preserves all incoming edges for a node and uses the
first already-resolved upstream output window. This matters for lifecycle loops:
a queue status node can have both a create input and a later reject/retry input,
and the compiler must not let the loop edge overwrite the resolvable source
edge that feeds downstream command output grants.
Workflow synthesis also preserves those repeated incoming entity edges. If a
single status-mutating update action is reused from several source states, such as
`Создано -> Отправлено` and `Отклонено -> Отправлено`, the compiled workflow
emits one transition per source state while keeping the same target status
definition and using the executable role window from each source edge.
At runtime, a command output wired into a downstream status-mutating update node
receives that process-authored target state after the command returns its entity refs.
The state projection is derived from graph edges and typed output handles such
as `output:nesting_run`; it is not a domain-specific queue rule.
Manual command actions preserve `commandId` in each compiled user action
manifest entry. Generated entity tools use that id to place domain-specific
command panels, such as the queue nesting panel, while execution still goes
through the active process action endpoint.
Manual command actions are placed on generated screens by their input entity
feature, not by the command output feature. A `solveNesting` button belongs on
the queue detail because the user executes it against a queue, while the same
graph window still grants access to produced `nesting_run` and `sheet_design`
records through command output windows.
Stored active process definitions keep a compiled activation snapshot for
inspection. Auth hydration and manual action execution both compile the current
canonical process graph at access time, so visible actions and executable
actions cannot come from different compiler versions.
After runtime changes that introduce command-output status projection, run
`server/scripts/migrate-process-command-output-statuses.js` so existing command
outputs are moved into the active process status windows derived from the
current graph.
After compiler/runtime changes that separate process-role transition authority
from target-state entity grants, run
`server/scripts/migrate-process-transition-role-access.js` to remove stale
compiled workflow `access.permissions` from process-role transitions in stored
process definitions.

Screen records are route-level UI entries attached to roles and are the source
for process-composed app navigation. They compile into generated screen
manifests, not arbitrary Vue component names. A screen declares a fixed
template (`home`, `entityList`, `entityDetail`, `table`,
`formAction`, or app-owned system templates such as `route`,
`organizationOverview`, and `organizationAccount`), typed
entity sources, template regions, required access, and manual process action
ids. Each source has a stable id and label, entity type, list/single loading
mode, independent required access, and the mode-specific loading contract:
single sources carry one scalar identifier, while list sources carry a flat
scalar filter map and may carry the canonical compiled-lineage binding fields.
Each region has a stable id and label and independently selects its template
slot, source, registered domain display surface, and action ids. Screen
bindings are arbitrary keyed literal string, number, or boolean values, or
valid `$assignment.<key>` references; nested values and null are invalid. The
`supporting` slot is reserved for generated/system templates with secondary
accounting or history regions. Assignment bindings replace `$assignment.*`
placeholders in screen routes, authored scopes, bindings, source identifiers,
source filters, required-access scopes, and grant rules,
so one user can receive overloaded copies of the same screen for different
projects or entities. Screens with incomplete bindings are skipped with
compiler warnings. `discoverAssignmentBindingRequirements()` walks those
locations plus process role/action access and returns each selected key with its
scalar type and contributing locations. User-specific compiled screens use canonical generated
routes under `/screens/:screenKey` — except home: the compiled home screen
(the per-user `home_<userId>` key) serves at the stable shell route
`HOME_SCREEN_ROUTE` (`/home`), because home is the app's own shell, not a
generated screen URL; the original semantic route is preserved as
`sourceRoute` for audit/debug context. Manual screen actions execute through the
active process action runtime, which verifies the user's compiled action
manifest before delegating to entity, status, socket, or command services.
`screen.required` is only a frontend requirement. Compilation does not copy it
into role grants: assignment compilation resolves all additive authored grants
first and includes a screen only when those grants cover its requirement.
`screen-contract.js` owns the authored screen contract: normalization, the
canonical region surface registry (`SCREEN_REGION_SURFACES`: `card`, `compact`,
`detail`, `table`, `workspace` — the surfaces the generated region components
render), and pre-activation validation. `validateScreenContract` runs inside
`validateProcessDefinition`, so `compileProcessDefinition` and the
activation adapter reject malformed screens before anything is compiled.
Beyond template/source/region membership it rejects: duplicate source or
region ids; single-mode sources without a resolvable identifier (the runtime
could only render a missing-identifier error); non-scalar identifiers and
filter values; filters that are not flat scalar maps; malformed or empty
`$screen.*`/`$assignment.*` placeholders; `$screen.bindings.<key>` references
to bindings the screen does not declare; region surfaces outside the registry;
region-level action ids missing from the process action manifest; region
slots outside `main`/`children`/`supporting` (others normalize onto `main`);
and screen
bindings that are neither literal scalars nor `$assignment.<key>` references
and therefore can never resolve at compile time.
Each user assignment also receives a compiler-synthesized `home` screen when
that user has generated list screens. The home screen is prepended to the
user's screen and navigation manifests so it becomes the process start screen.
It is not an editable semantic screen record: it is a projection of the user's
effective access. Home sources are top-level entity-list sources only. If the
compiled Lineage projection says one accessible list is a child of another
accessible list, the child list is suppressed from the home screen and remains
reachable through its own generated route or parent detail context. The home
regions keep the target list route and the list-level manual action ids for
that entity, so generated UI can show one horizontal section per top-level
entity with its matching process action buttons.
Auth hydration may append app-owned system screens beside compiled process
screens. Organization overview, billing, team, and process-designer entries use
the same generated screen manifest shape and effective access rules as process
screens. Billing `systemActions` execute fixed organization workflows instead
of the active process action endpoint, while team and process designer entries
are route screens. App-owned system templates are valid screen contracts for
rendering/normalization, but the process designer keeps them out of ordinary
process screen authoring.
When a role can read both a parent entity and a child entity, inferred parent
detail screens receive child collection sources for relations declared in the
domain summary registry. Create-action ownership is not required to see the
child region; parent-bound create actions are attached to that region only when
the same role can execute them. The graph input alone is not enough to create a
child collection: it may be construction context, not lineage. For example, a
project-to-create-queue graph compiles the project detail screen with a queue
source filtered by the domain relation key
`projectId: '$screen.scope.instanceId'`, and the create-queue action is attached
to that child region instead of the unscoped queue list screen. A role with
only read access to libraries and cassettes still receives a library detail
cassette child region filtered by `libraryId`, but no cassette create action.
A project-to-create-cassette graph does not create a cassette child collection
unless the domain summary registry explicitly declares cassette as a project
child.
Entity-typed construction inputs do not create parent-context actions. The
compiler keeps those fields in the create dialog or wired data sockets, and
does not attach them to unrelated parent `entityDetail` screens. For example, a
cassette-to-create-cassette-design graph compiles cassette design creation as a
target-list action with a `templateId` constructor input, not as a cassette
detail action.
Typed create nodes expose their mode-specific constructor inputs together with
canonical constructible block inputs and `states.main`. Canonical
blocks do not change the selected typed construction mode; they augment the
entity produced by that constructor.
Relation-derived actions are update actions and therefore carry no create
construction contract. On an entity-detail surface the opened entity is the
implicit relation owner; only the relation target is prompted. When the domain
declares one relationship for that owner/target pair, its key and cardinality
replace the composer's provisional socket-derived key.
Incoming graph parent edges are validated against lineage contracts. If an edge
connects an unsupported parent, such as `queue -> create sheet_design`, the
compiler ignores that parent edge and compiles the action as an unparented
target-list create. Relationship context is separate from lineage: after a
design is created, the action runtime may link it through a declared domain
relationship such as `queue.relations.cassettes`.
The designer removes incoming data edges whenever a node contract change
removes their target socket. Before serializing a draft it derives a filtered
edge list without mutating reactive canvas state, so saved drafts cannot retain
edges to deleted composed entries or construction inputs and preview
recomputation cannot recursively trigger itself.
Navigation is compiled from the screen manifest. When a role has access grants
but no authored screen for that entity feature, the compiler creates a generated
entity-list screen for that role/feature so process-active users do not fall
back to static app routes. Role-level compiled screens keep role-prefixed ids
for audit and designer previews, but user-specific screen manifests merge
generated screens by entity/template/scope into one effective screen such as
`auto_cassette` or `auto_cassette_detail`. If one assigned role grants read
access to cassettes and another grants admin/create access to the same
cassettes, the user sees one cassette list/detail route with merged status
windows and merged runnable actions, not duplicated role-specific cassette
routes. Inferred read sources carry no status window at all: wiring-derived
state windows scope what a role may CHANGE (they ride the permission grants
and gate state-changing actions), never what a list may show — a read gated
by a transition's target states hides stateless instances and states the
wiring no longer targets. A role holding multiple grants for one entity
feature still aggregates into one feature-level read source at the maximum
read level. Authored screens keep their authored `required` verbatim — an
explicitly authored status window still scopes that screen's reads, and the
frontend turns an authored `rule.any` into `primaryStates` filters. The
entity API still enforces the individual status-scoped grants when it
filters returned records, while edit/admin affordances come from action and
field grants rather than the route-level screen requirement.

**Inference owns default stations** (crystallization Phase 4): an
authored screen that is projection-equal to the station inference would
emit for the same role + type is redundant slop — it only suppresses an
identical inference and must be hand-maintained for nothing.
Suppression is per station kind: an authored `typeList` (template or
kind) for a role + type suppresses only the inferred list station, an
authored `instanceDetail` only the inferred detail, and any other
authored template for the role + feature (formAction, table, home,
route, system templates) stands in for both generated stations, because
a chrome screen for a feature replaces the generated surfaces as a
whole. An authored screen is a delta that customizes exactly the one
station it equals in kind.
`redundantAuthoredScreens` (script-facing wrapper:
`detectRedundantScreens(definition, domain, orgRoles)`) detects them by
running the pure inference (no authored-screen suppression) and
comparing normalized projections over exactly the fields inference
sets; any authored customization — label, route, bindings, extra
sources/regions — makes a screen NOT redundant. Validation refuses to
apply a redundant screen ("duplicates the inferred station"); the
one-time broom is
[`server/scripts/sweep-redundant-screens.js`](../../server/scripts/README.md)
(dry-run default, `--apply` deletes and best-effort recompiles).

The wiring graph context treats native species records (`cts.*`) as the
executable graph citizens, and one
derivation — `declaredTransitionSources`, the arrival states on an action's
entity wires (with an authored `from` as legacy fallback, never a filter) —
feeds every consumer: the machine edges (both compiler branches), the
compiled action's status window (`state.from`, carried through the manifest
projection), and the client's action filter, so a transition's button
appears exactly in the states its wiring declares and the status engine
validates the operated instance against exactly those edges. Unscoped state
value tokens bind through their entry wires: the wire from a state token
into a construct or transition of a type is the token's type binding (the
same rule the designer's connection gate applies), so machine vocabulary
seeding follows the wires — a shared vocabulary must be wired where it is
meant and never leaks into another type's machine (one type's board lanes
never carry another type's states). A scoped state record binds by its
authored `typeId` with no wire.

A process whose grants infer zero stations compiles to zero screens:
authoring is delta-only (there is no screen create verb), so with no
inferred stations there is nothing to customize and nothing authored.
The designer Screens tab explains this state — stations derive from
role access grants — instead of rendering an empty list (see
[`components/process-designer/README.md`](../../components/process-designer/README.md)).

Each compiled producer output owns its field policy. `read` fields are public
display fields, `write` fields require write grants, and `private` fields
require admin grants. Socket definitions are
compiled as runtime contracts. Outbound sockets consume a concrete entity and
produce a projected payload for another organization. Inbound sockets represent
receiver inputs from another organization and produce a received entity into the
local process graph with the socket receiver lifecycle contract.

Compiled-only runtime contracts are not editable process sources. If a stored
process definition has `data.compiled` but no canonical semantic records, the
designer and activation path fail clearly instead of inferring a visual design
from runtime output.

Command action sockets are projected from the current command definition during
designer synchronization and compilation. `generateAttachment` exposes its
abstract attachment source, optional `artifact_template`, `kind`, and `values`
inputs. This replaces stale stored command-input copies such as the former inert
`pdfTemplateId`. Generated manual actions prompt for the same unconnected
inputs; wired process values and manual values reach the same command contract.
