# COMPONENT: Process Designer

The organization process designer authors the `@perigram/processes`
`dataflowVersion: 4` contract in the graph-protocol v5 species vocabulary.
There is no legacy authoring surface: every executable canvas record is a
`processNode` (a `cts.*` species or a pure value-algebra kind), plus
inline-editable declaration nodes. Producer outputs, services, sockets,
value inputs, screens, role grants, and service principals are
definition-plane records: they are never projected as canvas nodes, survive
the canvas round trip untouched, and are edited in focused surfaces — the
producer workflow inspector opens on the entity-producing process node,
while sockets are edited in a collapsible panel of the Roles tab. Role
identities are organization data, and the Roles panel performs immediate
organization CRUD independently of process Save/Apply. Assignments belong
to Team Management. Statuses are authored as state declaration nodes on
their class (the Types palette) and enter effects through their typed
status sockets; no status-definition canvas records exist. Status
fallback choices for an effect's typed status input derive from the bound
type's declared lifecycle states.

The route is a composition surface, not the owner of every editor concern.
Focused composables own process selection, draft persistence, graph
selection and deletion, connection inference, palette queries, inspector
record access, roles, screens, and dock/panel state:

- `useProcessDesignerTypes` — the CTS registry generation, the projected
  designer contract, and the live tree overlay (one registry per overlay
  signature; APPLY persists declarations through `persistTreeDeclarations`).
  `compileTreeDeclarations` emits declarations in dependency order — a type
  referenced by another declaration's children edge or ref-field accepts
  comes first — so one apply introduces a parent and its child together;
  the registry compiles cross-references only against stored and
  already-posted types.
- `useProcessDesignerNodeSync` — the record-derivation family
  (`syncProcessNode`, construction contracts, port resolution, labels,
  option lists). Mutations flow back through the page's single sync entry
  point; the sync functions never re-enter the live-graph pass.
- `useProcessDesignerCanvas` — viewport, zoom, keyboard, coarse-pointer
  pan, and node placement.
