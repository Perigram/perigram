# COMPONENT: Process Designer

The authoring surface for CTS declarations and process graphs: a Vue Flow
canvas with palette, inspector, lanes, and apply ceremonies, mounted by
[pages/organization/process.vue](../../pages/organization/process.vue)
over a process definition and by
[`GraphEditorSurface.vue`](./GraphEditorSurface.vue) over a
`graph-document` payload from the dedicated
[organization graph workspace](../../pages/organization/graphs.vue) (SPEC §28 — one canvas law). The grammar it
renders — palette membership, node/edge species, wire legality — is
authored through the designer contract owned by
[packages/processes](../../packages/processes/README.md); this README
owns the surface: channels, arrangement, gestures. Normative state and
species contracts live in
[CTS SPEC §7 and §14](../../packages/cts/SPEC.md).

Parent: [components](../README.md); its [SPEC](../SPEC.md).

The designer shell separates declaration authoring from executable
process composition. Declaration nodes own CTS classes, fields, edges,
recursive state machines, transitions, and operator signatures; process
nodes reference those declarations and retain their native species kinds
and typed ports through save/load/apply/run. Declaration wires are typed
bindings; executable dataflow travels process wires. Status and
transition facts are authored on declarations — the process view selects
them through typed references, and status fallback choices and transition
availability derive from the bound type's projected recursive lifecycle.

Class metadata, fields, states, and children author in the class dialog
([type-designer](../type-designer/README.md)); the canvas declaration
nodes author the graph-composed types, declaration wires, and transition
records. The canvas reconciles an out-of-band draft save by re-fetching
its document on window focus and on a 30s poll, comparing the draft
data signature against the settled load baseline; a dirty canvas
reconciles nothing (its own save is the next write,
last-writer-wins like the canvas itself).

## Canonical graph surface

`GraphEditorSurface` mounts the shared canvas over a `graph-document`
payload through the organization graph workspace. Its Use Graph palette
loads each readable graph payload through the file-read boundary and places
an invocation pinned to the payload's graph identity, revision, and public
interface. The inspector can select a historical source revision and refresh
the invocation sockets from that frozen payload. The source storage-instance
id remains a separate catalog locator. The workspace injects the authorized
CTS query capability used by the core data-query node; preview read sets retain
the returned instance versions and query boundary. Installed plugin runtimes
contribute graph node definitions and preview renderer ids through the
browser Worker runtime bridge, with execution callbacks mediated by the
host. Each graph preview uses one execution id across node invocations and
finalizes that id across every loaded plugin runtime after evaluation settles. Each renderer id resolves to an installed plugin `preview` surface;
the host mounts that surface with the selected graph output as its payload.
Plugin node providers declare semantic palette groups and searchable
keywords; the shared palette search also indexes stable operation, provider,
and group identities. Socket gestures, persisted-edge validation, and preview
preflight use the SDK's canonical semantic port compatibility result. Both
the main palette and socket-context palette use the same search contract.

Preview input controls follow the interface contract: strings, numbers,
integers, and booleans use native controls, while structured and collection
values use a JSON editor with declared type and nullability checks.

The inspector renders node configuration properties from each
definition's JSON schema and edits graph interface transport shape,
semantic base/kind/nullability, required status, and optional defaults. Socket gestures,
persisted-edge validation, and preview preflight share the SDK compatibility
relation.

