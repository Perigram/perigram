# COMPONENT: @cutkit/processes

## Designer Contract

`createProcessDesignerContract(domain)` is the framework-owned projection used
by visual process designers. A designer supplies one `defineDomain`-shaped
implementation, such as `cncDomain`, and receives normalized entity, workflow,
command, task, event, hook, effect, attachment-kind, construction, field-policy,
field-group, canonical-block, and grouped-palette contracts. The generic
designer package does not import a concrete domain.

Canonical entity decomposition starts from
`@cutkit/core/CANONICAL_ENTITY_BLOCKS` and is narrowed to blocks declared by the
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

The grouped authoring palette is a curated framework projection, separate from
the exhaustive runtime catalog. It exposes Entities, Values, and Lists and
trees, with stable localization and description ids. Create Entity resolves either canonical block sockets or the
selected domain construction mode's typed inputs. Run Service resolves the
selected command definition into typed entity/parameter inputs and typed
command-result outputs. Producer effects, conversions, predicates, patches,
and trigger-payload plumbing remain runtime-only. Applications may change
layout, but entity types, construction modes, commands, attachment kinds,
blocks, and fields always come from the supplied domain contract.
Palette translations are authoring presentation and are never process data.
Executable process nodes persist their canonical kind; generated create-action
captions are derived from the typed target entity at render time.
Process definitions use only the current dataflow protocol. New definitions and
starter templates are authored at `dataflowVersion: 4`; package normalization
does not infer a missing version or rewrite an older graph. Callers must provide
the current semantic graph directly.

Declarative organization process compiler. It turns visual process definitions
into runtime contracts for graph-derived role permissions, screen manifests,
navigation, producer-output workflows and field policies, action nodes,
services, and sockets.

An entity-emitting socket is identified by
`producerOutputId = nodeId:outputSocketId`. Compilation emits
`producerOutputs[producerOutputId]`, which owns that output's workflow, field
policy, and lineage bindings. `entityTypeIndex` lists matching output ids for
schema discovery only; runtime workflow selection always requires the exact
producer output id.

Validation is producer-scoped and fail-closed: an action that resolves an
entity type must declare a `producerOutputId` that exists in
`producerOutputs` and emits that entity type, and every producer lifecycle
region with states must declare an entry state that is one of its states.
Workflow synthesis never selects a first or default state — a region without a
declared entry state is a validation error naming the producer output and
region, and compilation of such a definition throws before any workflow is
emitted.

`migrateProducerOutputIdentities()` is the one-way persisted-definition
rewrite for v4 records created before that identity was stored. It derives
entity sockets from the registered node/command catalog, writes the stable
node-and-socket key onto the producer and its derived action, and moves a
detached entity profile only when exactly one producer owns that entity
contract. Missing or ambiguous ownership returns graph-addressable diagnostics;
the migration never selects the first same-type producer.

Compiler entry points are separated by responsibility. `normalization.js`,
`validation.js`, `action-compilation.js`, `screen-compilation.js`,
`access-compilation.js`, and `hierarchy-projection.js` define the supported
package boundaries; `index.js` is only the public barrel. Runtime and UI
consumers import these public boundaries rather than compiler implementation
state.

Process definitions use canonical semantic records as the editing source of
truth. `definitionToCanvas()` projects those records into deterministic Vue
Flow nodes and `canvasToDefinition()` writes canvas layout/edges back while
preserving role-grant, service-identity, lifecycle, service, and socket
records.

Durable orchestration resolves every data edge through the source node's
declared data ports before reading or evaluating it. A sole data output is the
canonical source when an edge uses the node-level handle. Trigger and effect
outputs are read only from the token's emitted-value cache; operational nodes
are never dispatched through the pure data/read evaluator.
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
`validateRoundTrip()` verifies that `definition -> canvas -> definition` does
not change process semantics before activation. Vue Flow node positions are
presentation data; runtime behavior must come from the semantic records.
Canvas projection identifies records by both node type and stable semantic
reference. When a derived action and its executable effect share an id, the
saved executable node keeps its graph id and the missing definition-plane node
receives a namespaced canvas id. Both retain the same `data.refId`, so neither
record shadows or deletes the other during round-trip validation.

Process lifecycle profiles and action nodes compile directly to normalized
`@cutkit/workflows` v2 state machines. Entity profiles may provide a full
workflow, but action-only graphs also synthesize workflows: create actions add
their target status as a state, and status-mutating `updateEntity` actions add
transitions with the process role ids and entity access requirements from the
action grant. Compilation preserves the authored workflow structure: every
region in `workflow.regions` round-trips through compilation with its states,
transitions, and region-level metadata, the source `primaryRegion` is kept, and
workflow-level contracts (any top-level keys beyond the v2 structural fields)
are carried into the emitted machine. Synthesized action states and transitions
always land in the primary region; sibling regions pass through unchanged.
Compilation never collapses a multi-region workflow into `regions.main`.
Runtime adapters must not treat lifecycle data as visual-only metadata.