- `useProcessDesignerContextPalette` — the socket-filtered drop palette.
- `useProcessDesignerApply` — save/validate/activate as one operation with
  first-diagnostic focus. Declaration-post failures abort before validation
  and land in the same persistent validation feedback the canvas renders
  (never toasts alone), so an Apply that dies on a registry refusal keeps
  showing its cause after the toasts expire. A declaration post refused by
  the type-migration gate (SPEC §11: a breaking type change with live
  instances and no covering `migrate` steps) surfaces as a structured
  failure instead of a flattened string, pauses Apply with
  `pendingTypeMigration`, and opens `TypeMigrationStepsDialog` beside the
  status ceremony: one row per breaking change, labeled by the type's
  authored NAME and the field's authored LABEL (field ids map through the
  tree's field nodes and the stored view's descriptor labels), offering
  the declarative step — `rename-field` / `rename-enum-value` (one
  new-name choice; enum targets are the type's retained states),
  `retype-field` (keep the value as-is, `{op:'var',name:'value'}`, or set
  it empty, `{op:'lit',value:null}` — the only two expressions the CEL
  evaluator honestly supports for retypes today), `add-default-field`
  (one default value), `remove-field` (confirm-only); an uncoverable
  change (`remove-edge`) renders blocked with the reason and offers no
  step. Confirming writes the steps onto the matching class node's
  `data.migrate` (found by typeId), syncs, and retries the Apply — the
  dialog is the author's consent; nothing auto-declares. Consumed steps
  clear from the tree when their declaration post succeeds (steps are
  one-time). When validation returns an Apply migration plan
  (removed workflow states with live instances) that the draft's declared
  migrations (`data.migrations.statuses`) do not already cover, Apply pauses
  with `pendingMigration` instead of activating; `ApplyMigrationDialog`
  collects one target state per removed state (pre-filled from the
  declarations), and confirming persists the mappings as a declaration on
  the draft — save, then activate with no request payload (see the
  canonical Apply migration contract in
  [server/features/process-definitions/README.md](../../server/features/process-definitions/README.md)
  and the refusal payload contract in
  [server/features/cts-types/README.md](../../server/features/cts-types/README.md)).
- `utils/processDesignerAccess.js` (grant-row normalization) and
  `utils/processDesignerPaletteText.js` (localized palette labels) are the
  shared pure helpers.

Per-kind inspector sections live in
[`inspector/`](./inspector/): `ProcessNodeInspector.vue` (authorization
rows, producer-output panel, data matching, output preview,
service/join/construction sections), `DeclarationInspector.vue` (class,
field, state, and type-reference authoring — the field descriptor reuses
the shared `type-designer/DescriptorEditor`), and
`DeclarationEdgeInspector.vue` (transition intents, children edges). They
are pure presentation: every mutation is an event back to the page's
update/sync entry points. The Roles and Screens tabs remain page-owned
until the compile-to-apps rework replaces the screens surface.

Node cards and the inspector read exactly one derivation: `enrichNodeData`
is the single node-data enrichment pass (record sync, derived labels, port
specs, option lists), run by initial projection and by every live sync —
`stripRuntimeNodeData` lists the keys it owns, and nothing else persists
derived node data.
The palette is grouped by authoring concern, and every group draws from one
source of truth. **Types** opens with declaration authoring (class, field,
state, type reference) and continues with the registry catalog — one bound
construct per constructible type plus one variant per declared construct
operator, refreshed live from the organization's type view. **Operations**
holds the effect species, labeled by what they do (Create, Set fields, Set
state, Delete, Join paths). **Instances** holds the entity sources (from
context, by id, by reference, parent, children, related, query) and **Get
field** — the projection gate (SPEC §8 p): entity in, one field's value out
at the authored path, one node, no intermediate block step; its binding
adapts to the entity stream like every consumer. The query read never shows
its runtime predicate input — no authoring node produces a predicate;
filtering a queried list is the list-plus-`collection.filter` mask path.
There is no block substrate on any authoring surface: no block selectors,
no block-relative field lists, no open-entry editors. **Values** and
**Lists and trees** hold the pure value algebra. **Services** is derived
from the projected domain's `serviceContracts` — the registered operator
surface: dropping a service item binds its operator, whose declared command
is the executable twin. A service node's ports derive from the operator's
declared V -> V signature (the registration is the contract — not the
legacy command table, which may carry no entry for a registered operator);
an unknown operator shows empty ports and fails compilation with a named
diagnostic. **No node ever drops pre-bound** (except the type catalog's
constructs, whose binding IS the item you chose): records are unbound until
the author binds them.

Binding is composition, split by species semantics (`carriesTypePin`
is the seam). Origin species — constructs and the reads that start from
nothing but a declaration (context, by id, by reference, query) — carry
a persistent **Type pin** (typed by the binding once bound), wired from
a class node or a **Type reference** item's `ctsType` node. Consumers —
mutate/transition/remove, the entity-derived reads (parent, children,
related), and the field projection — carry no pin and never receive a
declaration wire: their `entity` input accepts instance streams only
(the reads present it under the consumer name, not the v4 twin's
generic `value`). Their binding follows the entity input's source type
live, falling back to the stored preset. Every kind-matching consumer
routes through `operationKindOf` — the authored vocabulary is the type
system's, and the twin mapping is the single seam to the executable
operation catalog.

Declaration authoring validates live: the class inspector enforces the
registry's kebab-case type id (an invalid id is why a class silently
drops out of the overlay and bound sockets stop regenerating) and shows
`compileTreeDeclarations` plus `normalizeType` diagnostics while
authoring — what SAVE/APPLY would reject is visible immediately, not
after a frozen canvas. Class identity is the authored name — a mutable label with zero
coupling to identity. The registry id is an opaque, randomly generated
identifier (`utils/processDesignerIdentity.js`, kebab-safe, minted at
node creation): never derived from the name, never shown, never edited.
Renaming is always a pure label change; persisted instances, posted org
types, producer outputs, and relation references keep resolving.
The class inspector owns NO lifecycle editor: a class is a name, a
class preset, and declaration diagnostics. States are first-class
palette canvas nodes authored in their own inspector (name, severity,
free-form icon — no hardcoded icon lists); they declare on a class by
wire, author the machine entry by wiring into a Create node's status
input, and target transitions by wiring into status-mutating effects.
The machine comes from the process graph; end states derive (states
with no outgoing transition). Declared severities/icons compile into
`render.states`, which `renderPolicyFor` consumes for state chips and
action tones.
Class card labels derive from the authored name. Field mutability is
authored on the descriptor (Writable / Constructible toggles in the
shared descriptor editor): writable governs mutate leaf sockets and
update paths, constructible governs construct sockets and creation
forms. Per-producer field visibility (read / write / private lists) is
authored on the producer output panel and compiles into the field policy.