The graph session contract lives in
[composables](../../composables/README.md#usegraphdocumentsession--canonical-procedural-graph-editor);
the canonical format and evaluator live in
[packages/core](../../packages/core/README.md).

The preview rail exposes **Commit** when the selected output is a
supported CTS instance-patch proposal and the saved graph is current. Commit
uses the proposal's exact target revision and `fail` conflict policy; stale
proposals are rejected by the authoritative instance write service.

## Contracts owned here

### Canvas channel vocabulary

One channel encodes exactly one fact; anything unlisted is chrome and
carries no meaning by design. Every card — the operation card and the
declaration family alike — composes the shared frame and handle
primitives (`DesignerNodeCard`, `DesignerSocketHandle` from
[components/shared](../shared/README.md)), so the contract is enforced
by construction. A handle renders only while its port spec exists.

**Sockets and wires**

| Channel | Encodes | Values |
|---|---|---|
| Socket color | transported payload family | reference (instances, typed references, lists — one tone), structure (declared type bindings), quantity, decision (including status), temporal, external, effect, projection, data; events use the primary accent |
| Socket mark | the connection point | one uniform filled dot for every socket; color is the only socket channel — the handle is a generous target whose dot grows and rings in its color on hover |
| Wire line style | cargo | solid = instances, dashed = values, dotted = events (the one wire family allowed color, `var(--p-primary-color)`); declaration bindings keep the demuted structure-dashed family (`--ck-signal-structure-muted`) as the second association layer |
| Wire geometry | chrome | bezier; the self-referencing children wire renders as one elliptical arc around the card; wires carry no markers — direction reads from handle position |
| Handle position | direction | left = input/target, right = output/source |
| Wire selection | selection | primary color, 3px |

Access (Item/List/Tree) is a hover/runtime fact, carried by no socket
visual: one socket accepts all three, and access is a property of what
travels the wire.

The payload-family palette (`processDesignerSocketTone` is the one
mapping — see [utils](../../utils/README.md)) lives on socket handles
only: a class card's `type` output, a state card's status sockets, and a
field card's typed output carry the same tones they carry on operation
nodes. Hue lives on handles; cargo speaks through wire line style.
Canvas accents and Vue Flow handles use the global `signal-*` aliases,
so the canvas stays legible across application themes.

**Cards**

| Channel | Encodes | Values |
|---|---|
| Card size | species family | `sm` = declaration leaf, `md` = type/class reference, `lg` = operation, `inline` = the one-line literal |
| Card surface | population primacy | the effect species except remove render the primary-tinted surface (`--ck-surface-primary`) — the primary nodes; every other node keeps the plain content surface. One predicate: `utils/processDesignerPopulation.js` |
| Card border | chrome + selection + fault | the quiet content border for every card; the selected border is the selection state; the danger border marks a faulted node — one carrying anchored validation diagnostics for itself or a wire at its endpoint, or its own whole-graph evaluation error (the messages render in the header's fault popover) |

Canvas nodes carry no category accent — the frame is plain; card concern
rides the label and icon. Effects and state declarations are the primary
populations — they carry the access/workflow story. The remove operation
is an effect by population and presentation-secondary: plain content
surface, hidden by the secondary visibility toggle; the rest of the
effect family stays visible. Every other node (classes, fields, type
references, non-effect process nodes) is secondary: unaffected by grants,
hidden by the same toggle (`hidden` is runtime state, stripped before
serialization).

### Card anatomy

Top to bottom: the header (on operation cards: collapse chevron, the
palette section label above the node label, the node-description
affordance, the fault popover on faulted cards, the per-node preview
eye on cards with data outputs), inline
configuration (only species that author values in place), the socket rail
(labeled rows, inputs left / outputs right, every handle centered on the
outer node rail — socket labels render on every expanded node: a socket
without its name is unreadable chrome), and the event section (effects
only). A collapsed card folds to its title with every socket at a
distinct position — inputs on the top rail, outputs on the bottom rail,
the name centered between (names on the handle tooltips); the collapse
state rides the canvas node data and persists with the draft.
Sections separate by spacing alone (`mt-2`/`mt-3`, row `py-1.5`);
separator lines would form a third visual system competing with stripes
and wires while encoding nothing. Socket rows are one-sided by
construction: a row with only an input or only an output drops its empty
opposite cell.

The card header's hover/focus tooltip carries the node's socket contract
(`Expects`/`Outputs`: name — type · access · optional) computed from the
real ports, with the class-card meta rows (scope version tag, editor tag,
field counts). Socket labels stay concise — the exact element
type, access, qualifier, and description are available on hover and to
assistive technology. Resolved input/output contracts are shown by the
labelled socket rails and hover/focus metadata; the inspector does not
repeat a socket-specification table.

The event section renders on effect cards only. An effect's trigger
mode derives from the graph: a wired incoming event socket makes the
operation automatic, and an unwired entry starts by its authored
schedule or event subscription (manual otherwise). The derived
`trigger.mode` lands on the compiled record at the sync pass;
`effectTriggerFor` in
[packages/processes](../../packages/processes/README.md) owns the
derivation.

### Lanes (the authorization surface)

Lanes are permanent and ARE role assignment for effect nodes: dropping an
effect in a role lane writes that grant, and the implicit unlabeled lane
at the bottom — always present — catches grantless effects and clears
grants. Dropping any other node into a lane makes that lane its persisted
home. Grant LEVELS per role stay inspector-owned (a lane cannot express
them), and the effective-access summary stays. An effect carries exactly
one grant — its lane; the save seam collapses any stored record to its
primary grant.

One horizontal lane per role in the role list's fixed order (empty roles
keep their lane — seeing who has what is the point). Bands render as a
true background layer beneath nodes and wires: hairline separators,
spanning the canvas's horizontal node domain, with lane titles in the
organization's own role names, counter-scaled against canvas zoom so they
render at absolute screen size.

A node's vertical coordinate is authored lane-relative: the persisted
fact is the lane offset (`data.laneY`), and the canvas renders
`absolute y = lane top + offset`. Membership is an authored fact too —
effects by grant record, everything else by the lane it was dropped into
(`data.lane`). From those facts one deterministic, idempotent projection
(`laneContainerLayout` in `utils/processDesignerArrangement.js`, see
[utils](../../utils/README.md)) derives the absolutes:

- Bands hug seated content: height is the members' offset extent plus
  padding (empty lanes keep a 150px minimum as drop targets), and content
  seats at the band's top inset. Authored offsets stay at or below the
  seated top: a card dropped across a lane's top edge seats inside the
  accepting band (membership reads the card's center), and adds, drops,
  and deletions leave seated cards and lane-mate offsets untouched.
- Bands stack in role order, so a growing lane shifts every lane below —
  and each lane's content rides with it, because offsets are
  lane-relative. Content stays in its lane.
- The pass writes only derived absolutes and normalized offsets, running
  on load, add, delete, drop, drag-stop, grant edits, and role-list
  changes (once more when the first measured card dimensions arrive).
  Adds keep the viewport-center contract, joining the lane under the
  placement point; a drop lands in the accepting lane at its dropped
  offset (seating is the only adjustment); a drop above the stack leaves
  the node free-floating outside every band until dropped into one.
  Drafts authored before lanes get their facts derived once on load by
  containment against the minimum-height stack.

Position is presentation; the grant record is the authorization, and both
persist with the canvas node. Effect authorization carries two
independent facts: the effect's action roles determine who sees and may
run the process action, and a transition also resolves against the
declared transition's policy — the action's process roles ride the status
runtime for that execution as execution authorization. Screen and
required-access grants remain process policy.

#### Tidy

Tidy rewrites node offsets inside their lanes — memberships, grants,
wires, and records untouched — and marks the draft dirty like any drag.
The pass is the pure `utils/processDesignerArrangement.js`:

- **x = column.** Longest-path layering over the condensation of the flow
  edges (event and data; declaration wires sit outside the layering): a
  mutual pair shares one column, a larger cycle layers internally with
  its closing edge as the one backward span. Weakly connected components
  arrange independently and pack side by side, largest first. Columns
  span their widest card plus air, floored at the resting span. A
  pred-less node pulls up to the column before its first consumer. A
  declaration rides the column of the node it declares on — one left of
  its anchor, one further per declaration hop, so a cluster fans out
  leftward and fields sit beside their class, classes beside their flow.
- **Every node lives in exactly one band** — effects by grant, secondaries
  and declarations by their anchor node's band (the anchor chain resolves
  through the grant, so node order in the array decides nothing),
  anchorless nodes by nearest band.
- **y = band rows.** One row grid per band, pitched to the band's tallest
  card plus the gap. Every card takes the free row nearest the median row
  of its wired neighbors in other cells (flow and declaration wires
  alike); the authored y seeds the rows, and the row sweep in column
  order settles them. No two cards in a column overlap, and a lane hugs
  its content.

### Authoring interactions

- Left drag box-selects, Shift extends; two-finger scroll pans, pinch
  zooms at the pointer, Space+drag pans. On coarse pointers one-finger
  drag pans (nodes stay draggable), pinch still zooms, and long-press
  opens the context palette through the native contextmenu event.
- Right-click on empty canvas opens the palette at that graph position.
  Dropping a wire on empty canvas opens it filtered to operations with a
  compatible opposite socket and connects on choice. Dropping the loop
  item (`forEachEntity`) creates the `control.forEach`/`forEachEnd` pair
  together (the loop-pair law is
  [packages/processes](../../packages/processes/README.md)).
- Nodes place at the nearest unoccupied grid position around the visible
  viewport center — covering no existing node or socket hit target — and
  join the lane under that position (a grantless effect created above the
  implicit lane stays free-floating until dropped).
- Delete/Backspace removes all selected nodes and edges together while
  preserving definition records still referenced. A selected node uses
  one primary border only. Socket handles render at a compact 12px with
  an invisible grab pad; wire weight runs 1.5–2.5px with its cargo
  family. Home frames the graph,
  Numpad Decimal frames the selection; H collapses the selected
  operation cards (collapse wins while any selected card stands open);
  zoom spans 0.1x–4x, and the live
  viewport persists with the graph. While a node selection exists, a
  PrimeVue `SpeedDial` floats beside the last selected node (anchored
  through the canvas viewport transform) carrying delete and frame
  selection; edge selections keep the keyboard bindings.

The palette is the canvas-top dock (`PaletteDock.vue`): provenance tiers
as labels — plugin sections first (palette groups whose registration
declares the pack source), then the platform categories — with one chip
per palette section opening the popover palette. An empty query lists
the active section; a query searches the full catalog. Each row's dot
carries the item's category signal
(`utils/processDesignerSignals.js` is the single group→signal map; its
signal classes are literal in the util because Tailwind compiles from
source text). Search matches the localized job names and descriptions;
rows carry the operation description on hover. The socket-filtered
context palette (right-click, wire drop) renders its list through
`OperationPalette.vue`. Palette
membership, grouping, and provenance are the
[packages/processes](../../packages/processes/README.md) contract.

Inline authoring:

- A selected unconnected primitive input reveals a compact inline typed
  fallback editor; a connected wire always wins, and an open socket is a
  composition affordance. A typed status input's fallback offers the
  bound type's declared states. An `entityRef` input's fallback is an
  instance picker on the shared `InstanceSelect` contract — options load
  silently from the generic instance transport for the socket's exact
  type, and the authored reference resolves through the
  readable-reference seam so the value renders as the instance card.
  Create/Modify/Status/Remove effect sockets (the mapped mutation
  species) declare List access for the shared effect mapper and keep the
  same inline fallback: an authored scalar is stored as one broadcast
  item, exactly as the mapper consumes it.
  Literal authoring offers the plain value bases (an EntityRef literal
  pairs its type picker with the same instance picker); statuses are
  type-scoped and enter graphs only through state declaration sockets.
  Process-node field and type selectors use ordinary PrimeVue controls —
  their values are schemas.
- Process sockets are always optional; validation rejects invalid wires
  and invalid authored contracts. Single-value sockets (inputs without
  `multiple`) reject a second wire on the connect gesture itself, with
  the socket named in the notice.
- Fallback/default policy is omission-first: a connected value wins, then
  an explicit authored fallback; defaults declared by a construction
  mode, command, or operator are applied by that owning contract.
  Service-owned identity, storage ids, origin, and status history stay
  runtime-owned. Lifecycle entry is declaration-owned: the construct
  carries no status input — the type declaration owns initial state.
- Only configuration that defines the operation or its ports stays on the
  node: value/type, entity, declared edge, field, operator, and socket
  fallback. Access grants live in the contextual inspector.
  Record-carried semantics (`collection.join` keys, `value.recordField`
  path, `record.construct` fields, the terminal nodes' failure
  `message`/success `result` — see
  [packages/processes](../../packages/processes/README.md)) author in the
  inspector's per-kind configuration. Entity bindings are explicit
  where no wire supplies them: EntityRef literals keep their type picker;
  All\<T\> binds through its Type pin like the unbound construct, and
  filtering is All\<T\> → Get field → Logic → Filter dataflow.

Live evaluation (`useProcessDesignerLiveGraph` over
`interpretDeclarationEdges`): the designer behaves like a node editor.
Authoring state (canvas nodes minus presentation, edges, draft records)
folds into one semantic signature; any change — a wire, a rename, an
inspector edit — re-runs wire interpretation and the sync pass in the
same tick, and the compile is gated on the authoring signature, so drags
and selection churn re-evaluate nothing. Declaration wires are live
binding channels: a field node's type id follows the class it
declares on, and a species record's binding resolves by precedence — its
Type wire (origin species) or entity-input source type (consumers), else
the stored preset. Renaming a class re-binds every wired descendant
(constructs gain or lose their row-field sockets immediately); removing
the channel that supplied a binding clears it, while a preset no channel
ever supplied is authored data and stays; a binding naming a type that
exists nowhere (registry view or tree) is dangling, and the live pass
clears it. Deleting a node removes the producer outputs it anchored and
resets join selections that pointed at them. Sockets may vanish and
return during transient authoring (an unset ref mid-gesture, a rename in
progress); edges survive transient states because serialization owns
stale-edge filtering. Unfinished authoring is silent: an unnamed field
and an unset ref stay out of the declaration until completed, like any
unsaved edit. Declaration authoring validates live — the class inspector
enforces the registry's kebab-case type id (an invalid id is why a class
silently drops out of the overlay and bound sockets stop regenerating)
and shows `compileTreeDeclarations` plus `normalizeType` diagnostics while
authoring, so what SAVE/APPLY rejects is visible immediately; the compile
gates on the declaration plane's authoring signature (declaration cards,
type wires, process records).

