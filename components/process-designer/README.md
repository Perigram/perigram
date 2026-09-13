# COMPONENT: Process Designer

The organization process designer authors the `@cutkit/processes`
`dataflowVersion: 4` contract. Executable canvas records are `processNode`
operations (plus inline-editable status definition nodes). Producer outputs,
actions, services, sockets, value inputs, screens, role grants, and service
principals are definition-plane records: they are never projected as canvas
nodes, survive the canvas round trip untouched, and are edited in focused
surfaces — the producer workflow inspector opens on the entity-producing
process node, while services and sockets are edited in collapsible panels of
the Roles tab. Role identities are organization data,
and the Roles panel performs immediate organization CRUD independently of
process Save/Apply. Assignments belong to Team Management. Statuses have a
definition item in the Entities palette and render as inline-editable canvas
nodes; they are not inspector tabs or process-selector controls. A status node
exposes one typed `status` output backed by its stable definition reference.
Modify Entity consumes that output through `status.state.primary`; changing the
authored status id updates the referenced value without breaking the wire.

The route is a composition surface, not the owner of every editor concern.
Focused composables own process selection, draft persistence, graph selection
and deletion, connection inference, palette queries, inspector record access,
roles, screens, and dock/panel state. Their contracts are exercised directly in
behavior tests so a disconnected Save, selection, or graph mutation fails even
when labels remain in the page source.

The Entities palette ends with **Join producer paths** (`producer.join`), the
one legal convergence point for same-type producer paths: activation rejects
implicitly converging wires elsewhere on the graph. Its inspector authors the
entity type and the resulting producer output (offered from the join's
connected sources); selecting an entity type resets the selection, and the
join never becomes a workflow anchor of its own.

Validation and Apply focus the responsible graph element: failed validation
and activation responses carry structured diagnostics (`nodeId`, `edgeId`,
`socketId`, `producerOutputId` anchors), and the first anchored diagnostic
selects its edge or node on the canvas before the error message is shown.

Effect-node authorization is authored as roles only, because the node is the
complete access context: entity type, producer path, workflow, and transition
are already fixed by the node and its wiring, and the compiler derives the
action access window (`feature`, `statusFrom`, `statusTo`, scope) from them.
The inspector separates the two authorization axes explicitly, operation
first: **"Action roles"** (one roles multiselect per effect node, levels
default write / deletion admin) — the action *belongs to* those roles: they
receive the action in their compiled action list and a status-scoped data
grant for the node's resulting state (`feature` + `level` + `primaryStatus`
rule derived from the node), matching the original `grantFromAction`
semantics; it is not an execution-permission check. Authored action roles
are the primary exposure source: the compiled action list and the workflow
transition's `processRoleIds` come from them first, and executability
derived from the input window's write access only fills in when the action
declares no roles of its own. Inside the producer
workflow panel, **"Entity data access"** ("Can view / edit / manage
entities", "Fields visible on read / editable on write / admin-only")
governs the entities the producer emits. Neither offers an entity/feature picker or a per-grant condition
dialog; the grant-conditions dialog is reserved for surfaces that genuinely
own a feature dimension (screen required access, process base grants).
The producer workflow panel (status machine + entity data access) appears
only on origin nodes — Create Entity, Run Producer, Run Service — because
only origins own a producer output. Consumer nodes (Update, Change Status,
Archive, Delete) show no workflow section: they transform entities from
their input wire and bind to the upstream producer, so the machine is edited
exactly once, where the entity path begins. A status-change node's target
status is authored by wiring a status definition socket (or the node's
inline status control), never a duplicate inspector select; the source state
is derived at compile time from the incoming entity flow.
`useProcessDesignerScreens` owns source/region creation, source-id reference
updates, mode normalization, lineage rows, and typed scalar-map mutations. The
Screens tab renders those mutations against the canonical
[`screen-contract.js`](../../packages/processes/src/screen-contract.js)
normalizer and validator; it does not maintain a page-local screen schema.

## Palette and node concerns

The runtime catalog remains exhaustive, but it is not the authoring palette.
The palette has three non-overlapping authoring concerns.

- **Entities** owns typed block assembly and persistence. Compose Block creates
  one canonical block from selected fields. Modify Block copies a connected
  block and replaces only its connected selected fields. Deconstruct Entity
  exposes declared blocks, Get Block extracts one block, and Get Field reads
  one field from a block. Create Entity accepts constructible blocks plus lifecycle
  status; Modify Entity accepts the current entity, replacement blocks, and
  status, and changes only connected blocks. Neither persistence node exposes
  leaf constructor fields.
- Create Entity first selects the domain entity. Generic construction consumes
  canonical blocks; when a derived entity declares multiple real construction
  strategies, a selector chooses the typed inputs. Single-option internal modes
  are not shown as authoring choices. Producer identifiers
  remain runtime/domain contracts and do not leak into the palette as one-off
  upload/source nodes.
  Cassette creation is generic block composition; it does not expose a
  cassette-specific template-name constructor socket.
- Containment is authored through the target entity's `lineage` block. The
  compiler derives the ancestor entity type and lineage key from the connected
  entity socket and emits a compiled Lineage binding; Create
  Entity does not assign an entity-specific parent or add a parent socket. The
  complete CNC construction registry has no `parentEnforcement` declaration;
  requiredness belongs to constructor inputs and composed block fields, not to
  a hidden containment rule.
- Select Entities is the organization-scoped source for an existing typed
  entity list. Registered commands use the single Run Service operation, whose
  sockets are projected from the selected command's entity, parameter, and
  output contracts.
- **Values** contains one typed value input and one operation-switching node
  each for logic/comparison, text, math, and date-time work.
- **Lists and trees** contains only CRUD-path list operations. Procedural tree
  transforms remain runtime-compatible but are omitted from the primary palette
  until a documented entity workflow requires them. Make List is the fixed-arity
  constructor: exactly four optional item sockets, one wire each, consumed in socket order, and an empty list
  when nothing is wired. Sort Items and Remove Duplicates consume the original item list
  plus an aligned key list from Get Field; Sort's direction is one inline
  `asc`/`desc` selector, and Remove Duplicates' key list is optional (item
  equality otherwise). Group By consumes the same items-plus-keys pair and
  appends a group index to each source branch path. Item At and Slice expose
  authorable integer fallbacks for their index/start/end sockets with native
  negative-index and empty-list behavior. Collect Array converts one branch
  into one persisted array value; Expand Array performs the reverse. Matching
  is Longest by default, with Shortest and Cross available per node.