**Live evaluation** (`useProcessDesignerLiveGraph` over
`interpretDeclarationEdges` in `@perigram/processes`): the designer behaves
like a node editor, not a form. Authoring state (canvas nodes minus
presentation, edges, draft records) folds into one semantic signature; any
change — a wire, a rename, an inspector edit — re-runs wire
interpretation and the sync pass in the same tick. Declaration wires are
live binding channels, not write-once gestures: a field/state node's
type id follows the class it declares on, and a species record's binding
resolves by precedence — its Type wire (origin species) or entity-input
source type (consumers), else the stored preset. Renaming a class
re-binds every wired descendant (constructs gain or lose their row-field
sockets immediately); removing the channel that supplied a binding
clears it, while a preset no channel ever supplied is authored data and
stays — and a binding naming a type that exists nowhere (registry view
or tree) is dangling, not authored: the live pass clears it, so a
deleted class cannot leave behind sockets, producer outputs on unknown
types, or wires that save-time filtering would drop. Deleting a node
also removes the producer outputs it anchored and resets join selections
that pointed at them. Sockets may vanish and return during transient authoring (an
unset ref mid-gesture, a rename in progress) — edges are never pruned
live, because serialization owns stale-edge filtering and a transient
must not destroy wiring. Unfinished authoring is silent: an unnamed
field and an unset ref stay out of the declaration until completed, the
same as any unsaved edit. Position drags and selection churn never
re-evaluate, and idempotent passes converge instead of oscillating.

A `ref` field receives its accepted target types as **wired inputs**:
wiring a class (or type reference) into the field node's targets socket
derives the descriptor's `accepts` live from the tree — renaming a
target class re-derives it, and the multiselect in the inspector remains
the fallback for registry types with no canvas node. The socket carries
the target's registry id verbatim (kebab), so ref field inputs typecheck
against real entity outputs.

