# COMPONENT: Process Designer

The normative graph/state contracts live in
[CTS SPEC §7 and §20](../../packages/cts/SPEC.md) and the executable package
contract in [packages/processes](../../packages/processes/README.md). This
README owns only the authoring UX and projection rules.

Canvas-appearance work (shapes, wires, lanes, arrangement) starts from the
accepted plan of record,
[`TODO-process-designer.md` §P5](../../TODO-process-designer.md) — read it
before changing the node UI contract.

The designer shell separates declaration authoring from executable process
composition. Declaration nodes own CTS classes, fields, edges, recursive state
machines, transitions, and operator signatures. Process nodes reference those
declarations and retain native species kinds and typed ports through
save/load/apply/run. A declaration edge is never executable dataflow, and a
process node never becomes the lifecycle declaration by carrying a target
string.

A state connected to a class is a root state. A state connected to another
state declares its single parent (`nested`); there is NO transition
declaration node — the declaration palette is class/field/state/
type-reference, and transition operations are process nodes. Children
wires accept type-reference targets beside in-tree classes: an org type's
containment may name pack, other registry types, and itself — a class
wired to its own declare input declares recursive containment (SPEC §6),
rendered as a hoop over the card. A ref field declares a
relation — its `accepts` derive from targets wires onto the field node,
and its row lives in the relations slot (a row-carried reference pins
`slot: 'data'` in its descriptor)
(`cts.transition`) that reference declared states. Initial and terminal
state facts belong to state
nodes. Construction has no lifecycle-entry socket, and transition operations
reference declared transitions rather than inventing target states.

The primary process palette contains CTS semantics only. It does not expose
raw-id lookup, producer-path joins, packet matching, or transport adapters.
Parent/children/related operations are generated from exact declared edges and
expose their target types. Entity identity crosses the graph as a typed
`Ref<T>` or a loaded instance, never as an author-typed storage id.

The organization process designer authors the current species process
contract and the current CTS declaration graph. Every executable canvas
record is a native `cts.*` species or a pure value-algebra kind. Producer
outputs, actions, services, sockets, value inputs, screens, role grants, and
service principals remain semantic/definition-plane records and are never
duplicated as canvas effects. Role identities and assignments remain
organization data.

Status state and transition facts are authored only in the declaration view.
The process view selects declared states/transitions through typed references;
it does not compile inline state text into the registry. Status fallback
choices and transition availability derive from the bound type's projected
recursive lifecycle.

The route is a composition surface, not the owner of every editor concern.
Focused composables own process selection, draft persistence, graph
selection and deletion, connection inference, palette queries, inspector
record access, roles, screens, and panel state:

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
- `utils/processDesignerAccess.js` (grant-row normalization),
  `utils/processDesignerPaletteText.js` (localized palette labels),
  `utils/processDesignerCommandPorts.js` (pure command-contract → port-row
  projection for the runCommand panel), and
  `utils/processDesignerDefinitionRecords.js` (pure service/socket record
  factories — definition-plane records, kept out of the node-record
  factories) are the shared pure helpers.

Per-kind inspector sections live in [`inspector/`](./inspector/).
`ProcessNodeInspector.vue` owns effect construction, declared
edge selection, transition reference, transition guard (a flat
all-of/any-of condition editor over the bound type's row-relative
fields — it reads and writes the guard expression AST, never a parallel
shape), pure output inspection, and the
per-grant access LEVELS (role assignment itself is lane placement —
see "Lanes"). It does not
expose packet matching or transport transforms. `DeclarationInspector.vue`
authors class, field, state (including initial/terminal and the deadline
facet — hours plus target state, stored as an ISO-8601 duration on the
record), transition, operator,
and type-reference records. `DeclarationEdgeInspector.vue` authors typed edge
integrity. They are pure presentation: every mutation is an event back to the
page's update/sync entry points.

Node cards and the inspector read exactly one derivation: `enrichNodeData`
is the single node-data enrichment pass (record sync, derived labels, port
specs, option lists), run by initial projection and every live sync.
`stripRuntimeNodeData` lists the keys it owns, and nothing else persists
derived node data.