Declaration wires (`declarationWireLegality` in
`packages/processes/src/designer.js`) connect declaration partners:
field nodes declare on a class; class/type-reference nodes target a ref
field's accepted targets; class/reference nodes bind an origin species
Type pin; state→state wires declare one parent relationship (`nested`);
state→operation wires (`entry`) author a construct's initial state and a
transition's target — the wire is the value (SPEC §7: states wire into
create/transition operations and parent states only). Children wires
accept type-reference targets beside
in-tree classes — an org type's containment may name pack, other registry
types, and itself (recursive containment, SPEC §6, rendered as a hoop
over the card) — and land child-first (`childrenWireLegality`): the edge
leaves the child's `output:type` and enters the parent's `input:declare`,
exactly as drawn. The drawn target must be a class that can parent (item,
group, process — SPEC §5); any other drawn target — a file or party
class, or a type-reference card — is refused at the connect gate with the
containment reason: the wire lands as drawn, an illegal direction is an
error, and the canvas re-orients nothing.

A ref field's accepted target types arrive as wired inputs: wiring a
class or type reference into the field node's targets socket derives the
descriptor's `accepts` live from the tree; the socket carries the target's
registry id verbatim (kebab), so ref field inputs typecheck against real
entity outputs; the inspector multiselect over registry types remains the
fallback for types with no canvas node. A row-carried reference pins
`slot: 'data'` in its descriptor. Transition operations are process nodes
(`cts.transition`) selecting one declared transition and an optional
intent against their bound type.