Every effect has one bottom execution switch: Manual exposes the operation to
authorized users, while Automatic exposes an incoming event socket. Date
scheduling and event subscriptions are runtime contracts, not an authoring
palette family. Every effect exposes one `completed` event there. Event handles use the same
left-to-right direction as data sockets instead of pointing out of the bottom
of the card. Pure value, list/tree, read, and deconstruct nodes do not render
event chrome. Effect failures fail the run; retry behavior is not hidden effect
metadata and must be introduced later as explicit event/control dataflow.

There is no advanced reveal and no separate “starts and inputs”, “process
flow”, or “selection and filtering” taxonomy. Filtering is ordinary dataflow:
deconstruct/read a field over an entity list, evaluate it with Logic to obtain
a Boolean mask, then feed that mask and the original list to Filter.

## Authoring capability matrix

| User goal | Authoring path | Runtime boundary |
|---|---|---|
| Create an entity | Value/block nodes → Create Entity; select a typed construction mode when declared | Entity service or declared construction service |
| Select and filter entities | Select Entities → Deconstruct/Get Block/Get Field → Logic → Filter List | Organization-scoped readable entity query |
| Read entity structure | Entity → Deconstruct Entity or Get Block → Get Field | Pure evaluator |
| Compose or modify a block | Values → Compose Block, or Block + values → Modify Block | Pure evaluator with canonical block schema |
| Persist replacements/status | Entity/block/status → Modify Entity | Entity field policy and Status engine |
| Run a service | Typed values/entities → Run Service | Registered command handler |
| Run manually or chain effects | Manual effect, or completion → Automatic effect | Durable orchestration |
| Reshape collections | CRUD-path list operations | Pure data-tree evaluator |

Run Service stays one typed command leaf: the node selects a registered
command and its typed inputs/outputs, and nothing more. The designer has no
service lifecycle, scheduling, worker, retry, or queue-management surface;
async completion is the durable Run Service boundary owned by the runtime
(wait/receipt/ingestion records), never a designer-managed concept.

The exhaustive runtime catalog, producer effects, predicates, patches,
conversions, and trigger-payload helpers have no direct authoring entry.