The palette is grouped by authoring concern. **Declarations** owns class,
field, state, transition, operator, and type-reference nodes. The registry
catalog contributes one bound construct per constructible type/mode.
**Operations** owns construct, mutate, transition, remove, command, and
registered service species. **Instances** owns context, all, the declared
projection, exact declared-edge traversal, the single-field projection,
and the instance elimination form (`cts.decompose` — every declared facet
as its own typed output). **Values** owns literals, comparison, logic,
text, dates, math, and the value utilities (cast, parse, unit conversion,
coalesce, format, required, validate). **List/Tree** owns the exhaustive
collection and tree algebra (filter, sort, dispatch, group, reduce,
reverse, shift, partition, flatten, graft, simplify, branch, zip, cross,
transpose, clean, stats). **Flow** owns control.
Both the rail palette and the canvas context palette render through one
component, `OperationPalette.vue`: searchable chip groups — localized
group labels above wraps of small PrimeVue Buttons (no icons). Each
chip's dot carries the item's category signal
(`utils/processDesignerSignals.js` is the single group→signal map;
signal classes are literal in the util because Tailwind compiles from
source text). Canvas nodes carry no category accent — the frame is
plain.
There is no raw-id source, producer join, fixed-arity list constructor, block
substrate, or hidden predicate input. Unknown service operators fail with a
named diagnostic.

Origin species carry a persistent Type pin. Consumer species carry no pin;
their entity input determines the bound type. Type-changing reads also carry
the declared target type. All consumers use their native `entity` socket
through validation and execution. `operationKindOf` may classify a record for
shared behavior, but no UI or runtime path changes its kind or ports.

Declaration authoring validates live: the class inspector enforces the
registry's kebab-case type id (an invalid id is why a class silently
drops out of the overlay and bound sockets stop regenerating) and shows
`compileTreeDeclarations` plus `normalizeType` diagnostics while
authoring — what SAVE/APPLY would reject is visible immediately, not
after a frozen canvas. Class identity is the authored name — a mutable label with zero
coupling to identity. The registry id is an opaque, randomly generated
identifier (`utils/processDesignerIdentity.js`, kebab-safe, minted at
node creation): never derived from the name, never shown, never edited.
The same module mints every canvas/definition id the designer creates at
runtime (`mintId` — graph nodes, edges, services, sockets, stations):
time + counter + random, so same-millisecond drops cannot collide.
Renaming is always a pure label change; persisted instances, posted org
types, producer outputs, and relation references keep resolving.
The class inspector owns no inline lifecycle editor. States are first-class
declaration nodes. A state connects to its class (root) or to
one parent state (nested); its inspector owns the name, local initial flag,
terminal flag, and display policy. Transitions are process nodes
(`cts.transition`), never declaration nodes: they author a target state and
an optional intent against their bound type. The compiler recursively emits
one state machine per axis and rejects
cycles, missing nested initials, duplicate sibling names, unknown paths, and
unreachable terminal states. Process transition operations select one of
these declarations; they do not add states or terminal facts.

Class card labels derive from the authored name. The declaration inspector
authors the display tokens (the SPEC §4 naming vocabulary, canonical grammar
in [`packages/cts/SPEC.md`](../../packages/cts/SPEC.md) §4). Beside the
class name, one glyph row offers a curated PrimeIcon set plus a free-text
override; an absent glyph derives from the class default table. Per field,
the inspector offers a display label (the placeholder is the authored name;
empty means derived), a `display` kind select over the closed SPEC §4
vocabulary plus "auto" (key absent), and two single-holder toggles: the
names-the-record toggle sets `identifier: true` on exactly one field per
type — enabling it clears the flag from the previous holder, and when none
is authored the registry boundary mints the first string field, so the
toggle is the authored deviation — and the picture toggle sets
`depiction: true` at most once with the same move semantics. Field
mutability is
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
`packages/processes/src/designer.js`) are legal only between declaration
partners: field/state/operator nodes declare on a class or its
state machine; class/type-reference nodes target a ref field's accepted
targets; class/reference nodes bind an origin species Type pin; state→state
wires declare one parent relationship (`nested` — there is no transition
declaration node). Class→class children wires retain their typed key and
`onRemove` policy. File-class parent containment is refused at the connect
gate. Declaration edges persist as `role: 'type'` records and round-trip
without being treated as dataflow. `compileTreeDeclarations` is the one
declaration compiler; diagnostics name the authored class before its opaque
id. SAVE keeps declaration records in the draft; APPLY posts the same
compiled declarations before compiling the process graph.