`src/templates.js` contains starter process templates for organization
bootstrap. Each template exposes organization role identities separately from
its process definition. The definition stores `roleGrants`; runtime behavior is
driven only by the activated process plus current organization assignment.

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
When an assignment contains multiple role ids, generated and authored screens
from every selected role are merged into that user's screen manifest. Explicit
screen records that name several roles still compile to one shared screen key;
compiler-inferred role/entity screens stay separate per role and entity so a
multi-role user receives every matching operational screen. Each inferred
role/entity list screen also gets a paired `entityDetail` screen with the same
required access and action set, so generated collection names can open an
entity page through `screen.scope.entityId`. Grant-only inferred screens are
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
access to the created state. For status-mutating updates, run availability is
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
edges: each binding carries `{ childEntityType, ancestorEntityType, lineageKey,
sourceNode, sourceSocket, consumingNode, consumingSocket }`. The child type is
derived from the Create/Modify entity consumer wired to the composed block, so
persisted composers need no manually selected `targetEntityType`. Compiled lineage bindings are the authoritative
hierarchy contract for the active process. Home eligibility, root scoping, and
inferred child regions use those bindings exclusively; static domain
containment neither creates nor repairs process hierarchy. Once resolved, the compiler recognizes one lineage entity
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
inputs only for `genericCreate`; a typed constructor may also accept canonical
blocks, but its domain-declared service inputs remain present in the compiled
creator and generated form.
The canonical node catalog resolves operation ports. Persisted socket snapshots
do not override catalog contracts, and connecting a wire never mutates an open
entry's semantic key or type. Lifecycle and control values retain their
semantic port kinds (`status` and `event`) during edge validation.
Graph edges are validated through exported typed port helpers:
`normalizePortSpec()`, `portSpecsCompatible()`, `resolveNodePort()`, and
`validateProcessEdges()`. The v1 contract covers existing process values only:
entities, entity lists, canonical blocks, data values, statuses, events,
organization projections, attachments, and task outputs. It prevents clear
kind/entity mismatches while keeping generic authoring sockets, such as
create-action parent inputs, available for later compiler lineage validation.
The resolver treats the `input:parent` handle as a generic parent socket even
when a saved action record still contains stale concrete parent metadata, so old
`label: cassette` or `parentEntityType: cassette` values do not make every
parent wire validate as cassette-only. Command outputs that produce an entity
collection may feed same-entity row actions through `input:entity`; the entity
type still has to match.
Legacy saved edges that embedded handles only in the generated edge id are
normalized back to explicit `sourceHandle` and `targetHandle` fields before
validation or compilation. This preserves old wires such as
`...-output:nesting_run-...-input:entity-...` and prevents them from falling
back to stale generic record ports.
When a graph edge connects an action output to another action's `parent` input,
that edge is authoritative over stale stored `parentEntityType` or parent input
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
domain construction contract. A sparse visual action for `cassette_design`
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
type/access inference. A required input is satisfied by a connected upstream
value, an authored `inputDefaults` fallback, a domain-owned `default`, a
generated manual prompt (manual actions only), or the run context (manual
actions only). Activation rejects a required input with none of these sources;
a prompt never satisfies an automatically evaluated data path, so an
event-triggered effect must be complete without a UI prompt. The emptiness rule
is shared by authored fallbacks and domain defaults: `null`/`undefined` never
satisfy; an empty collection or attachment never satisfies a required
entity-list/attachment input; an empty string or zero satisfies a required
primitive only where the domain type permits. On a List/Tree-declared socket
only an actual array or data tree uses the collection rule; a scalar fallback
is one broadcast item and satisfies by the scalar rules.
Relations composed by the process graph are executable process contracts even
when they are not global CNC-domain relations. A manual effect that consumes a
composed relation derives `Link <target>` for the owner action surface and a
contextual `Unlink <target>` operation for each rendered linked reference. Both
carry the exact relation key, target type, cardinality, and access grants. Link
prompts for a target; Unlink receives the already-rendered target reference and
therefore never opens an entity selector.
The compiled contract preserves the authored owner type, entry key, target
type, and scalar/array cardinality. Array cardinality is inferred from the
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
therefore the same contract used by durable execution and generated UI; a new
canvas effect is not a runtime-only box.
`dataflowVersion: 4` is the sole current operation protocol. Every executable
canvas record lives under `processNodes` and has a namespaced kind from the
catalog: `source.*`, `value.*`, `collection.*`/`tree.*`, `record.*`,
`predicate.*`, `read.*`, `effect.*`, or `control.*`. Roles, entity profiles,
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
semantics and do not create graph nodes. Nullable-to-required, unit-changing,
narrowing, and restructuring connections require explicit author intent and
are rejected when the selected node contract cannot express that intent.

