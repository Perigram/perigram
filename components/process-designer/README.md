# COMPONENT: Process Designer

The organization process designer authors the `@cutkit/processes`
`dataflowVersion: 3` contract. The executable canvas contains only
`processNode` records. Roles, entity profiles, screens, assignments, service
principals, and statuses are definition-plane records edited in their own
panels; a status definition is not a value node. Use a typed status literal
with `effect.changeStatus` when a transition needs a data input.

## Palette and node concerns

The searchable palette is generated from the process node catalog and is
separated into sources, values, collections/trees, records, predicates, reads,
effects, and control. These families are semantic:

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
type while the node stripe communicates operation concern. Required
unconnected sockets show an error badge.

Meaningful configuration stays on the node: literal value/type/shape, entity,
field, block, and operation. Larger configuration stays in the contextual
inspector: command, relation, selected dynamic fields, retry policy, switch
cases, and other operation-specific settings. The palette and inspector are
independently scrollable. Palette search matches kind, label, and operation
level. Right-clicking empty canvas opens the palette at that graph position.
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
conversion inserts a visible conversion node at the wire midpoint. Narrowing
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