Declaration-plane wires (`declarationWireLegality` in
`packages/processes/src/designer.js`, SPEC §20/§21 one tree) are legal only
between declaration partners: field/state nodes declare on a class node;
class/type-reference nodes target a ref field's inputs;
class/reference nodes bind an origin species record's `Type` pin
(consumers carry none — their entity input is a value socket);
operator-bound and structure species carry no type to bind;
class→class wires declare children edges (key + `onRemove`) — gated by
`classMayDeclareChildren` (SPEC §5): a wire from a file-class parent is
rejected at the connect gate and diagnosable in the tree with the class
NAMED, because file identity is content and never carries containment;
state→state
wires are transitions with intents. Their typed port specs
(`declarationNodePorts`, the single home for every declaration handle —
including the state node's transition-from input) exist for those wires
only — a declaration node is never a value source, and nothing from the
data plane feeds a class declare input — so declaration endpoints never
pass through the generic socket-compatibility path. Declaration wires
persist as `role: 'type'` edges whose labels (field/state/children and
transition intents) round-trip through save/reload — declaration matching
is by node types, the label is semantics-carrying display; `compileTreeDeclarations` compiles exactly those edges into
registry declarations (invalid descriptors and cross-type transitions are
named diagnostics). Tree diagnostics and apply failures NAME classes —
the authored class name first, registry id in parentheses — never a bare
`t-…` id: `compileTreeDeclarations` prefixes with the class name, and the
apply path (`useProcessDesignerTypes`) rewrites type ids inside server
compile messages through the tree-class/org-view label map. Persistence follows the draft contract: declaration
nodes own `ctsTypes` records in the process definition, so SAVE keeps the
whole tree exactly as authored (no registry side effects), and APPLY
compiles the app — declarations land in the registry first, then
validation and activation run with the graph's types present. A sole
wired state is necessarily the initial one; among several, the author
marks exactly one (R4).

The composer-less construct: projected construction contracts carry the
type's declared row fields as generic-creation inputs, and a
`cts.construct` at `genericCreate` exposes them as typed List sockets —
the `Type` pin, Name, the declared fields, and the status input; a field
can be wired or prompted directly and a compose node never existed to
begin with. Declared construct operators project as additional `via`
modes with signature-derived `modeInputs`. The `Type` binding pin is a
persistent input on origin species (`cts.construct`, `cts.read`) — bound
or not, typed once bound — so a binding wire never dangles and re-binding
by dropping a new wire is always possible; an unbound origin offers the
pin and nothing else, and every other socket derives from the bound type.
Species cards carry no type-id dropdown and no operation switch: the
binding channel owns the type, the species owns the operation.

A bound `cts.mutate` patches leaves: writable `data`/`specs` row fields
**and declared relation keys** (`relations.<key>`, typed by the edge's
target) arrive as field sockets keyed by schema path (beside the entity
input and the status input), and the effect boundary persists each
wired or prompted leaf as a direct field write. Lineage is
construct-only: the parent key is set where the entity begins (a declared
children edge projects `lineage.<key>` as a construction input);
re-parenting is a structural move, not a field patch. Constructs
therefore receive Name, their parent key, declared relation keys, row
fields, and the status input. An unbound mutate offers only its entity
input: wiring a typed entity stream in adapts it to that type and
surfaces the leaves.

The type catalog completes the Types group: `typeCatalogPaletteGroups`
projects the registry view into construct items — one bound construct
per constructible type, plus one variant per declared construct
operator — so types and their operators are draggable composables,
refreshed from the registry with the designer contract. A dropped
variant seeds the record's `construction.mode` directly (the one
authored spelling; the v4 executable contract derives its `via` at the
lowering seam, and legacy draft records that still carry `via` adopt
it as `construction.mode` and drop the stale key on the first sync).