The composer-less construct exposes the Type pin and declared
construction inputs. Generic creation derives those inputs from the target
type's constructible row; declared operators project as typed modes. It has
no status socket: the type declaration owns initial state. Lineage and
relation construction inputs derive from declared edges and remain distinct
from row mutation.

A bound `cts.mutate` exposes the entity input and writable declared
row/relation field ports only. It has no status or arbitrary patch port.
Lineage remains construct-only or an explicit structural move. The native
species record and these field ports survive resolution, validation, and
execution unchanged.

Construction modes never project palette items, and registry types (pack
or organization-declared) are never palette entries: the palette is
operation vocabulary, not a type catalog. A process binds a type by
dropping the unbound `construct` operation and wiring its Type pin to a
class or type-reference node. Species cards have no operation switch: the
binding channel owns the type, the species owns the operation. There is no
`Join producer paths` palette item; same-type stream combination is ordinary
typed collection composition.

Validation and Apply focus the responsible graph element: failed validation
and activation responses carry structured diagnostics (`nodeId`, `edgeId`,
`socketId`, `producerOutputId` anchors), and the first anchored diagnostic
selects its edge or node on the canvas — framing that element into view —
before the error message is shown.

Effect authorization has two independent facts. The effect's action roles
determine who sees and may run the process action. A transition also resolves
against the declared transition's policy; the action's process roles are
carried to the status runtime for that execution and never become a second
lifecycle declaration. Producer outputs own only entity-origin field/lineage
policy. Consumer effects have no producer or workflow editor. Their type comes
from the entity input, and their transition operation selects one declared
transition. Screen/required-access grants remain process policy, not lifecycle
structure.
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
screens exactly as they do at validate/apply. The preview bundle carries the
authored display tokens (the live tree overlay feeds the same registry the
preview compiles), and its screens resolve titles, headers, and icons through
the one resolvers (`titleFor`/`fieldLabel`/`iconFor` in
[`shared/ui-mapping`](../../shared/ui-mapping/README.md)) — so toggling the
identifier field, editing a display label, or picking a glyph is visible in
the preview rows immediately.

## Node UI contract

This section is the canonical canvas vocabulary: what every visual channel
means and how a card is arranged. One channel encodes exactly one fact;
anything not listed as a channel is chrome and carries no meaning by
design. Every card — the operation card and the declaration family alike —
composes the shared frame and handle primitives
([`components/shared`](../../components/shared/README.md):
`DesignerNodeCard`, `DesignerSocketHandle`), so the contract is enforced by
construction, not per-card styling.

### Channels

**Sockets and wires**

| Channel | Encodes | Values |
|---|---|---|
| Socket color | transported payload family | reference (instances, typed references, and lists — one tone), structure (declared type bindings), quantity, decision (including status), temporal, external, effect, projection, or data. Events use the primary accent. |
| Socket mark | the connection point (nothing else) | ONE uniform filled circle for every socket — color is the only socket channel. There is no shape vocabulary: no rings, diamonds, squares, or dot/outline variants. A trigger's manual-vs-wired state reads from whether a wire is attached, which a wire shows by existing. |
| Wire line style | WHAT TRAVELS on the wire | solid = instances (entity payloads — the data spine between operations); dashed = values; dotted = events — the one wire family allowed color (`var(--p-primary-color)`); declaration bindings keep the demuted structure dashed family (`--ck-signal-structure-muted`) as the second association layer. Selected overrides to primary 3px. |
| Wire geometry | chrome (readability) | bezier (owner direction 2026-09-28, reverting the V1 smoothstep cut); a wire whose source and target are the same node (the self-referencing children wire) renders as one elliptical arc around the card, per Vue Flow's loopback example — the bezier degenerates there into a line through the node. NO markers anywhere — no arrowheads on any layer. Direction reads from the reading canon: handles on the left are inputs, handles on the right are outputs. |
| Handle position | direction | left = input/target, right = output/source |
| Wire selection | selection | primary color, 3px |

