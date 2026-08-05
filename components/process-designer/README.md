# COMPONENT: Process Designer

The organization process designer authors the `@cutkit/processes`
`dataflowVersion: 3` contract. Executable canvas records are `processNode`
operations. Entity profiles, screens, role grants, service principals, and
statuses are definition-plane records. Role identities are organization data,
and the Roles panel performs immediate organization CRUD independently of
process Save/Apply. Assignments belong to Team Management. Statuses have a
definition item in the Entities palette and render as inline-editable canvas
nodes; they are not inspector tabs or process-selector controls. A status node
exposes one typed `status` output backed by its stable definition reference.
Modify Entity consumes that output through `status.state.primary`; changing the
authored status id updates the referenced value without breaking the wire.

## Palette and node concerns

The runtime catalog remains exhaustive, but it is not the authoring palette.
The palette has four non-overlapping authoring concerns. The fourth is not a
runtime-catalog dump: it contains only usable process entry and suspension
operations.

- **Entities** owns typed block assembly and persistence. Compose Block creates
  one canonical block from selected fields. Modify Block copies a connected
  block and replaces only its connected selected fields. Deconstruct Entity
  exposes declared blocks, Get Block extracts one block, and Get Field reads
  one field from a block. Create Entity accepts constructible blocks plus lifecycle
  status; Modify Entity accepts the current entity, replacement blocks, and
  status, and changes only connected blocks. Neither persistence node exposes
  leaf constructor fields.
- Create Entity first selects the domain entity, then the domain-declared
  construction mode. Generic construction consumes canonical blocks; typed
  construction consumes only that mode's declared inputs. Producer identifiers
  remain runtime/domain contracts and do not leak into the palette as one-off
  upload/source nodes.
- Select Entities is the organization-scoped source for an existing typed
  entity list. Registered commands use the single Run Service operation, whose
  sockets are projected from the selected command's entity, parameter, and
  output contracts.
- **Values** contains one typed value input and one operation-switching node
  each for logic/comparison, text, math, and date-time work.
- **Lists and trees** contains the Grasshopper-style structure operations:
  list construction/concatenation/index/slice/count/filter/sort/distinct/group,
  and tree flatten/graft/simplify/branch/zip/unzip/cross/transpose.
- **Automation** contains only Entity changed, Domain event, and Wait Until.
  Entry nodes expose a labelled payload and execution output. Wait Until
  consumes a date-time plus execution and resumes through its output.

Every effect has one bottom execution switch: Manual exposes the operation to
authorized users, while Automatic exposes an incoming event socket. Date
scheduling is composed explicitly with date values and a wait-until control
before that socket; entity and domain subscriptions remain entry nodes rather
than effect modes. Every effect exposes one `completed` event there. A failed
effect follows its retry policy and then fails the run; it is not a second
graph branch. Event handles use the same
left-to-right direction as data sockets instead of pointing out of the bottom
of the card. Pure value, list/tree, read, and deconstruct nodes do not render
event chrome.

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
| Start from an external event | Entity changed/Domain event → Automatic effect | Declared event trigger and payload |
| Continue at a future time | Date → Wait Until → Automatic effect | Durable wake time |
| Reshape collections | List/tree operations with explicit packet shapes | Pure data-tree evaluator |

The exhaustive runtime catalog, producer effects, predicates, patches,
conversions, and trigger-payload helpers have no direct authoring entry.

Runtime-only payload extraction, casts, parsing, nullable removal,
entity-reference conversion, JSON conversion, predicates, and patch assembly
are never ordinary palette choices. Safe coercions such as integer-to-number
and entity-to-reference are wire semantics; an unsafe connection is rejected
instead of creating an unexplained empty conversion node.

`ProcessNode.vue` renders the catalog's resolved ports, not stored UI guesses.
Inputs and outputs share explicit rows, and every handle is centered on the
outer node rail rather than inheriting a position from variable-height content.
Socket labels stay concise; the exact structured type, shape, qualifier, and
description are available on hover and to assistive technology instead of
being repeated beside every socket. Color communicates transported base type,
handle shape communicates item/list/tree structure, and the thin node stripe
communicates operation concern. The shared `processDesignerSocketTone` mapping
drives both a source handle and its wire, so a contract has one semantic tone
throughout the canvas. Port labels sit on unboxed left/right rails rather than
inside independently colored chips. When selected, an unconnected primitive
input reveals a compact inline typed fallback editor; this keeps inactive nodes
quiet while preserving immediate authoring without a separate constant node.
A connected wire always wins. An open socket is a composition affordance, not
an error. Missing required inputs are reported when validation is requested,
not as warning badges on every new node.