Declaration edges persist as `role: 'type'` records and round-trip as
bindings. `compileTreeDeclarations` is the one declaration compiler;
diagnostics name the authored class before its opaque id. SAVE keeps
declaration records in the draft; APPLY posts the compiled declarations
before compiling the process graph.

Chrome: the canvas uses its own token-backed work surface behind the
shared `DesignerWorkspace` chrome
([components/shared](../shared/README.md)). The palette is the
canvas-top dock inside the canvas slot; the inspector is a non-modal
overlay drawer rail the toolbar toggle owns — canvas clicks keep it
open, and canvas Escape clears graph selection. The floating
PrimeVue `Toolbar` (shared `DesignerWorkspace` chrome) owns the process
lifecycle in its document group (New Draft, Save, Apply) and the view
controls in its canvas group (zoom out/in, frame all, frame selection,
reset zoom, the secondary visibility toggle, Tidy), every item icon-only
with its label as tooltip and accessible name, so the toolbar survives
narrow layouts.

### Node-data and identity

Node cards and the inspector read exactly one derivation: `enrichNodeData`
is the single node-data enrichment pass (record sync, derived labels, port
specs, option lists), run by initial projection and every live sync;
`stripRuntimeNodeData` owns the derived keys. `operationKindOf` may
classify a record for shared behavior; no path changes a record's kind or
ports. All consumers use their native `entity` socket through validation
and execution.