Access (Item/List/Tree) is deliberately **not** a socket visual: one
socket accepts all three, access is a property of what travels the wire,
and it stays a runtime and hover fact.

The payload-family palette
(`processDesignerSocketTone` is the one mapping — see
[utils](../../utils/README.md)) lives on SOCKET HANDLES only: a class
card's `type` output, a state card's status sockets, and a field card's
typed output carry the same tones they carry on operation nodes. Wires
carry exactly one color — the primary accent on the dotted event chain
— and otherwise speak through line style: solid instances, dashed
values, demuted-structure declarations. One contract, one home per
channel: hue on handles, cargo on wires.

**Cards**

| Channel | Encodes | Values |
|---|---|---|
| Card size | species family | `sm` = declaration leaf, `md` = type/class reference, `lg` = operation |
| Card surface | population primacy | OPERATIONS (create, mutate, transition, command — the effect species except remove) render the primary-tinted surface (`--ck-surface-primary`, a whisper of the primary accent over the content surface) — they are the primary nodes; every other node (values, sources, collections, reads, control, the declaration family, and the remove operation) keeps the plain content surface — secondary nodes are surface. The one predicate: `utils/processDesignerPopulation.js` |
| Card border | chrome + selection | the quiet content border for every card; the selected border is the single card state — an unselected node is a diagram element, the selected node is the authoring surface |

Card concern (what a node does) is carried by the label first (with the
icon); the header carries no extra glyph chrome.

### Arrangement

Top to bottom: the header (neutral icon chip + label — no divider, no
trailing glyph); inline configuration (only
species that author values in place); the socket rail (labeled rows,
inputs left / outputs right, every handle
centered on the outer node rail — labels render on every node: a socket
without its name is unreadable chrome); the event section (effects only:
their event sockets as ordinary socket rows). Sections separate by spacing
alone (`mt-2`/`mt-3`, row `py-1.5`) — there are deliberately **no
dividers**: separator lines would form a third visual system competing
with stripes and wires while encoding nothing. Socket rows are one-sided
by construction: a row with only an input or only an output renders
without its empty opposite cell.

### Quiet-card policy (de-fluff)

Unselected cards are diagram elements; the canvas speaks through wire and
socket channels, not per-node chrome:

- The per-node `?` affordance is gone — the card header's hover/focus
  tooltip carries the node spec summary (element type, access,
  qualifier, description) that the `?` used to surface.
- `CtsTypeNode` renders no hint line.
- Class-card meta rows (scope version tag, editor tag, field/state
  counts) live in the header tooltip, not the card face.
- One-sided socket rows drop their placeholder cells.
- Socket row LABELS always render — quiet cards keep their sockets
  named (owner direction 2026-09-28: labels disappearing from unselected
  nodes made the canvas unreadable).

Deliberately meaningless: card background, handle size (fixed 12px),
typography — chrome, never data.

### Lanes (the authorization surface)

Lanes are not a view mode — they are permanent and they ARE role
assignment, and they apply ONLY to effect nodes: effects are the one
population that carries access. Bands render as a TRUE BACKGROUND layer
(beneath nodes and wires, never covering them) — hairline separators
only, no fills — spanning the canvas's horizontal node domain (from the
leftmost node's column to the rightmost's). Lane titles are the
organization's own role names at label size, counter-scaled against the
canvas zoom so they render at absolute screen size. One horizontal lane
per role in the role list's fixed order
(empty roles keep their lane — seeing who has what is the point), plus
an implicit unlabeled lane at the bottom, always present, that catches
grantless effects and everything dropped below the role lanes.

