# COMPONENT: Process Designer

The organization process designer authors the `@cutkit/processes`
`dataflowVersion: 3` contract. Executable canvas records are `processNode`
operations. Roles, entity profiles, screens, assignments, service principals,
and statuses are definition-plane records. Statuses have a
definition item in the Entities palette and render as inline-editable canvas
nodes; they are not inspector tabs or process-selector controls. A status node
exposes one typed `status` output backed by its stable definition reference.
Modify Entity consumes that output through `status.state.primary`; changing the
authored status id updates the referenced value without breaking the wire.

## Palette and node concerns

The runtime catalog remains exhaustive, but it is not the authoring palette.
The palette has three non-overlapping operation concerns:

- **Entities** owns typed block assembly and persistence. Compose Block creates
  one canonical block from selected fields. Modify Block copies a connected
  block and replaces only its connected selected fields. Deconstruct Entity
  exposes declared blocks, Get Block extracts one block, and Get Field reads
  one field from a block. Create Entity accepts constructible blocks plus lifecycle
  status; Modify Entity accepts the current entity, replacement blocks, and
  status, and changes only connected blocks. Neither persistence node exposes
  leaf constructor fields.
- Registered commands and domain construction producers are effect operations
  in the same group. A derived constructor is a fixed producer service with its
  declared typed inputs, never a mode hidden inside generic Create Entity.
- **Values** contains one typed value input and one operation-switching node
  each for logic/comparison, text, math, and date-time work.
- **Lists and trees** contains the Grasshopper-style structure operations:
  list construction/concatenation/index/slice/count/filter/sort/distinct/group,
  and tree flatten/graft/simplify/branch/zip/unzip/cross/transpose.

Events are not data operations and therefore are not a palette family.
Every effect has one bottom execution switch: Manual exposes the operation to
authorized users, while Automatic exposes an incoming event socket. Date
scheduling is composed explicitly with date values and a wait-until control
before that socket; entity and domain subscriptions are process-entry concerns,
not effect modes. Every effect exposes one `completed` event there. A failed
effect follows its retry policy and then fails the run; it is not a second
graph branch. Event handles use the same
left-to-right direction as data sockets instead of pointing out of the bottom
of the card. Pure value, list/tree, read, and deconstruct nodes do not render
event chrome.

There is no advanced reveal and no separate “starts and inputs”, “process
flow”, or “selection and filtering” taxonomy. Filtering is ordinary dataflow:
deconstruct/read a field over an entity list, evaluate it with Logic to obtain
a Boolean mask, then feed that mask and the original list to Filter.

Runtime-only payload extraction, casts, parsing, nullable removal,
entity-reference conversion, JSON conversion, predicates, and patch assembly
are never ordinary palette choices. Safe coercions such as integer-to-number
and entity-to-reference are wire semantics; an unsafe connection is rejected
instead of creating an unexplained empty conversion node.

`ProcessNode.vue` renders the catalog's resolved ports, not stored UI guesses.
Each socket shows its structured type including shape and qualifier. Data
handles stay at the left/right edges; effect event/control handles use a
left-to-right footer row. Color communicates transported base type while the thin
node stripe communicates operation concern. An unconnected primitive input has
an inline typed fallback editor on the node. It is therefore immediately
runnable without creating a separate constant node, while a connected wire
always wins. An open socket is a composition affordance, not an error. Missing
required inputs are reported when validation is requested, not as warning
badges on every new node.

Meaningful configuration stays on the node: value/type, entity, field, block,
operation, trigger entity/event, and socket fallback. Selected dynamic entity
fields are also summarized in the node header and exposed as named sockets.
The contextual inspector edits secondary record-level configuration without
moving status authoring out of its canvas node.
The palette and inspector are independently scrollable. Palette search matches
localized job names and descriptions as well as internal kinds. The persistent
palette uses a readable two-column grid with grouped headings; operation
descriptions are available on hover instead of occupying canvas space.
Right-clicking empty canvas opens the palette at that graph position.
Dropping a socket wire on empty canvas opens the same palette filtered to
operations with a compatible opposite socket; choosing one creates and
connects it immediately.

## Types and connections

Types are structured `{ base, shape, nullable, ...qualifiers }` objects. Shape
is `item`, `list`, or a path-addressed `tree`; it is not encoded in a string
kind. Exact entity types, blocks, schemas, enums, units, capabilities, and
attachment/event kinds are preserved on sockets.

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

Field selectors consume `cncDomain.fieldSchemas`. Every selectable field has an
exact path, block, structured type, and readable/writable capability. Wildcard
access rules do not appear as fields. Compose/Modify Block expose only the
explicitly selected field set as dynamic sockets; Create/Modify Entity never
select leaf fields. Origin, provenance, status history, and summary are not
generic writable block inputs. A literal never asks for a field path. Effect
access is edited as explicit role plus access-level rows rather than flattening
every selected role into a write grant.

## Canvas behavior and diagnostics

Nodes are added at the active viewport center. Wires and nodes are selectable;
Delete/Backspace removes only the selection. Runtime-only selection styles are
stripped before serialization. Validation reports missing sockets, incompatible
types, guessed/undeclared fields, unreachable operational nodes, and data or
control cycles. The compiled screen preview remains separate from operation
execution.

Entity selectors use the shared `EntitySelect`/`EntityMultiSelect` contract:
selected entity cards render outside the input and the compact change chevron
remains a separate trigger. Process-node field/type selectors use ordinary
PrimeVue controls because their values are schemas, not entities.

Legacy `ProcessActionNode`, `ProcessEntityNode`, `ProcessServiceNode`,
`ProcessSocketNode`, `ProcessStatusDefinitionNode`, and
`ProcessValueInputNode` remain only for reading pre-migration canvas records.
The v3 migration replaces those graph nodes before editing or activation; new
palette operations must use `ProcessNode.vue`.