Origin species that author a type — the construct and the origin reads
(`current`/`all`) — carry a persistent Type pin; consumer species bind
through their entity input, and type-changing reads carry the declared
target type. Species cards have one operation channel: the binding
channel owns the type, the species owns the operation. A process binds a
type by dropping the unbound `construct` operation and wiring its Type
pin to a class or type-reference node.

Class identity is the authored name — renaming is a pure label change:
persisted instances, posted org types, producer outputs, and relation
references keep resolving. The registry id is opaque and randomly
generated (`mintId` in `utils/processDesignerIdentity.js`: time + counter
+ random, minted at node creation, so same-millisecond drops cannot
collide), shown nowhere, edited nowhere; the same module mints every
canvas/definition id the designer creates at runtime (graph nodes,
edges, services, sockets, stations).

### Apply ceremony

Apply saves, validates, and activates as one operation with
first-diagnostic focus. Declaration-post failures abort before validation
and land in the persistent validation feedback on the canvas, so an Apply
refused by the registry keeps showing its cause after the toasts expire.
Failed validation and activation responses carry structured diagnostics
(`nodeId`, `edgeId`, `socketId`, `producerOutputId` anchors), and the
first anchored diagnostic selects its edge or node on the canvas —
framing it into view — before the error message is shown. Validation
reports missing sockets, incompatible types, guessed/undeclared fields,
unreachable operational nodes, and data or control cycles. Screen
requirements consume capability authored on role, profile, or action
access records: a gated screen renders once selected roles supply its
capability, and screen edits author process policy only.

Apply pauses on two gates, each with its own consent dialog:

| Gate | Pause | Dialog |
|---|---|---|
| Breaking type change with live instances and no covering `migrate` steps (CTS SPEC §11) | `pendingTypeMigration` | `TypeMigrationStepsDialog`: one row per breaking change, labeled by the type's authored NAME and the field's authored LABEL; an uncoverable change renders blocked with the reason |
| Removed workflow states with live instances that the draft's declared migrations (`data.migrations.statuses`) leave uncovered | `pendingMigration` | `ApplyMigrationDialog`: one target state per removed state, pre-filled from the declarations; confirming persists the mappings as a declaration on the draft, saves, then activates. See the Apply migration contract in [server/features/process-definitions](../../server/features/process-definitions/README.md) and the refusal payload contract in [server/features/cts-types](../../server/features/cts-types/README.md) |


`TypeMigrationStepsDialog` offers the declarative steps; confirming writes
them onto the matching class node's `data.migrate` (found by typeId),
syncs, and retries the Apply — the dialog is the author's consent. Steps
are one-time: they clear from the tree when their declaration post
succeeds.