Placement writes membership: dropping an effect node in a role lane
makes that role its grant; dropping it in the implicit lane clears its
grants. Dropping any OTHER node into a lane makes that lane its home
(persisted on the canvas node) — lanes accept everything dropped into
them. This replaces the inspector's role assignment editor — grant
LEVELS per role stay inspector-owned (a lane cannot express them), and
the effective-access summary stays. An effect granted to several roles
(stored records) renders in its primary lane with a translucent
corridor across its other granted lanes at the node's column — the
operation is one record, never cloned, its wires never duplicated.

Effects and state declarations are the PRIMARY populations — they carry
the access/workflow story. The remove (delete) operation is a LANE
EFFECT but presentation-SECONDARY: plain content surface, hidden by the
secondary visibility toggle; the rest of the effect family is always
visible. Every other node — classes, fields, type references, and the
non-effect process nodes — is SECONDARY: unaffected by grants, hidden
by the same toggle (`hidden` is runtime state, never persisted).
Presentation primacy resolves through the one
predicate `utils/processDesignerPopulation.js` (see
[utils](../../utils/README.md)).

Lanes are containers, and a node's vertical coordinate is authored
RELATIVE to its lane (owner direction 2026-09-30): the persisted fact is
the lane offset (`data.laneY`), and the canvas renders
`absolute y = lane top + offset`. Membership is an authored fact too —
effects by grant record, everything else by the lane it was dropped into
(`data.lane`). From those facts one projection pass
(`laneContainerLayout` in `utils/processDesignerArrangement.js`, see
[utils](../../utils/README.md)) derives everything else, deterministically
and idempotently:

- **Bands hug their content completely.** Each band's height is its
  members' offset extent plus padding (empty lanes keep the 150px
  minimum as drop targets), and content seats at the band's top inset:
  seating removes the dead space above a band's content, and deleting a
  card lets the band's content pull up to hug. Authored offsets are
  never negative and never above the band's seated top — a card dropped
  across a lane's top edge seats inside the accepting band (membership
  reads the card's center), and adds and drops never disturb seated
  cards; offsets between lane-mates never change.
- **Bands stack in role order**, so a lane growing shifts every lane
  below — and each lane's content rides with it, because offsets are
  lane-relative. Nothing ever reseats across lanes.
- **The pass never invents coordinates.** It runs on load, add, delete,
  drop, drag-stop, grant edits, and role-list changes (once more when
  the first measured card dimensions arrive), writing only the derived
  absolutes and normalized offsets. Adds keep the viewport-center canvas
  contract, joining the lane under the placement point; a drop lands in
  the accepting lane at its dropped offset (the seating correction above
  is the only adjustment). A drop that lands in NO lane (above the
  stack) leaves the node free-floating outside every band until dropped
  into one. Drafts authored before lanes get facts derived once on load
  by containment against the minimum-height stack.
- **Tidy owns bulk arrangement**: it rewrites offsets inside the same
  lanes (memberships and grants untouched).

Position remains presentation state — never authorization by itself:
the grant record is the authorization, the lane fact is presentation
membership, and both persist with the canvas node.

### Auto-arrangement (Tidy)

The toolbar's canvas group carries one arrangement command: **Tidy**
writes node positions and nothing else — grants, wires, and records are
untouched, and the write marks the draft dirty like any drag. The pass
is the pure helper `utils/processDesignerArrangement.js` (see
[utils](../../utils/README.md)) — deterministic and idempotent:

- **x = column.** Longest-path layering over the flow edges (event and
  data; declaration wires never layer anything). A pred-less node pulls
  up to the column before its first consumer; a cycle-closing edge does
  not advance the layer.
- **Every node lives in exactly one band** — effects by grant,
  secondaries and declarations by their anchor node's band, anchorless
  nodes by nearest band — so nothing crosses a lane divider.