Fallback/default policy is omission-first. A connected value wins; otherwise
an explicit authored `inputDefaults` value is used. If neither exists, an
optional input is omitted, while a required input fails validation. Defaults
declared by a construction mode or command are applied only by that owning
domain/runtime contract—generic block authoring does not guess them. Generated
identity uid, Mongo `_id`, origin, status history, and other service-owned
fields have no authoring fallback and cannot be composed or modified. Initial
status is the separate lifecycle input.

Entity inputs use the same socket contract for every binding source. A typed
entity-reference literal authors one exact entity id, a direct entity socket
uses the entity available in the current run, and `read.queryEntities` accepts
typed predicate sockets to produce a filtered entity list. Consumers infer the
entity type and item/list cardinality from the wire. Lineage composition also
uses its downstream Create Entity schema to resolve the constructible lineage
key, so its inspector does not expose a separate entity-type selector.
Both materialized `entity` outputs and lightweight `entityRef` outputs carry
this inference; saving or re-synchronizing the canvas must preserve either form.

Only configuration that defines the operation or its ports stays on the node:
value/type, entity, field, block, operation, trigger identity/mode, and socket
fallback. Access grants, selected compose/modify field sets, retry policy, and
other secondary record policy live in the contextual inspector. A status node
still authors its identity and exposes its output on the canvas; color, icon,
and lifecycle evidence schemas are edited in the inspector.
Resolved input/output contracts are shown by the node's labelled socket rails
and hover/focus metadata; the inspector does not repeat a socket-specification
table.
The palette and inspector are independently collapsible and scrollable. Palette search matches
localized job names and descriptions as well as internal kinds. The persistent
palette uses a readable two-column grid with grouped headings; operation
descriptions are available on hover instead of occupying canvas space.
Right-clicking empty canvas opens the palette at that graph position.
Dropping a socket wire on empty canvas opens the same palette filtered to
operations with a compatible opposite socket; choosing one creates and
connects it immediately.

## Types and connections

Types are structured `{ base, shape, nullable, ...qualifiers }` objects. Shape
is the transported packet (`item`, `list`, or a path-addressed `tree`); it is
not a field's intrinsic cardinality and is not encoded in a string kind.
Collection-valued fields use the `array` base with an `itemType`. Exact entity types, blocks, schemas, enums, units, capabilities, and
attachment/event kinds are preserved on sockets.
Pack Array converts a list packet into one array-valued item; Unpack Array does
the reverse. This boundary keeps composing a collection field from accidentally
producing one block per list element.

The designer checks the source and target socket contracts before persisting a
wire. Safe item broadcasting and safe scalar/reference coercions are implicit.
Generic list/tree nodes infer their transported base type from the first
connected data socket. Field, block, deconstruct, logic, text, math, and date
operations infer list/tree shape so operations map over structured input and
can produce a Boolean mask for Filter without a separate “entity filter”
language. Narrowing or restructuring data is rejected until the author adds
the appropriate list/tree node.

Deconstruct Entity consumes one typed entity or aligned entity structure and
emits one typed socket per declared canonical block. Field-level work is an
explicit Get Field operation over a block. Entity decomposition, block
composition, and leaf value operations therefore remain separate concerns.

Compose Block, Modify Block, and Get Field consume entity-independent
`cncDomain.blockSchemas` and `blockComposition`; they have a block selector but
no entity selector. The schemas are explicit canonical contracts, not a union
of observed entity fields. Fixed blocks expose fixed field sockets. Open blocks
use inspector-authored typed rows with stable socket ids: Lineage authors a key
plus typed ancestor reference; Relations authors a key, referenced entity type,
and one/many cardinality; Attachments uses a named attachment kind; and
Data, Summary, and Provenance use a named value type. The composed map is the
single block output, never an unexplained map input. Get Field mirrors those
same concerns, including restoring stored lineage ids to typed references.
Entity decomposition/read nodes use `fieldSchemas` for entity membership, and
Create/Modify Entity apply constructible/writable policy when accepting a
connected block. Persisted fixed nodes keep selected paths, while open nodes
keep stable entry ids plus their authored key/type qualifiers; neither stores
schema snapshots.
Wildcard access rules do not appear as fields. Compose/Modify Block expose only
the explicitly selected field set as dynamic sockets; Create/Modify Entity never
select leaf fields. Origin, provenance, status history, and summary are not
generic writable block inputs. A literal never asks for a field path. Effect
access is edited as explicit role plus access-level rows rather than flattening
every selected role into a write grant.