Entity choices are filtered per operation. Create Entity lists only entities
with effective creation modes; Modify Entity lists entities with writable
fields; Change Status lists entities with a status workflow; archive and hard
delete derive from a workflow `ARCHIVED` state and `operations.delete`. The
designer consumes the canonical projection `projectEntityProcessCapabilities`
for create choices: the page loads the serialized registry-owned projection
(`/api/admin/domain` `processCapabilities`) and feeds its `createModes` back
into the designer contract, so palette availability and mode choices come from
the same per-mode record the compiler and runtime consume rather than being
reconstructed from `domain.construction`. The registry contract test proves
palette availability, compiler validation, registered runtime handlers, and
effect execution dispatch agree for every entity and construction mode. Its
Create matrix also checks all 14 creatable entities for normalized creator and
attachment constraints, required/default behavior, typed references,
constructible Lineage/Relations blocks, List-access mutation sockets, and the
typed initial-status socket.

Runtime-only payload extraction, casts, parsing, nullable removal,
entity-reference conversion, JSON conversion, predicates, and patch assembly
are never ordinary palette choices. Safe coercions such as integer-to-number
and entity-to-reference are wire semantics; an unsafe connection is rejected
instead of creating an unexplained empty conversion node.

`ProcessNode.vue` renders the catalog's resolved ports, not stored UI guesses.
Inputs and outputs share explicit rows, and every handle is centered on the
outer node rail rather than inheriting a position from variable-height content.
Socket labels stay concise; the exact element type, access, qualifier, and
description are available on hover and to assistive technology instead of
being repeated beside every socket. Color communicates transported base type,
handle shape communicates Item/List/Tree access, and the thin node stripe
communicates operation concern. The shared `processDesignerSocketTone` mapping
drives both a source handle and its wire, so a contract has one semantic tone
throughout the canvas. Port labels sit on unboxed left/right rails rather than
inside independently colored chips. When selected, an unconnected primitive
input reveals a compact inline typed fallback editor; this keeps inactive nodes
quiet while preserving immediate authoring without a separate constant node.
Create/Modify/Status effect sockets declare List access for the shared effect
mapper, and they keep the same inline fallback: an authored scalar there is
stored as one broadcast item, exactly as the mapper consumes it.
A connected wire always wins. An open socket is a composition affordance, not
an error. Process sockets are always optional; validation only rejects invalid
wires, duplicate single-value connections, and invalid authored contracts.

Fallback/default policy is omission-first. A connected value wins; otherwise
an explicit authored `inputDefaults` value is used. If neither exists, the
input is omitted. Defaults
declared by a construction mode or command are applied only by that owning
domain/runtime contract—generic block authoring does not guess them. Generated
identity uid, Mongo `_id`, origin, status history, and other service-owned
fields have no authoring fallback and cannot be composed or modified. Initial
status is the separate lifecycle input.

Entity and block bindings are explicit. Query Entities chooses its entity type;
open block rows choose their key and element type. Neither a source socket nor
a downstream consumer rewrites those choices. Filtering is Query → Get Field →
Logic → Cull Pattern/Dispatch. Several references become one stored collection
only through Collect Array.

Only configuration that defines the operation or its ports stays on the node:
value/type, entity, field, block, operation, trigger identity/mode, and socket
fallback. Access grants, selected compose/modify field sets, and
other secondary record policy live in the contextual inspector. A status node
still authors its identity and exposes its output on the canvas; color, icon,
and lifecycle evidence schemas are edited in the inspector.
Entity producer nodes display their stable `nodeId:outputSocketId` reference
beside the schema-only entity type. Inspector record access uses that reference,
so same-type producers edit and persist separate workflow records.
Designer synchronization resolves records only through the authored
producer-output protocol: canvas entity-node connections and relation choices
read `producerOutputs` (never detached profiles), role-access summaries read
the producer output's authored `allowedRoles`, and a new Create node seeds its
entry status from the domain-declared workflow initial for the entity type —
the same deterministic `domainDefault` resolution the compiler performs —
instead of copying a status from a persisted same-type record. Entity types
without a domain workflow seed no status and fail activation with the missing
entry state.
When an operational node's resolved outputs change, the designer synchronizes
its producer-output records and writes the sole entity output identity onto the
derived effect action; activation therefore receives the same persisted identity
shown by the node instead of inferring a workflow from the entity type.
Resolved input/output contracts are shown by the node's labelled socket rails
and hover/focus metadata; the inspector does not repeat a socket-specification
table.
Pure and read nodes expose an on-demand Output data inspector. It evaluates
only the selected node and its upstream data dependencies, then renders each
output with its declared socket type beside branch paths, sampled values, and
branch/item counts. Sampled items distinguish a present `null` from a missing
field (`missing(<path>)`, the serialized missing-field tag) and secret or
opaque values arrive already redacted by the preview boundary. Effects and
control nodes never show this inspection action because preview execution
deliberately suppresses them.
The palette and inspector are independently collapsible and scrollable. Palette search matches
localized job names and descriptions as well as internal kinds. The persistent
palette uses a readable two-column grid with grouped headings; operation
descriptions are available on hover instead of occupying canvas space.
Right-clicking empty canvas opens the palette at that graph position.
Dropping a socket wire on empty canvas opens the same palette filtered to
operations with a compatible opposite socket; choosing one creates and
connects it immediately.