- **y = constrained relaxation.** Each card settles at the median of
  its wired neighbors' y (flow and declaration wires alike), under hard
  constraints: clamped inside its band, per-column separation (no two
  cards in a column overlap), band heights re-derived from content
  after each pass. Runs to a stable state.

### Card behavior details

`ProcessNode.vue` renders the catalog's resolved ports, not stored UI guesses.
Inputs and outputs share explicit rows, and every handle is centered on the
outer node rail rather than inheriting a position from variable-height content.
Socket labels stay concise; the exact element type, access, qualifier, and
description are available on hover and to assistive technology instead of
being repeated beside every socket.
When selected, an unconnected primitive input reveals a compact inline typed
fallback editor; this keeps inactive nodes quiet while preserving immediate
authoring without a separate constant node. A typed status input's fallback
offers the bound type's declared states. An `entityRef` input's fallback is
an instance picker (see the entity-selector contract below), never a
hand-typed id. Create/Modify/Status effect sockets
declare List access for the shared effect mapper, and they keep the same
inline fallback: an authored scalar there is stored as one broadcast item,
exactly as the mapper consumes it. Literal value authoring offers the plain
value bases; a `status` literal base does not exist — statuses are type-scoped
and enter graphs only through state declaration sockets. An EntityRef literal
pairs its type picker with the same instance picker for the value. A connected wire
always wins. An open socket is a composition affordance, not an error.
Process sockets are always optional; validation only rejects invalid wires
and invalid authored contracts — single-value sockets (inputs without
`multiple`) reject a second wire on the connect gesture itself, with the
socket named in the notice.

Fallback/default policy is omission-first. A connected value wins; otherwise
an explicit authored fallback is used. Defaults declared by a construction
mode, command, or operator are applied only by that owning contract. Service-
owned identity, storage ids, origin, status history, and other runtime fields
have no authoring fallback. Lifecycle entry is declaration-owned and is not
a construct input.

Entity bindings are explicit where no wire supplies them. All<T> chooses its
entity type; EntityRef literals keep their type picker. Filtering is All<T> →
Get field → Logic → Filter. Several references become one declared list
through the collection value contract, not a raw array transport toggle.

Only configuration that defines the operation or its ports stays on the
node: value/type, entity, declared edge, field, operator, and socket fallback.
Access grants live in the contextual inspector. Entity producer nodes display
their stable `nodeId:outputSocketId` reference for provenance/field policy;
reads do not display or create producer identity. Resolved input/output
contracts are shown by socket rails and hover/focus metadata. Resolved input/output contracts are shown by the
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
creates and connects it immediately. Dropping the loop item (`forEachEntity`)
creates the loop pair — `control.forEach` and its `control.forEachEnd` closer
beside it — because the closer is part of the loop's semantics, not an
independent authoring choice.

## Status model at runtime

Lifecycle declarations compile to recursive workflow state trees, and the
runtime status is stored in two places by design: the entity carries one
immutable status snapshot with the active leaf path for each independent axis,
actor/timestamp/evidence metadata, while the full transition history is an
append-only `status_events` collection queried through the status service.
The snapshot is the current state for read efficiency; the event log is the
transition history. There are no embedded history arrays.

## Types and connections

Types are structured `{ base, nullable, ...qualifiers }` element contracts.
The process graph preserves exact type and collection contracts through resolution and execution. Parent, child, and relation reads select a declared edge and expose its target type. `cts.field` reads the declared field from the incoming instance. All<T> is an unfiltered typed source; filtering remains ordinary field → logic → filter dataflow. Packet topology and transport adapters are not author-facing node settings.

Get field (`cts.field`) reads the declared field from the incoming instance;
its path choices are the bound type's readable fields, and an unbound node
offers only its entity input. Record Field (`value.recordField`) reads one
authored key off each record value of its List input (service rows,
composed parameter records) with an authored output type — plain record
values have no declared row, so the key is authored, not selected.
Join by key (`collection.join`) authors its `leftKey`/`rightKey` key paths on
the record; Compose record (`record.construct`) authors its field path list
(`fields` resolve their types from the wired context, else json). Both
configurations live on the node's inline configuration area — they are the
operation's own semantics, not grants or policy.
Field extraction and Logic map over the source
topology so Boolean masks stay aligned with the original entities for
`collection.filter`. Packet matching and input transforms are internal
adapters, not inspector settings.

