# COMPONENT: Process Designer

The organization process designer authors the `@cutkit/processes`
`dataflowVersion: 3` contract. The executable canvas contains only
`processNode` records. Roles, entity profiles, screens, assignments, service
principals, and statuses are definition-plane records. Statuses have a
dedicated manager opened from the canvas toolbar; they are not inspector tabs
or executable value nodes. `effect.changeStatus` remains the explicit
transition action on the graph.

## Palette and node concerns

The runtime catalog remains exhaustive, but it is not the authoring palette.
The palette has exactly four non-overlapping concerns:

- **Entities** creates or modifies an entity directly and reads/deconstructs
  its declared blocks and fields. Create/modify nodes expose one typed socket
  per selected writable field; there is no intermediate draft, patch, current
  entity, or related-entity plumbing. Create also exposes the selected
  domain-declared construction mode inputs, so derived entities remain
  constructable without generic placeholder fields.
- **Values** contains one typed value input and one operation-switching node
  each for logic/comparison, text, math, and date-time work.
- **Lists and trees** contains the Grasshopper-style structure operations:
  list construction/concatenation/index/slice/count/filter/sort/distinct/group,
  and tree flatten/graft/simplify/branch/zip/unzip/cross/transpose.
- **Events** contains manual, entity-change, and registered domain-event
  triggers plus the date continuation boundary.

Manual trigger payloads become entity-typed when connected to an entity
read/modify operation; the trigger then shows that entity scope explicitly.
This replaces the unexplained ambient “Current entity” node. Entity-change
triggers always expose the changed entity, while domain-event triggers expose
their registered event data.

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
handles stay at the left/right edges; event/control handles occupy a separate
band at the bottom. Color communicates transported base type while the thin
node stripe communicates operation concern. An unconnected primitive input has
an inline typed fallback editor on the node. It is therefore immediately
runnable without creating a separate constant node, while a connected wire
always wins. An open socket is a composition affordance, not an error. Missing
required inputs are reported when validation is requested, not as warning
badges on every new node.

Meaningful configuration stays on the node: value/type, entity, field, block,
operation, trigger entity/event, and socket fallback. Selected dynamic entity
fields are also summarized in the node header and exposed as named sockets.
The contextual inspector edits the selected field set and other record-level
configuration without turning definition-plane statuses into node settings.
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

Field selectors consume `cncDomain.fieldSchemas`. Every selectable field has an
exact path, block, structured type, and readable/writable capability. Wildcard
access rules do not appear as fields. Construct/deconstruct nodes expose only
the selected field set as dynamic sockets; a literal never asks for a field
path.

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