## Types and connections

Types are structured `{ base, nullable, ...qualifiers }` element contracts.
Every data value travels in a path-addressed tree. Socket `access` independently
declares whether a node consumes an Item, each branch as a List, or the entire
Tree.
Collection-valued fields use the `array` base with an `itemType`. Exact entity types, blocks, schemas, enums, units, capabilities, and
attachment/event kinds are preserved on sockets.
Collect Array converts a branch into one array-valued item; Expand Array does
the reverse. This boundary keeps composing a collection field from accidentally
producing one block per list element.

The designer checks element compatibility before persisting a wire. The runtime
solver obtains topology from actual source trees. Item access maps over matched
items; List access executes independently for every branch; Tree access receives
the complete structure. Per-input Simplify, Flatten, and Graft run before the
node's Longest, Shortest, or Cross matching rule.

Deconstruct Entity consumes one typed entity or aligned entity structure and
emits one typed socket per declared canonical block. Field-level work is an
explicit Get Field operation over a block. Entity decomposition, block
composition, and leaf value operations therefore remain separate concerns.

Compose Block, Modify Block, and Get Field consume entity-independent
`cncDomain.blockSchemas` and `blockComposition`; they have a block selector but
no entity selector. The schemas are explicit canonical contracts, not a union
of observed entity fields. Fixed blocks expose fixed field sockets. Open blocks
use typed rows with stable socket ids: Lineage derives its key and typed
ancestor reference from the connected entity socket; Relations authors a key and referenced entity
type; Attachments uses a named attachment kind; and
Data, Summary, and Provenance use a named value type. The composed map is the
single block output, never an unexplained map input. Get Field mirrors those
same concerns, including restoring stored lineage ids to typed references.
Entity decomposition/read nodes use `fieldSchemas` for entity membership, and
Create/Modify Entity apply constructible/writable policy when accepting a
connected block. Create accepts an open canonical block when that block belongs
to the selected entity; it does not treat each open entry as a fixed entity
field. Persisted fixed nodes keep selected paths, while open nodes
keep stable entry ids plus their authored key/type qualifiers; neither stores
schema snapshots.
When the current entity schema makes every field in a persisted Create block
non-constructible, process normalization removes that stale block and its
defaults before the designer validates or saves the definition. This keeps
service-owned blocks such as cassette-design identity out of the node record,
not merely hidden from its sockets.
Wildcard access rules do not appear as fields. Compose/Modify Block expose only
the explicitly selected field set as dynamic sockets; Create/Modify Entity never
select leaf fields. Origin, provenance, status history, and summary are not
generic writable block inputs. A literal never asks for a field path. Effect
access is edited as explicit role plus access-level rows rather than flattening
every selected role into a write grant. Those rows and the role panel open the
shared typed permission builder for action overrides, entity/lineage scope,
transition conditions, and nested rules; raw grant JSON is not exposed.

## Canvas behavior and diagnostics