## Canvas behavior and diagnostics

Nodes are added to the nearest unoccupied grid position around the visible
viewport center, and the node joins the lane under that position (see
"Lanes" — an effect's lane is still the grant-derived one, so a grantless
effect created above the implicit lane stays free-floating until dropped).
A newly inserted node must not cover an existing node or
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

The canvas uses its own token-backed work surface behind the shared
`DesignerWorkspace` rails (see
[shared components](../shared/README.md)): palette and inspector are
non-modal overlay rails the toolbar toggles own; canvas clicks never close
them, and canvas Escape still clears graph selection. The floating
PrimeVue `Toolbar` (shared
`DesignerWorkspace` chrome) owns the process lifecycle in its document group
(new draft, save, apply) and the view controls in its canvas group
(zoom out, zoom in, frame all, frame selection, reset zoom, the
secondary visibility toggle, and tidy — the destructive layered pass),
every item
icon-only with its label as tooltip and accessible name. There is no
standalone Validate control:
Apply saves, validates, and activates as one operation, while the result
remains visible as feedback on the canvas.

The right pane owns **definitions management** (the Definitions tab):
a `Listbox` of definitions in the chats-inbox anatomy — each option is a
single line: name (option click loads it to the designer, inline rename
swaps the name span for an input), the activation switch (on = member of
the additive active set — the switch is the state signal, no status
badges), and the versions + ellipsis buttons. The versions button opens a
`Popover` anchored at the row listing activation versions (`data.history`,
newest first) with restore (the snapshot becomes the definition's data
and goes live through activation); history never renders inside the
option. History rows render the timestamp only — actor ids never appear
in the UI. The activation contract lives in
[process-definitions](../../server/features/process-definitions/README.md).

Selection actions follow the quiet-card policy: nodes carry no per-node
chrome, so while a node selection exists a PrimeVue `SpeedDial` floats
beside the last selected node (anchored through the canvas viewport
transform) carrying delete and frame selection. Edge selections keep the
keyboard bindings.

New Draft starts from an empty graph. Save persists the loaded
definition in place — draft or active, one document for its whole life
(see [process-definitions](../../server/features/process-definitions/README.md));
re-activation records the superseded graph in the definition's history.
Dirty state is a primary save affordance plus a small dot, not a
persistent text badge. Delete/Backspace removes all selected nodes and
edges together while preserving definition records that are still
referenced. Home frames the graph, Numpad Decimal frames the selection,
and the toolbar's direct view controls expose frame/zoom without requiring
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
change chevron remains a separate trigger. Node-card `entityRef` authoring
(an EntityRef literal's value and an unconnected entityRef socket's inline
fallback) uses the same `InstanceSelect` contract: options load silently
from the generic instance transport for the socket's exact type, and the
authored reference resolves through the readable-reference seam so the
value renders as the instance card, never a raw id. Process-node field/type
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
drawer overlays and the toolbar stays icon-only (labels as tooltips) so it
survives narrow layouts.

An effect's trigger mode is derived, never authored: every effect card
always shows its incoming event socket, and the operation runs
automatically iff that socket is wired (the derived `trigger.mode` lands
on the compiled record at the sync pass; unwiring it makes the operation
manual again). Event handles use the same left-to-right direction as
data sockets instead of pointing out of the bottom of the card. Pure
value, list/tree, read, and deconstruct nodes do not render event
chrome. Effect failures fail the run; retry behavior is not hidden
effect metadata and must be introduced later as explicit event/control
dataflow.

Canvas accents and Vue Flow handles use the global `signal-*` aliases, not
raw Tailwind hues or inline theme variables. The aliases identify roles
such as entity, data, structure, decision, projection, and effect, so the
process canvas stays legible when the application theme changes.