The Types palette ends with **Join producer paths** (`cts.join`), the
one legal convergence point for same-type producer paths: activation
rejects implicitly converging wires elsewhere on the graph. Its inspector
authors the entity type and the resulting producer output (offered from
the join's connected sources); selecting an entity type resets the
selection, and the join never becomes a workflow anchor of its own.

Validation and Apply focus the responsible graph element: failed validation
and activation responses carry structured diagnostics (`nodeId`, `edgeId`,
`socketId`, `producerOutputId` anchors), and the first anchored diagnostic
selects its edge or node on the canvas — framing that element into view —
before the error message is shown.

Effect-node authorization is authored as roles only, because the node is the
complete access context: entity type, producer path, workflow, and transition
are already fixed by the node and its wiring, and the compiler derives the
action access window (`feature`, `statusFrom`, `statusTo`, scope) from them.
The inspector separates the two authorization axes explicitly, operation
first: **"Action roles"** (one roles multiselect per effect node, levels
default write / deletion admin) — the action *belongs to* those roles: they
receive the action in their compiled action list and a status-scoped data
grant for the node's resulting state, matching the original `grantFromAction`
semantics; it is not an execution-permission check. Authored action roles
are the primary exposure source: the compiled action list and the workflow
transition's `processRoleIds` come from them first, and executability
derived from the input window's write access only fills in when the action
declares no roles of its own. Inside the producer
workflow panel, **"Entity data access"** ("Can view / edit / manage
entities") governs the entities the producer emits. Neither offers an
entity/feature picker or a per-grant condition dialog; the grant-conditions
dialog is reserved for surfaces that genuinely own a feature dimension
(screen required access, process base grants). The producer workflow panel
appears only on origin nodes — Create, Run Producer, Run Service — because
only origins own a producer output. Consumer nodes (Update, Change Status,
Archive, Delete) show no workflow section: they transform entities from
their input wire and bind to the upstream producer, so the machine is edited
exactly once, where the entity path begins. A status-change node's target
status is authored by wiring a status definition socket (or the node's
inline status control), never a duplicate inspector select; the source state
is derived at compile time from the incoming entity flow.
The panel shows the entity type's display label and icon with a "Producer
output" tag, the stable `nodeId:outputSocketId` identity as a muted code
line, the producer's declared relation keys, and a hint that statuses and
transitions come from the domain lifecycle, wired status definitions, and
action nodes.
`useProcessDesignerScreens` owns station customization, source-id reference
updates, mode normalization, lineage rows, and typed scalar-map mutations.
There is no create-a-screen-from-nothing verb: the Screens tab's compiled
preview IS the station inventory — stations absent from `data.screens` are
inference-owned, rendered read-only and marked as inferred, and their only
authoring gesture is **Customize**, which duplicates the inferred station
into an authored record. Authored stations suppress only the station they
equal in kind (per-kind suppression is owned by the process compiler's
inference — see
[`packages/processes/README.md`](../../packages/processes/README.md)).
When grants infer zero stations and nothing is authored, the tab renders an
explanatory empty state — stations derive from role access grants, with an
action that opens the Roles tab — instead of an empty list. The duplicate gets a fresh id and route;
compile-only keys (`labelKey`, `sourceRoute`) and compile-attached lineage
bindings are dropped and the station's `kind` is preserved, so an untouched
duplicate stays projection-equal to inference and Apply's redundancy guard
refuses it until the author actually deviates (crystallization Phase 4 —
overrides are derived from shape, never stored as a marker). Standalone
non-type screens (home, route) remain plain authored records edited in
place; retargeting a duplicate's template is the standalone authoring path.
The Screens tab renders those mutations against the canonical
[`screen-contract.js`](../../packages/processes/src/screen-contract.js)
normalizer and validator; it does not maintain a page-local screen schema.
Its compiled preview renders every emitted screen through the real
generator (`composeScreen` + the ui-mapping registry) over the
CTS-vocabulary UI contract and the client bundle — a structural preview
with an empty instance pool; the runtime data layer is the screens-route
renderer's concern (see [`TODO-process-designer.md`](../../TODO-process-designer.md)).
The preview lowers the authored snapshot through the same graph-protocol
acceptance seam the server uses (`prepareAuthoredDefinition`) before
compiling, so `cts.*` species records drive actions, grants, and inferred
screens exactly as they do at validate/apply.

## Node cards and sockets

`ProcessNode.vue` renders the catalog's resolved ports, not stored UI guesses.
Inputs and outputs share explicit rows, and every handle is centered on the
outer node rail rather than inheriting a position from variable-height content.
Socket labels stay concise; the exact element type, access, qualifier, and
description are available on hover and to assistive technology instead of
being repeated beside every socket. Color communicates transported base type
(one `processDesignerSocketTone` mapping drives a source handle and its wire,
so a contract has one semantic tone throughout the canvas), handle shape
communicates Item/List/Tree access, and the thin node stripe communicates
operation concern through the same `signal-*` aliases — no raw theme colors.
When selected, an unconnected primitive input reveals a compact inline typed
fallback editor; this keeps inactive nodes quiet while preserving immediate
authoring without a separate constant node. A typed status input's fallback
offers the bound type's declared states. Create/Modify/Status effect sockets
declare List access for the shared effect mapper, and they keep the same
inline fallback: an authored scalar there is stored as one broadcast item,
exactly as the mapper consumes it. Literal value authoring offers the plain
value bases; a `status` literal base does not exist — statuses are type-scoped
and enter graphs only through state declaration sockets. A connected wire
always wins. An open socket is a composition affordance, not an error.
Process sockets are always optional; validation only rejects invalid wires
and invalid authored contracts — single-value sockets (inputs without
`multiple`) reject a second wire on the connect gesture itself, with the
socket named in the notice.

Fallback/default policy is omission-first. A connected value wins; otherwise
an explicit authored `inputDefaults` value is used. If neither exists, the
input is omitted. Defaults declared by a construction mode or command are
applied only by that owning domain/runtime contract — generic authoring does
not guess them. Generated identity uid, Mongo `_id`, origin, status history,
and other service-owned fields have no authoring fallback and cannot be
composed or modified. Initial status is the separate lifecycle input.

Entity bindings are explicit where no wire supplies them. Query Entities
chooses its entity type; EntityRef literals keep their type picker (that is
value algebra). Filtering is Query → Get field → Logic → Filter: read the
field over the list, evaluate the Boolean mask, feed mask plus original list.
Several references become one stored collection only through Collect Array.

Only configuration that defines the operation or its ports stays on the node:
value/type, entity, field, operation, trigger identity/mode, and socket
fallback. Access grants and other secondary record policy live in the
contextual inspector. Entity producer nodes display their stable
`nodeId:outputSocketId` reference beside the schema-only entity type.
Inspector record access uses that reference, so same-type producers edit and
persist separate workflow records. Designer synchronization resolves records
only through the authored producer-output protocol: canvas entity-node
connections and relation choices read `producerOutputs` (never detached
profiles), role-access summaries read the producer output's authored
`allowedRoles`, and a new Create node seeds its entry status from the
domain-declared workflow initial for the entity type — the same
deterministic `domainDefault` resolution the compiler performs — instead of
copying a status from a persisted same-type record. Entity types without a
domain workflow seed no status and fail activation with the missing entry
state. When an operational node's resolved outputs change, the designer
synchronizes its producer-output records and writes the sole entity output
identity onto the derived effect action; activation therefore receives the
same persisted identity shown by the node instead of inferring a workflow
from the entity type. Resolved input/output contracts are shown by the
node's labelled socket rails and hover/focus metadata; the inspector does not
repeat a socket-specification table. Pure and read nodes expose an on-demand
Output data inspector. It evaluates only the selected node and its upstream
data dependencies, then renders each output with its declared socket type
beside branch paths, sampled values, and branch/item counts. Sampled items
distinguish a present `null` from a missing field (`missing(<path>)`, the
serialized missing-field tag) and secret or opaque values arrive already
redacted by the preview boundary. Effects and control nodes never show this
inspection action because preview execution deliberately suppresses them.
The palette and inspector are independently collapsible and scrollable.
Palette search matches localized job names and descriptions as well as
internal kinds. The persistent palette uses a readable two-column grid with
grouped headings; operation descriptions are available on hover instead of
occupying canvas space. Right-clicking empty canvas opens the palette at that
graph position. Dropping a socket wire on empty canvas opens the same palette
filtered to operations with a compatible opposite socket; choosing one
creates and connects it immediately.

## Status model at runtime

Lifecycle declarations compile to workflow machines, and the runtime
status is stored in two places by design: the entity carries ONE
immutable status snapshot (`status.state` with the primary and nested
axes, `userId`, `timestamp`, `metadata.note` from Change Status, and
lifecycle evidence — `server/core/blocks/Status.js`), while the full
transition history is an append-only `status_events` collection queried
through the status service (`server/features/states/`). The snapshot
IS the "last" state for read efficiency; "first" is the earliest event —
no embedded history arrays on entities.

## Types and connections

Types are structured `{ base, nullable, ...qualifiers }` element contracts.
Every data value travels in a path-addressed tree. Socket `access`
independently declares whether a node consumes an Item, each branch as a
List, or the entire Tree. Collection-valued fields use the `array` base with
an `itemType`. Exact entity types, enums, units, capabilities, and
attachment/event kinds are preserved on sockets. Collect Array converts a
branch into one array-valued item; Expand Array does the reverse. This
boundary keeps composing a collection field from accidentally producing one
block per list element.

The designer checks element compatibility before persisting a wire. The
runtime solver obtains topology from actual source trees. Item access maps
over matched items; List access executes independently for every branch;
Tree access receives the complete structure. Per-input Simplify, Flatten,
and Graft run before the node's Longest, Shortest, or Cross matching rule.

Get field (`cts.field`) reads one field of the incoming entity at the
authored path; its path choices are the bound type's readable fields, and
an unbound node offers only its entity input. Field extraction and Logic
map over the source topology so Boolean masks stay aligned with the
original entities for `collection.filter`.

## Canvas behavior and diagnostics

Nodes are added to the nearest unoccupied grid position around the visible
viewport center. A newly inserted node must not cover an existing node or
its socket hit targets. Left drag box-selects, Shift extends selection,
two-finger touchpad scroll pans, pinch zooms around the pointer, and Space
plus left drag provides keyboard-assisted panning without a middle mouse
button. Touch hosts have no activation key, so on coarse pointers one-finger
pane drag pans directly (nodes stay draggable) and pinch still zooms;
long-press keeps opening the pane context palette through the native
contextmenu event. A selected node uses one primary border only; it does not
add an outer ring or second outline. Socket handles render at a compact 12px
with an invisible grab pad, and wires draw at 2px, so starting a connection
stays easy at any zoom.

The canvas uses its own token-backed work surface behind two side drawers.
The palette and inspector are non-modal, non-dismissable PrimeVue `Drawer`
panels with Aura drawer chrome; canvas clicks never close them,
`closeOnEscape` is disabled so canvas Escape still clears graph selection,
and the header close button plus the dock toggles own visibility. Each
drawer scrolls its own content, and either can be closed independently to
recover the full canvas. A compact top document dock owns the process
lifecycle (open, rename, save, apply) and a shared `MotionDock` on the
canvas owns view controls (zoom out, zoom in, frame all, frame selection,
reset zoom), both icon-only with proximity magnification and hover labels
through the GSAP patterns in `composables/useMotion.js`;
`useReducedMotion()` disables magnification and label travel while keeping
every action keyboard-reachable. There is no standalone Validate control:
Apply saves, validates, and activates as one operation, while the result
remains visible as feedback on the canvas. The process Folder opens a
click-anchored Popover using the shared `InstanceSelect` value event
directly.

New Draft starts from an empty graph. Save on an active process is the
explicit copy-to-draft operation; saving an ordinary draft updates that
draft. Dirty state is a primary save affordance plus a small dot, not a
persistent text badge. Delete/Backspace removes all selected nodes and
edges together while preserving definition records that are still
referenced. Home frames the graph, Numpad Decimal frames the selection,
and the dock's direct view controls expose frame/zoom without requiring
shortcuts. Zoom spans 0.1x through 4x, and the live viewport is persisted
with the graph. Runtime-only selection styles are stripped before
serialization. Validation reports missing sockets, incompatible types,
guessed/undeclared fields, unreachable operational nodes, and data or
control cycles. Screen requirements consume capability authored on role,
profile, or action access records. Editing a screen never creates a
backend grant, and a gated screen is omitted until selected roles supply
its capability.

Entity selectors use the shared `InstanceSelect`/`InstanceMultiSelect`
contract: selected entity cards render outside the input and the compact
change chevron remains a separate trigger. Process-node field/type
selectors use ordinary PrimeVue controls because their values are schemas,
not entities.

New Draft, Save, and Apply do not depend on a node selection or active
inspector tab. New Draft exposes creation success or failure rather than
silently failing. Save remains available for every loaded process and
persists the authored graph as a draft even when it is incomplete or fails
activation validation; dirty state is an attention indicator, never a
persistence gate. Apply saves and validates the draft first and refuses
activation when validation fails. A validation result carrying a migration
plan pauses Apply in `ApplyMigrationDialog`: each removed workflow state
with live instances is listed with its count and a target-state select
(the next contract's retained states), and activation proceeds only after
every state is mapped. The side rails are always non-modal
drawer overlays and the bottom dock stays icon-only on narrow layouts.

Every effect has one bottom execution switch: Manual exposes the operation
to authorized users, while Automatic exposes an incoming event socket.
Event handles use the same left-to-right direction as data sockets instead
of pointing out of the bottom of the card. Pure value, list/tree, read, and
deconstruct nodes do not render event chrome. Effect failures fail the run;
retry behavior is not hidden effect metadata and must be introduced later
as explicit event/control dataflow.

Canvas accents and Vue Flow handles use the global `signal-*` aliases, not
raw Tailwind hues or inline theme variables. The aliases identify roles
such as entity, data, structure, decision, projection, and effect, so the
process canvas stays legible when the application theme changes.
