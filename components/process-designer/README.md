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
The searchable authoring projection is separated by user concern: start and
inputs, values and modifiers, entities and fields, selection and filtering,
actions, flow, and advanced data structures. Every palette choice has a
plain-language job and a creation preset. Common literal choices create typed
text, number, or yes/no values rather than an unconfigured generic literal.
Specialized control and collection/tree operations require the explicit
advanced reveal.

Runtime-only payload extraction, casting, parsing, nullable removal,
entity-reference conversion, JSON conversion, and unit conversion are never
ordinary palette choices. The connection planner owns them and may place a
clearly labeled automatic-conversion node when a compatible connection needs
one. Runtime families remain semantic:

- sources introduce values and trigger payloads;
- values and collections transform data without entity meaning;
- records construct/deconstruct records and produce/apply typed patches;
- predicates describe entity field tests and compose independently of Boolean
  value streams;
- reads resolve/query/traverse entities without mutation;
- effects are the only persistence or external-service boundary;
- control nodes schedule effects with triggers, branches, forks/joins,
  structured foreach, waits, retries, and explicit stops.

`ProcessNode.vue` renders the catalog's resolved ports, not stored UI guesses.
Each socket shows its structured type including shape and qualifier. Data
handles and control handles are distinct; color communicates transported base
type while the node stripe communicates operation concern. An open socket is a
composition affordance, not an error. Missing required inputs are reported
when validation is requested, not as warning badges on every new node.

Meaningful configuration stays on the node: literal value/type, entity,
field, block, and operation. Larger configuration stays in the contextual
inspector: command, relation, selected dynamic fields, retry policy, switch
cases, and other operation-specific settings. The palette and inspector are
independently scrollable. Palette search matches localized job names and
descriptions as well as internal kinds. Right-clicking empty canvas opens the
palette at that graph position.
Dropping a socket wire on empty canvas opens the same palette filtered to
operations with a compatible opposite socket; choosing one creates and
connects it immediately.

## Types and connections

Types are structured `{ base, shape, nullable, ...qualifiers }` objects. Shape
is `item`, `list`, or a path-addressed `tree`; it is not encoded in a string
kind. Exact entity types, blocks, schemas, enums, units, capabilities, and
attachment/event kinds are preserved on sockets.

The designer checks the source and target socket contracts before persisting a
wire. Safe item broadcasting is allowed. A connection that needs casting,
nullable removal, entity-to-reference conversion, JSON conversion, or unit
conversion inserts a visible, automatically named conversion node at the wire
midpoint. Narrowing
or restructuring data is rejected until the author adds the appropriate
collection/tree node.

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