| Step | Authoring |
|---|---|
| `rename-field` / `rename-enum-value` | one new-name choice; enum targets are the type's retained states |
| `retype-field` | keep the value (`{op:'var',name:'value'}`) or set it empty (`{op:'lit',value:null}`) — the two retype expressions the CEL evaluator supports |
| `add-default-field` | one default value |
| `remove-field` / `remove-edge` | confirm-only; a removed containment's stored parent links detach and children become roots |

New Draft starts from an empty graph and surfaces creation failure. Save
persists the loaded definition in place — draft or active, one document
for its whole life (see
[server/features/process-definitions](../../server/features/process-definitions/README.md))
— and stays available for every loaded process, persisting the authored
graph as a draft even when it fails activation validation; the dirty
marker is attention, never a persistence gate. Re-activation records the
superseded graph in the definition's history. New Draft, Save, and Apply
run independent of node selection or inspector tab.

The right pane owns definitions management (the Definitions tab): a
`Listbox` in the chats-inbox anatomy. Each option is one line: the name
(option click loads the definition into the designer; inline rename swaps
the name span for an input), the activation switch (on = member of the
additive active set; the switch is the state signal), and the versions +
ellipsis buttons. The versions button opens a `Popover` anchored at the
row listing activation versions (`data.history`, newest first) with
restore — the snapshot becomes the definition's data and goes live
through activation. History rows render the timestamp only. The
activation contract lives in
[server/features/process-definitions](../../server/features/process-definitions/README.md).

### Screens (Roles tab)

`useProcessDesignerScreens` owns station customization, source-id
reference updates, mode normalization, lineage rows, and typed scalar-map
mutations. Stations render per selected role under the Roles tab. The
compiled preview IS the station inventory: stations absent
from `data.screens` are inference-owned, rendered read-only and marked as
inferred, and their only authoring gesture is **Customize**, which
duplicates the station into an authored record — fresh id and route,
compile-only keys (`labelKey`, `sourceRoute`) and compile-attached
lineage bindings dropped, kind preserved. An untouched duplicate stays
projection-equal (overrides derive from shape), and Apply's redundancy
guard refuses it until the author actually deviates. Authored stations
suppress only the station they equal in kind; per-kind suppression is the
process compiler's inference
([packages/processes](../../packages/processes/README.md)). Standalone
non-type screens (home, route) are plain authored records edited in
place; retargeting a duplicate's template is the standalone authoring
path. When grants infer zero stations and nothing is authored, the tab
renders an explanatory empty state (stations derive from role access
grants).

The preview renders every emitted screen through the real generator
(`composeScreen` + the ui-mapping registry) over the CTS-vocabulary UI
contract, with an empty instance pool — a structural preview; the runtime
data layer is the screens-route renderer's concern. It lowers the
authored snapshot through the same acceptance seam the server uses
(`prepareAuthoredDefinition`) before compiling, so `cts.*` species
records drive actions, grants, and inferred screens exactly as at
validate/apply. The preview carries the authored display tokens (the live
tree overlay feeds the same registry the preview compiles), and titles,
headers, and icons resolve through the one resolvers
(`titleFor`/`fieldLabel`/`iconFor` in
[shared/ui-mapping](../../shared/ui-mapping/README.md)) — toggling the
identifier field, editing a display label, or picking a glyph shows in
the preview rows immediately. Screen mutations render against the
canonical
[`screen-contract.js`](../../packages/processes/src/screen-contract.js)
normalizer and validator.

### Preview (channel tabs)

The preview tab always renders. The built-in outputs channel comes
first: `GraphOutputsChannel.vue` over `graphOutputEntries`
([utils](../../utils/README.md)) lists every visible evaluated output
under its card labels — section and node, socket label and type, branch
paths, sampled items — and a hidden node's error alone. A graph whose
service nodes all bind served client engines evaluates in the browser
(SPEC §20): the evaluator hosts client-side with the engine loader as
its service channel, so local-service graphs preview with zero server
round-trips. Installed
plugins declare further channels (SPEC §28): each renders its plugin
surface read-only (`PreviewChannelMount.vue`, the
same contract-1 mount the generic preview slots ride) over the
whole-graph preview evaluation — the evaluation runs when the tab opens
and re-runs on authoring changes while it stays open (one debounced
seam), with no target node, so every data node evaluates, no effect
species executes, and an endpoint value service evaluates through its
connector dispatch (a claim-mode service answers the node error);
the serialized
result (`{ nodes: { [id]: { outputs, error? } } }`) is every channel's
payload, and each node's `error` folds into the canvas fault states
beside the validation diagnostics. A plugin channel that cannot mount
(unconfigured executor, refused contract) renders its unavailable state
beside the other tabs.