Nodes are added to the nearest unoccupied grid position around the visible
viewport center. A newly inserted node must not cover an existing node or its
socket hit targets. Left drag box-selects, Shift extends selection, two-finger
touchpad scroll pans, pinch zooms around the pointer, and Space plus left drag
provides keyboard-assisted panning without a middle mouse button. A selected
node uses one primary border only; it does not add an outer ring or second
outline. Socket handles render at a compact 12px with an invisible grab pad,
and wires draw at 2px, so starting a connection stays easy at any zoom.
The canvas uses its own token-backed work surface behind two side rails. The
palette and inspector are canvas-scoped PrimeVue `Panel` rails rendered
through the `DesignerWorkspace` palette/inspector slots: they are positioned,
bounded, and scrolled inside the canvas workspace and never cover the app
shell or viewport. PrimeVue `Drawer` is intentionally not used for these
rails because its portal is viewport-fixed (v4 appends to `body` with a
fixed mask), which would scope the panels to the whole screen. Visibility is
owned by the dock toggles; the inspector keeps its `TabList` pinned while
`TabPanels` scroll, and the palette rail scrolls in its slot. Either rail
can be closed independently to recover the full canvas. Behind the rails
sits one compact bottom dock composed of default PrimeVue `Dock` through
`components/process-designer/ProcessDesignerDock.vue`. Dock items are static
2rem icon buttons — there is no proximity magnification; hover labels are the
only motion and run through the GSAP `useEnterExit` pattern inside
`ProcessDesignerDockItem.vue`, with `useReducedMotion()` resolving them to
immediate show/hide. The dock surface is an opaque preset token decision
(`primeComponentTokens.dock` in `assets/tokens/index.js`): the stock
translucent pill targets dark hero backgrounds, so the designer dock reads
`{content.background}` with compact paddings instead. Items are icon-only and
grouped by concern with
separators: Palette and Inspector drawer toggles, then direct canvas view
controls (zoom out, zoom in, frame all, frame selection, reset zoom), then
Save and Apply, and finally the Folder for process selection and New Draft.
There is no standalone Validate control: Apply saves, validates, and
activates as one operation, while the result remains visible as feedback on
the canvas. The Folder opens a click-anchored Popover that uses the shared
`EntitySelect` value event directly; PrimeVue's overlay-click coordination
keeps the popover open while the chooser's option overlay is used, and it
closes only after an actual selection.

New Draft starts from an empty graph. Save on an active process is the explicit
copy-to-draft operation; saving an ordinary draft updates that draft. Dirty
state is a primary save affordance plus a small dot, not a persistent text
badge. The dock composition owns only proximity sizing and hover labels; the
route must not replace it with a hand-built toolbar, fixed dark colors, or
shadows.
Delete/Backspace removes all selected nodes and edges together while preserving
definition records that are still referenced. Home frames the graph,
Numpad Decimal frames the selection, and the dock's direct view controls
expose frame/zoom without requiring shortcuts. Zoom spans 0.1x through 4x,
and the live viewport is persisted with the graph. Runtime-only selection
styles are stripped before serialization. Validation reports missing sockets,
incompatible types, guessed/undeclared fields, unreachable operational nodes,
and data or control cycles. The compiled screen preview remains separate from
operation execution. Screen requirements consume capability authored on role,
profile, or action access records. Editing a screen never creates a backend
grant, and a gated screen is omitted until selected roles supply its capability.

Entity selectors use the shared `EntitySelect`/`EntityMultiSelect` contract:
selected entity cards render outside the input and the compact change chevron
remains a separate trigger. Process-node field/type selectors use ordinary
PrimeVue controls because their values are schemas, not entities.

New Draft, Save, and Apply do not depend on a node selection or active
inspector tab. New Draft exposes creation success or failure rather than
silently failing. Save remains available for every loaded process and persists
the authored graph as a draft even when it is incomplete or fails activation
validation; dirty state is an attention indicator, never a persistence gate.
Apply saves and validates the draft first and refuses activation when
validation fails. The side rails are always non-modal drawer overlays and the
bottom dock stays icon-only on narrow layouts.

Legacy canvas records are not interpreted by the designer. The v4 migration
rewrites supported v3 records before editing or activation and fails closed
when an old mutation cannot be represented without changing meaning. New
palette operations use `ProcessNode.vue` exclusively.

Canvas accents and Vue Flow handles use the global `signal-*` aliases, not raw
Tailwind hues. The aliases identify roles such as entity, data, structure,
decision, projection, and effect, so the process canvas stays legible when the
application theme changes. Status-definition severities use `status-*` aliases
for the same reason; a node maps a severity to a role but never to a primitive
theme color.