## Canvas behavior and diagnostics

Nodes are added to the nearest unoccupied grid position around the visible
viewport center. A newly inserted node must not cover an existing node or its
socket hit targets. Left drag box-selects, Shift extends selection, two-finger
touchpad scroll pans, pinch zooms around the pointer, and Space plus left drag
provides keyboard-assisted panning without a middle mouse button. A selected
node uses one primary border only; it does not add an outer ring or second
outline.
The canvas uses its own token-backed work surface. Opaque palette and inspector
rails leave the graph clear behind one compact bottom dock. The dock is
icon-only and ordered by concern: four-square Palette, Inspector, Save, Apply,
hover/focus Navigation, then the final Folder for process selection and New
Draft. There is no standalone Validate control: Apply saves, validates, and
activates as one operation, while the result remains visible as feedback on the
canvas. Navigation opens framing and zoom controls on hover/focus. The Folder
opens the process chooser and New Draft action the same way, with click as a
touch fallback. The process chooser uses the shared `EntitySelect` value event
directly, pins the Folder panel while its option overlay is open, and closes
only after an actual selection; selected process cards remain outside the
change trigger.

New Draft starts from an empty graph. Save on an active process is the explicit
copy-to-draft operation; saving an ordinary draft updates that draft. Dirty
state is a primary save affordance plus a small dot, not a persistent text
badge. `components/shared/MotionDock.vue` is the shared, Vue Bits-derived
`motion-v` block: the page supplies action data and optional contextual
hover/focus hooks while the design-system primitive owns proximity scaling,
keyboard buttons, and hover labels. Its compact scale comes from
`designTokens.dock`, its spring from `designTokens.motion.spring.dock`, and its
surface/border/indicator styling from PrimeVue variables. `useReducedMotion()`
keeps the same accessible actions without magnification or label travel, so the
route must not replace it with a hand-built toolbar, fixed dark colors, or
shadows.
Delete/Backspace removes all selected nodes and edges together while preserving
definition records that are still referenced. Home frames the graph,
Numpad Decimal frames the selection, and the dock's view popup exposes
frame/zoom controls without requiring shortcuts. Zoom spans 0.1x through 4x,
and the live viewport is persisted with the graph. Runtime-only selection
styles are stripped before serialization. Validation reports missing sockets,
incompatible types, guessed/undeclared fields, unreachable operational nodes,
and data or control cycles. The compiled screen preview remains separate from
operation execution.

Entity selectors use the shared `EntitySelect`/`EntityMultiSelect` contract:
selected entity cards render outside the input and the compact change chevron
remains a separate trigger. Process-node field/type selectors use ordinary
PrimeVue controls because their values are schemas, not entities.

New Draft, Save, and Apply do not depend on a node selection or active
inspector tab. New Draft exposes creation success or failure rather than
silently failing; Save becomes active only when the graph is dirty. Apply saves
and validates the draft first and refuses activation when validation fails. On
narrow layouts the bottom dock remains icon-only, both side rails become
overlays, and either rail can be closed independently to recover the canvas.

Legacy `ProcessActionNode`, `ProcessEntityNode`, `ProcessServiceNode`,
`ProcessSocketNode`, `ProcessStatusDefinitionNode`, and
`ProcessValueInputNode` remain only for reading pre-migration canvas records.
The v3 migration replaces those graph nodes before editing or activation; new
palette operations must use `ProcessNode.vue`.

Canvas accents and Vue Flow handles use the global `signal-*` aliases, not raw
Tailwind hues. The aliases identify roles such as entity, data, structure,
decision, projection, and effect, so the process canvas stays legible when the
application theme changes. Status-definition severities use `status-*` aliases
for the same reason; a node maps a severity to a role but never to a primitive
theme color.