Preview visibility rides the record per node: the eye on a card's
header (rendered when the node has data outputs) authors
`previewVisible` — `false` removes the node's outputs from the channel
payload, absent or `null` keeps them. A hidden node keeps its error so
fault states survive the hiding.

### Graph document surface (SPEC §28)

Two mounts, one canvas. `GraphCanvas.vue` owns the canvas presentation —
the Vue Flow graph with node/edge templates, the palette dock, the
context palette, the selection speed dial, the empty state, and the
validation feedback strip — over the session composable's state and
verbs passed as props (`v-model:nodes`/`v-model:edges`, palette groups,
gesture handlers). The `lane` slot carries a host's zoom-pane background
(the process page's lane bands); the `inspector` slot carries the host's
rail content. Function-ref props (`bindFrame`, `bindContextPaletteSearch`)
hand the mounted instances to the session's refs — plain ref props would
unwrap at the host template. `readOnly` renders the canvas alone: the
palettes, the dial, node dragging, and the pane palette gesture are off.

`GraphInspector.vue` is the node/edge inspector body (pure presentation,
events back to the host's update/sync entry points); the host owns the
tab shell around it. `GraphPreviewPanel.vue` renders the channel-tab
strip over the whole-graph evaluation
([`useGraphChannelPreview`](../../composables/README.md)).

`GraphEditorSurface.vue` is the graph-document editor mount registered as
the `graph-editor` file surface
([generated](../generated/README.md) owns the binding contract). It uses
`useGraphDocumentSession`, not the process-definition session: payload
text is parsed and validated as the canonical `perigram.graph` document
owned by `@perigram/core`, and saves serialize that same format through
the instance payload transport. It reuses `GraphCanvas.vue` for the
canvas/palette/selection presentation, while provider contracts supply
node sockets and the graph-specific inspector edits JSON configuration
and boundary labels. Graph Input, Graph Output, and a distinct Use Graph
palette group are exposed. Preview invokes the core procedural evaluator
with registered process data-node adapters; the preview panel accepts
JSON graph-input bindings and displays graph outputs plus per-node outputs.
The canvas activity indicator opens that preview panel directly. Preview
is read-only and does not commit organization state. The Use Graph invocation UI currently
authors its pinned graph ID, revision, and public-interface snapshot in
the node's JSON configuration; graph-document discovery and automatic
revision/interface hydration remain follow-up work. The header chrome
channel binds `{ name, dirty, saving, save(), rename() }`; a read grant
binds the name alone and mounts the canvas read-only.

### Inspector anatomy

Per-kind sections in [`inspector/`](./inspector/), pure presentation —
every mutation is an event back to the page's update/sync entry points.

- `ProcessNodeInspector.vue` — effect construction, declared edge
  selection, the transition guard editor (a flat all-of/any-of condition
  list over the bound type's row-relative fields — a projection reading
  and writing the guard expression AST), pure output inspection, and
  per-grant access LEVELS (role assignment itself is lane placement).
  Unwired effect entries author their start: a schedule (`at`
  date-time, repeating ISO `interval`) or an event subscription
  (`eventId` over the domain events) — the wire keeps precedence.
  The state-policy facet (visible/editable row-field lists narrowing
  instances of the state, SPEC §7) authors here, on the typed operation
  (transition target / construct initial state).
- `DeclarationInspector.vue` — class/field/state/type-reference records.
  A state authors the value and display severity/icon. Class display
  tokens follow SPEC §4: beside the name, a glyph row offers a curated
  PrimeIcon set, the generated icon-font palette (every `ck-*` glyph the
  fonts carry, `shared/icon-fonts.js`), and a free-text override; an
  absent glyph derives from the class default table. A `file`-class type
  authors its payload traits (SPEC §4) beside the class pick: accepted
  MIME (chips from the offered families or typed; an empty list leaves the type payload-less and
  fields alone satisfy the class), size limit, preview mode, and creation
  protocols. A field authors its
  descriptor through the shared `DescriptorEditor`
  (`components/type-designer/DescriptorEditor.vue`): base kind,
  qualifiers (unit, ref targets, enum values, variant tags, list/map item
  types, nested record fields), nullable, and the mutability pair —
  Writable governs mutate leaf sockets and update paths, Constructible
  governs construct sockets and creation forms. The class inspector's
  names-the-record dropdown moves the single `identifier: true` holder
  across the class's field nodes (enabling clears the previous holder;
  with none authored the declaration carries the identifier compile
  error until a field is picked).
- `DeclarationEdgeInspector.vue` — typed edge integrity.

Pure and read nodes expose the Output data inspector: each output with
its declared socket type beside branch paths, sampled values, and
branch/item counts, rendered live from the whole-graph channel
evaluation while the inspector (or preview tab) is open — the Inspect
control re-runs the node's own evaluation on demand. Sampled items
distinguish a
present `null` from a missing field (`missing(<path>)`, the serialized
missing-field tag); secret or opaque values arrive already redacted by
the preview boundary. Preview execution suppresses effects and control
nodes, which show no inspection action.

## Structure

18 SFCs at folder root — canvas nodes (`ProcessNode.vue`, `GraphDocumentNode.vue`, `CtsTypeNode.vue`),
the shared canvas presentation (`GraphCanvas.vue`), the graph-document
editor mount (`GraphEditorSurface.vue`), graph-specific inspector and preview (`GraphDocumentInspector.vue`, `GraphDocumentPreviewPanel.vue`), the process inspector body
(`GraphInspector.vue`) and channel-tab strip (`GraphPreviewPanel.vue`),
the built-in outputs channel (`GraphOutputsChannel.vue`),
the palette dock (`PaletteDock.vue`), the context palette list
(`OperationPalette.vue`), lanes (`LaneBands.vue`), the loop edge
(`SelfLoopEdge.vue`), preview channels (`PreviewChannelMount.vue`),
dialogs (`TypeMigrationStepsDialog.vue`,
`ApplyMigrationDialog.vue`), and `TypedValueControl.vue` — plus
`inspector/` (3 SFCs:
`DeclarationEdgeInspector`, `DeclarationInspector`,
`ProcessNodeInspector`). The class/field/state declaration cards render
through the shared `components/type-designer` SFCs (`TypeNode.vue`,
`FieldNode.vue`, `StateNode.vue`), which compose the same
`DesignerNodeCard`/`DesignerSocketHandle` primitives. Selection, draft
persistence, graph sync,
connection inference, palette queries, roles, screens, and panel state
live in the focused `useProcessDesigner*` composables; pure projections
in `utils/processDesigner*.js`:

- `useProcessDesignerGraphSession` — the canvas authoring core
  ([composables](../../composables/README.md) owns the contract): the
  page composes it and owns the process plane — the definitions
  lifecycle, lanes, roles, screens, and the Apply ceremony — around it.
- `useProcessDesignerTypes` — the CTS registry generation, the projected
  designer contract, and the live tree overlay (one registry per overlay
  signature; APPLY persists declarations through
  `persistTreeDeclarations`; `compileTreeDeclarations` emits in
  dependency order — a type referenced by another declaration's children
  edge or ref-field accepts comes first, so one apply introduces a parent
  and its child together; the registry compiles cross-references only
  against stored and already-posted types).
- `useProcessDesignerNodeSync` — the record-derivation family
  (`syncProcessNode`, construction contracts, port resolution, labels,
  option lists); mutations flow back through the page's single sync
  entry point, and the sync functions stay out of the live-graph pass.
- `useProcessDesignerCanvas` — viewport, zoom, keyboard, coarse-pointer
  pan, node placement.
- `useProcessDesignerContextPalette` — the socket-filtered drop palette.
- `useProcessDesignerApply`, `useProcessDesignerScreens`,
  `useProcessDesignerLiveGraph` — the Apply ceremony, the Screens tab,
  and live evaluation.
- `utils/processDesignerPaletteText.js` (localized palette labels),
  `utils/processDesignerCommandPorts.js` (pure command-contract →
  port-row projection for the runCommand panel), and
  `utils/processDesignerDefinitionRecords.js` (pure service/socket record
  factories — definition-plane records kept out of the node-record
  factories).

## Laws

- Palette membership and node/edge grammar:
  [packages/processes/README.md](../../packages/processes/README.md) —
  the single home.
- Declaration semantics and naming grammar:
  [packages/cts/SPEC.md](../../packages/cts/SPEC.md).
- Runtime status model (entity status snapshot + `status_events`
  history): [server/core/machines/README.md](../../server/core/machines/README.md).
- Frame and workspace primitives: [components/shared](../shared/README.md).
- Socket tones, signals, population, arrangement:
  [utils/README.md](../../utils/README.md).
- Definition persistence, activation, and Apply migration:
  [server/features/process-definitions](../../server/features/process-definitions/README.md);
  type-migration refusal payloads:
  [server/features/cts-types](../../server/features/cts-types/README.md).
- Parent: [components](../README.md); its [SPEC](../SPEC.md).


The graph-document workspace keeps procedural graph authoring separate
from process-definition lifecycle. Its inspector authors graph nodes and
public interfaces; the support rail is a separate preview workspace with
output selection, generic representations, and optional provider-owned
read-only renderers. The graph session accepts validated provider
contributions from the host (the `nodeProviders` prop) and keeps operation
identity, executor ownership, and preview renderer identity
provider-qualified. Stored graph documents are ordinary CTS
`graph-document` instances; every payload save is an immutable content
revision, and Use Graph pins a chosen revision rather than following the
latest payload.