`data-tree.js` owns the universal tree solver. `evaluator.js` executes pure data
nodes and authorized reads through it. Item access maps matched items, List
access runs once per matched branch, and Tree access receives the complete
structure. The authoring projection filters any typed list
with the same data algebra: read/deconstruct the compared field over the list,
evaluate it through the polymorphic Logic node to obtain an aligned Boolean
mask, and pass the original list plus mask to `collection.filter`. Filter and
Dispatch are selectors, not replacements: they return the original entity
values and require an equal-length mask with the same branch paths, rejecting
any branch or item mismatch instead of silently repeating the last mask entry.
Comparison semantics are scalar for status and enum values — `status.state.primary`
travels through the ordinary Get Field/Logic dataflow as the primary status id
string and compares as a scalar, and enum values compare as their scalar string
form — while typed entity references compare structurally by their serialized
`{ type, id }` shape. The runtime retains lower-level predicate and patch
operations for execution/migration, but they are not separate authoring
concepts. Only `effect.*` nodes may persist changes or invoke external work.

Create Entity, Modify Entity, Change Status, Archive Entity, and Delete Entity use the same type-agnostic
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
packet item per entry.

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
Change Status carries optional region, path, metadata, and lifecycle evidence to
the workflow engine and emits the updated entity DTO rather than the transition
wrapper. Archive Entity resolves to the domain's named archive intent when one
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
Deconstruct Entity exposes blocks; Get Field reads one selected field from a
block. Deconstruct Entity and Get Block select only blocks declared by the
incoming entity contract (the entity's `blocks` list plus its field-access
policy block prefixes, including the framework-owned `attachments` open block).
Compilation rejects any other selected block with the same
`uses block <block> outside <entityType>` diagnostic used by the legacy block
kinds, and the evaluator enforces the identical check whenever the domain
contract is supplied to the run or preview environment, so an undeclared block
fails instead of silently reading `undefined`. All three reads evaluate through
`mapDataPacket`, so item, list, and branched-tree inputs keep their branch
paths and item order in the output, and the managed read-only blocks
(`origin`, `status`, `provenance`, `summary`) are readable through them even
though writes to those blocks are rejected. Status remains a dedicated
lifecycle socket and never travels through a
generic mutable block. Status-based find/filter reads `status.state.primary`
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
`null` values untouched. The process-definitions preview and manual-run
service responses are emitted through this helper, so no missing value
silently degrades to `null` over JSON.

`orchestration.js` executes the full runtime control plane. Effect nodes have
only two execution modes: `manual`, which is exposed through authorized UI, and
`event`, which requires an incoming control socket. Runs carry
durable control tokens, foreach scopes, join arrivals, attempts,
and step outputs. Data subgraphs are evaluated lazily for the operational node
that consumes them. Arbitrary data or control cycles are rejected during
activation.

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

`effect.changeStatus` consumes an entity reference, a typed status value, and
an optional patch. The status may be supplied by a literal or configured from a
definition-plane status record. A status definition projects one typed `status`
output into the authoring graph; the persisted wire stores the stable
definition reference while execution resolves its current status id. Status
definitions compile into workflow state metadata
(`label`, `color`, `severity`, `icon`) and into the compiled action target
state, so runtime execution and UI status rendering use the same value and
visual metadata. They also carry lifecycle evidence schema
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
Their access grants are entity-type grants conditioned by the resulting state:
the designer derives the entity type and source status from the incoming graph
socket, carries the type to the output socket, and stores
`action.access.statusFrom` / `action.access.statusTo` from that graph context
and target status input. Compilation emits transition metadata plus a
`primaryStatus = statusTo` rule on that concrete entity feature, and the same
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
command `output.entities` contract, not from frontend assumptions. When the
domain summary registry declares an output as a child of the input entity, the
compiler carries lineage scope through that parent relation; for example,
`solveNesting` outputs `nesting_run` and `sheet_design` records under the
source queue, so those results receive the same role window as the queue unless
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
template (`home`, `entityList`, `entityDetail`, `workspaceLanes`, `table`,
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
routes under `/screens/:screenKey`; the original semantic route is preserved as
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
region-level action ids missing from the process action manifest; template
slot/cardinality violations (`workspaceLanes` renders only `main`/`left`/
`center`/`right` and keys regions by slot, so one region per slot); and screen
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
`projectId: '$screen.scope.entityId'`, and the create-queue action is attached
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
canonical constructible block inputs and `status.state.primary`. Canonical
blocks do not change the selected typed construction mode; they augment the
entity produced by that constructor.
Relation-derived actions are update actions and therefore carry no create
construction contract. On an entity-detail surface the opened entity is the
implicit relation owner; only the relation target is prompted. When the domain
declares one relationship for that owner/target pair, its key and cardinality
replace the composer's provisional socket-derived key.
Incoming graph parent edges are validated against lineage contracts. If an edge
connects an unsupported parent, such as `queue -> create cassette_design`, the
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
routes. If a role has multiple grants for the same entity feature, for example
access to `project` in both `CREATED` and `NEW`, the inferred screen aggregates
them into one feature-level read source instead of pinning the source to the
first status rule or lifting the whole screen to the maximum grant level. The
generated source keeps applicable grant rules as `rule.any`; frontend loading
turns those rules into `primaryStatuses` filters. The entity API still enforces
the individual status-scoped grants when it filters returned records, while
edit/admin affordances come from action and field grants rather than the
route-level screen requirement.

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
