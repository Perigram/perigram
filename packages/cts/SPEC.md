# SPEC: Perigram Type System (CTS)

Status: core tier implemented (`packages/cts`, see its README for the module
map). The declaration layer is the live source of the process designer and
the process compiler's domain input; the runtime instance services
(§13 per-class collections) remain the open strangler frontier. This spec is
the collapse point of the constructs spread across `packages/core`
(canonical blocks), `packages/facade` (entities, workflows, kinds, field
schemas), and `packages/processes` (compiler checks): same semantics, one
declaration language, every hand-mirrored list derived.

## 1. Scope and named boundaries

CTS types six things about every stored record:

1. structure (fields)
2. references (edges)
3. state (lifecycle)
4. operators (construction, mutation, computation)
5. policy (visibility and grants)
6. evolution (versioning and migration)

It deliberately does NOT type, and says so:

- **Time and audit.** `command_runs`, `task_runs`, `status_events` are
  append-only logs owned by the operator runtime. Operators declare what they
  emit; the log itself is schema-free and total.
- **Storage topology.** Sharding, replication, physical layout (see §13 for
  the only storage contract CTS makes).
- **UI layout.** Screens and cards are downstream projections: display
  policy (names, glyphs, state labels, field sections) derives from
  declarations at compile time. Arrangement beyond that is station-side,
  not part of the language.

## 2. Value universe V

What operators exchange and what predicates/patches read. Closed, finite,
JSON-encodable. Entity graphs are reachable only through `Ref`.

```
v ::= String | Number | Boolean | Instant        -- atoms; Instant is the only
                                                 -- time type; "date" is a
                                                 -- display format
    | Quantity(Number, Unit)                     -- 3 mm, 40 %, 12.50 EUR
    | Id                                         -- opaque; meaningless without
                                                 -- a Ref that carries it
    | Ref(T, Id)                                 -- typed pointer to a stored
                                                 -- instance of type T
    | Blob                                       -- { fileId, mime, size };
                                                 -- storage handle (GridFS)
    | (l1: v1, ... ln: vn)                       -- Record (labeled product)
    | [v]                                        -- List
    | { k -> v }                                 -- Map, String keys
    | tag(v)                                     -- Variant: one of labeled
                                                 -- alternatives
    | e1 | ... | en                              -- Enum: variant with no
                                                 -- payload

Unit ::= mm | m2 | min | deg | percent | currency | count
```

Rules:

- Structs are declared products and belong to V: `Polygon = (outer: Ring,
  holes: [Ring])` is a normal field type. Domain payloads (geometry,
  parameters) are typed here, not parked in JSON.
- Unit conversions are declared (`mm -> m`), never implicit. `Quantity`
  arithmetic unifies units; mismatch is a static error (R3).
- `Quantity(Number, currency)` is minor-unit-integer money: handlers
  author amounts as integer minor units (cents) so `add`/`sub` stay
  exact; displays render decimals. The row validator refuses fractional
  currency values, and expression arithmetic refuses results that would
  lose minor units (fractional division) instead of rounding. Float-money
  literals are a defect.
- `Json` escape: reachable, and inert. Nothing inside it participates in any
  rule of §12. It exists for true externals (raw imported DXF entropy, foreign
  settings). Parking domain payload there is a review defect, not a style
  choice.
- Expression forms over V — `match` (exhaustive variant elimination) and
  `map`/`filter` (bounded list iteration) — are specified in §18.
- Rows serialize as **JSON Schema** (draft 2020-12) with custom keywords for
  `Quantity` and `Ref`, validated by a standard validator (Ajv). CTS rides on
  top, not beside: JSON Schema validates one document; CTS adds what it
  cannot express — classes, edges with integrity, operator signatures,
  versioning/migration, and graph checks R1–R7. The payoff is the designer:
  field editors and forms generate from the same row schemas instead of a
  second form definition.

### Relation to the process type grammar (audit correction)

The runtime dataflow grammar is NOT this document's V. It is
`PROCESS_BASE_TYPES` in `packages/processes/src/types.js` — 27 base types
including `entity`/`entityRef`/`revisionRef` as distinct bases, `enum` with
a registry id, `block`, `status`, `attachmentRef`, `predicate`, `patch`,
`event`, `taskRef`, plus socket roles (data/control/success/failure), packet
access shapes (item/list/tree), a coercion lattice with explicit refusals,
capability-typed `accepts`, and unit conversion that must remain an explicit
graph node — the same unit philosophy as §2. CTS V is the DECLARATION-layer
grammar (what rows/states/edges may say); the graph layer owns the runtime
grammar and is richer than V. CTS does not replace it.

## 3. Stored shape

One physical document shape. Every runtime concern owns exactly one slot;
nothing is a special case:

```
entity := {
  id:             Id
  organizationId: Id                -- tenancy slot; immutable at construct
  type:           TypeId            -- assigned at construct, immutable
  typeVersion:    Number            -- version of T's row it conforms to (§11)
  fields:         T.row             -- the type's product, instantiated
  lineage:        { key -> Ref }    -- tree edges (containment), from child
  relations:      { key -> Ref | [Ref] }   -- peer edges
  provenance:     { op, sources: [Ref], effective: Record }
                                   -- causal edges; `effective` records params
                                   -- AND input versions (§8 purity)
  states:         string | none    -- the instance's flat state (§7)
  stateChangedAt: Instant         -- when the current state was entered;
                                    -- the deadline clock (§7)
  payload:        Blob | none       -- iff T declares payload
  history:        [revision]        -- iff T declares a revision scope
}
```

Tenancy lives in the top-level `organizationId` slot, never inside an edge
map: `lineage` holds pure tree edges (a stored `lineage.organizationId` is
the same drift class R2 forbids). The wire DTO still projects tenancy as
`lineage.organizationId` for the legacy block vocabulary — that projection
belongs to the instance service boundary (§13), storage speaks §3.
`organizationId: null` marks a **system instance**: pack-seeded reference
data (catalogs like pens or layer standards) that is read-admitted in
every organization's view and written only by seeding/admin paths. Org
customization of a system instance is an org-authored instance shadowing
it by declared key (e.g. `code`), never a mutation of the system row.

The ten canonical blocks reduce to slots: `data`/`specs` -> fields (specs
become `Quantity` fields), `identity/origin/status` -> id/states/history,
`attachments` -> payload, `summary` -> derived cache (§9), `lineage/
relations/provenance` -> the three edge kinds.

## 4. Type declaration

```
type T : Class {
  name:         string                          -- REQUIRED; the only user-plane
                                                  -- identifier (machine ids
                                                  -- never render)
  glyph:        string                          -- optional icon id; default
                                                  -- derives from class
  fields:      { name: FieldType, ... }        -- closed row
  payload:     mime | none
  edges:       edge declarations (§6)
  operators:   signatures attached to T (§8)
  revisions:   scope | none
  aggregates:  per-edge declarations (§9)
  policy:      field visibility / grants per role
  migrate:     [steps]                          -- per version bump (§11)
}

FieldType ::= any V production without Ref
             | Ref(T | [T1 ... Tn])              -- enumerated target set
             | Nullable(t)
             | Quantity(Unit)
```

Naming is vocabulary, not rendering. Every type declares `name` — the
required, only user-plane identifier — and may declare `glyph` (an icon id
such as `'pi pi-box'`; the class default table is the compiled fallback).
Field descriptors carry the naming facet alongside their type: `label?`
(display label), `display?` (a value format kind — text/number/code/email/
phone/date/area/percent/dimensions/parameterMap/count/geometry/entityRef/
entityRefList — passed through verbatim, not validated here), and
`control?` (an edit-widget pin consumed by editor variants). Two closed
boolean flags mark display roles: `identifier?: true` on exactly one
field (the record's name source — the unnamed placeholder means "the
identifier field's value is null" and nothing else) and `depiction?: true`
on at most one field (its visual thumbnail source). When no field carries
the identifier flag, normalization MINTS one: the first declared
`string`-based field is flagged once, at the boundary, and the mint
persists — later field additions never shift it; an explicit flag is the
authored deviation and always wins. A SYSTEM type with no flag and no
string field is a compile error (the data is ours to fix); an ORG type
in the same state stays compiled and served with `identifier: null` —
its records display the unnamed placeholder, the visible authoring
prompt — because a display-law gap must never eject a type from the view
and cascade "unknown type" through every process bound to it. Two or
more of either flag is a compile error naming the fields; a system type
without a name is a compile error naming the type id.

There is no `render` facet on types. Identity, grouping, list layout, and
default sort are not declaration concerns: display grouping derives from
the row at compile time — total section assignment by base (`quantity` →
dimensions, `ref` → relations, `blob` or the depiction flag → media,
multiline/long strings → notes, everything else → summary; `list`/`map`
assign by their item base, else summary) — and per-state display policy
lives on the states facet (§7). Arrangement beyond derivation is
station-side.

Compact snapshots are a declaration concern: `snapshot` lists the
`data.*` dot paths (at most 12) a bounded preview keeps — chat message
instance previews and embeds read it. A type without the facet gets the
generic compact strip (heavy geometry layers never ride previews);
`data.geometry` is compacted when declared. Pack and org declarations
carry it alike — previews are contract-driven, never per-type framework
branches.

Boundary migration (adopt-and-delete, one time at declaration
normalization): the retired `render` keys are adopted and deleted —
`render.label` becomes `name`, `render.icon` becomes `glyph`,
`render.identityField` sets `identifier: true` on that field, and a
field's nested `render.control` becomes `control`. System/pack
declarations whose only name carrier was the id adopt `startCase(id)` —
engineer-authored ids, adopted once at the boundary (the opaque-id law
forbids startCase(id) as a served default; this is a migration, not a
default). Org-stored declarations with neither carrier keep `name: null`
and serve "Unnamed". `render.groups`, `render.listLayout`,
`render.sortKey`, and the descriptor `priority`/`surfaces` keys are
dropped — derivation replaces them.

Payload traits: the payload declaration carries the accepted MIME list
and byte limits (enforced at construct time) plus the preview mode
(a payload trait projected to UI like the state display policy of §7)
and the creation
protocols — a list of `upload | capture | editor` stating how instances
of the type come into being (`upload`: file picker on the payload
traits; `capture`: camera capture; `editor`: blank instance whose first
editor save fills the payload). Protocols project as construct `via`
modes and are the ONLY construct modes of a payload-bearing type (the
editor protocol is its blank-create). A type marked `derived: true`
synthesizes no construction at all — operator/service-produced types
enter graphs as outputs, never as constructs. This is the whole of
today's `attachment-kinds.js`, as data on the type.

"Not in the row" means "does not exist": selectable field lists, predicate
paths, patch paths, and card fields are all derived from the row. No list is
hand-mirrored anywhere (this deletes `field-access.js` duplication,
`cncStatusUi`, alias tables, ghost keys in one stroke).

Type tenancy: system types (framework and starter packs) and organization
types share one registry with `scope: system | org` (+ `organizationId`).
An org type may not shadow a system type id. Validation and compilation
always resolve against one organization's view of the registry — system
types first, that organization's types overlaying — never the union of all
orgs.

## 5. Classes

A class is a declaration preset: a bundle of obligations over the facets
above. It adds no machinery, only constrains what a type may and must
declare. Five, because the codebase exhibits exactly five identity laws:

| Class | must declare | must not declare | identity law |
|---|---|---|---|
| `party` | (framework types only) | be org-authored | auth principal |
| `file` | payload or fields | lineage children | content/value identity; replaceable; referenced |
| `item` | — | payload | tracked individual; never replaced |
| `group` | lineage children | — | identity is its membership |
| `process` | input edges (provenance sources); output types | payload | identity is a run; state driven by operators, not users |

No class declares states: state vocabularies are process-graph authoring
(§7). Class obligations are structural only: they constrain what a type
may and must *declare* (payload, edges), never what data it must carry.

## 6. Edges — exactly three kinds

The running system has exactly three reference semantics; CTS names them and
forbids a fourth:

| Kind | Semantics | Declared by | Shape |
|---|---|---|---|
| `lineage` | containment | parent's children declaration; child stores the key | tree, acyclic |
| `relations` | association | owner type; typed, `one` or `many` | graph |
| `provenance` | causation | the operator that ran; stored on the product | DAG |

Every edge declaration carries integrity semantics:

```
onRemove ::= restrict | cascade | detach
```

A children declaration also names its storage key: `lineageKey` is the
property children store under `lineage.<lineageKey>`. Normalization stamps
it on every children entry — the authored value wins, else the derived
`camel(declaringTypeId) + "Id"` fallback (`edges.js` owns the single
derivation). The map key of the children entry is authoring identity only;
field schemas, containment, derived indexes, and UI hierarchy matching all
read the declared `lineageKey`.

This is the type-level home of what `propagateToChildren` and the delete
grant matrix currently improvise in code.

A `Ref` stored outside a declared edge slot (the `data.manufacturerId`,
`data.queueId`, `lineage.catalogId` drift) is a static error (R2). `Id`
fields without a carrier `Ref` are the same error.

## 7. States

States are authored in the process graph, never in the type declaration.
A type carries no state vocabulary: it declares identity, class, fields,
edges, and operators only. The state vocabulary of a type is the set of
state nodes authored in a process definition and wired into that type's
create and transition operations.

```
StateNode ::= { value: string, terminal?: true, policy?: { label?, icon?, severity? } }
```

- A state is a flat string value.
- Nesting is declared by wiring: a state node's `state` input accepts
  another state node; the wire's source is the parent and the receiving
  (target) state is its child. A parent state is itself a leaf — targeting
  it lands on the parent, never on an implicit initial child — so a
  parent-to-child transition is a real edge. The wired node's own value is
  what operations receive.
- The initial state of a created instance is authored at the create
  operation: the construct node's `state` input socket carries the value
  (wired from a state node, or an authored default). No declaration owns
  an initial.
- The target state of a transition is authored at the transition
  operation the same way: the transition node's `state` input socket
  carries the value. A transition is an edge of the process graph, not a
  declaration; there is no transition table and no `from`/`to` pair to
  name.
- The wire is the value: a state node wired into a construct or
  transition node supplies its state. Validation checks authored state
  values against the draft's own state nodes; nothing outside the draft
  supplies or constrains them.
- A transition operation may carry a `guard`: a boolean expression AST
  (§18) evaluated over `{ value }`, where `value` is the operated
  instance's row — row-relative field paths under the `value` root
  (`['value','total']`), the §20 field vocabulary. The guard compiles
  onto the machine edge with its transition (first declaration of an
  edge wins when several actions declare the same edge). The status
  runtime re-evaluates the guard atomically at commit against the
  loaded instance (§18.3): a guard that no longer holds refuses the
  transition, and the state-actions availability list omits
  guard-failing edges. Guard field paths are row-checked at the
  declaration-check seam like every other field reference. Guards are
  boolean only — comparisons, boolean algebra, field paths, literals;
  the comprehension forms of §18 are not guard vocabulary.
- A state record may declare a deadline: `deadline: { after, to, guard? }`
  — `after` is an ISO-8601 duration, `to` a declared state of the same
  type's vocabulary (never the state itself), `guard` a boolean
  expression AST over `{ value }` under the guard contract above.
  Compilation marks the machine state with the deadline and adds (or
  annotates) the edge `from -> to` as `deadline: true` with system-only
  execution: deadline edges are not user actions — the availability
  listing never offers them and the transition boundary refuses
  non-system callers. The deadline scanner (the status runtime's
  scheduled sweep) periodically resolves every organization's active
  machines, finds instances whose current state carries a deadline older
  than `after` — the entered-state clock is the §3 `stateChangedAt` slot
  (the legacy block's `status.timestamp`) — and moves each through the
  normal transition boundary as SYSTEM with `source: { kind:
  'deadline' }`: stamps, guards, lifecycle validation, and hooks are
  unchanged. This stays reaction, not observation (§8): the scan is a
  trigger, never a standing query.
- An instance persists one flat state string under `state`; the v24
  status block mirrors it. There are no regions and no per-axis active
  paths.
- State display policy rides the state node. A missing label derives
  from the value, terminal severity defaults to `secondary`, other
  severity defaults to `info`, and icon defaults to none.

## 8. Operators — six species

```
construct   c : (params) -> Ref(T)          -- upload, editor save, bake,
                                             -- import, spawn
mutate      m : (Ref(T), Record) -> Ref(T)  -- patch within the closed row
transition  d : (Ref(T), intent) -> Ref(T)  -- moves one axis; guard; effects
conversion  k : (Ref(A), params) -> Ref(B)  -- stored result; provenance edge
projection  p : (Ref(A)) -> V               -- pure; the ONLY entity->value
                                             -- gate
service     s : V -> V                      -- pure external computation
                                             -- (solver, vision, generator)
```

Wrapping (existing machinery, unchanged): commands wrap `c/m/d/k` with
policy, recording, and effects; tasks wrap `s` with queueing and retry;
executor topology (worker/http/server) is deployment detail, never
declaration.

`k` is `c` plus a provenance source — kept as its own species only because
replay-safety (§18.4) is checked on conversions, not on plain constructs.

Triggers: an operator may declare what invokes it besides a direct call —
a logged event name (any operator or the runtime emits events into the log;
a matching trigger invokes the handler with inputs bound from the event
payload and entity reference) or a schedule. Reaction, not observation:
there is no standing query anywhere in the system — the only things that
wake an operator are a call, a trigger, or a task retry.

Purity means exactly: no entity writes, no hidden reads. Determinism is NOT
required — services version and drift. Therefore every `k`/`s` result records
its effective inputs (`provenance.effective`: params + versions of every
input). The current `machineSnapshot`/`toolSnapshot`/algorithm-revision field
habit on sheets becomes provenance semantics instead of per-entity cargo.

A `Ref` may travel through V (§2) as a pointer, but dereferencing one —
loading the instance or its payload — is a projection's job, never a
service handler's. An s-species input signature with a `ref` field is a
static defect; a service handler that resolves instances or files is an
architectural violation. Species semantics change only by editing this
SPEC: a pack README, code comment, or handler restating what a species may
receive or resolve is a defect, not a contract.

Composition (audit correction): process graphs are the composition
calculus, owned by `@perigram/processes` — its node catalog, socket roles,
and packet shapes stay authoritative. The six species are the canonical
kinds of the graph's effect layer (`cts.construct`, `cts.mutate`,
`cts.transition`, `cts.remove`, `cts.command`, and `cts.service`, with
conversion where declared), not a parallel calculus. CTS supplies the
declaration-layer types those nodes reference and constrains them (R1 rows,
R2 targets, R5 service purity); it does not re-implement dataflow typing.
The projection `p` is expressed by the graph's read family, not by an
effect: `cts.read select=extract` dereferences a projection declared on
the bound type (§16's `p extract`, declared next to its type with its
output type and either a stored `field` path or a pack-mounted handler),
and `cts.field` projects a row path — together the only entity→value
gates; the graph never authors paths into stored payloads.

Palette law (owner's words, 2026-09-30): the type system dictates
everything. The process base-type list is the authority — a declaration,
projection output, or service signature that names a base outside it is a
validation error, never silently degraded. Instances are managed the
dataflow way: the packet tree (branches, items, graft/flatten/zip) is the
one data model, and every palette node is list-aware through it. One home
per operation: field-value reads live on the record elimination form
(`value.recordField`) and the entity gate (`cts.field`); filtering owns
comparison predicates; boolean algebra composes them. `entity` is legacy
slang — current authoring vocabulary names references as `entityRef`, and
the untyped `entity` spelling survives only inside the persisted-v4
compatibility tier. Palette sections are plugin tabs: a pack's declared
data operations — the documents pack's xlsx/csv table decomposition
(decomposition, composition, and management of table data), the facade
pack's cassette geometry extraction and solver — drop pre-bound in the
pack's own tab, never in a generic bucket; a packless service falls back
to the services tab. Entity sources are the generic read presets, bound
at configure time — the palette never enumerates per-type copies of a
generic gesture.

Operation atomicity (owner's words, 2026-10-10): the palette operates like
a dataflow toolkit — atomic operations that cover the basics exhaustively,
composed into complex behavior by wiring. No node does what a composition
of atomic nodes already covers. Kinds whose operation is an authored
discriminator (math, string, dateTime, compare, logic, list reduction)
have exactly one registry home: the operation table owns each operation's
socket contract and evaluation; the port catalog, the evaluator, and the
authoring surfaces derive from it and never restate operation lists.

An editor is `p(T) -> ui` plus `construct(T)` or `mutate(Ref(T))`, bound to a
surface. "An editor that produces other files" is a `k` from the editor's
save — no new species.

## 9. Aggregates

Declared per edge, typed by child type (a project contains queues AND
facades; each edge aggregates its own):

```
aggregates: { on children(queue):  { count, totalArea: sum(fields.area) },
              on children(facade): { count } }
```

Maintained by the runtime as materialized read-only caches. Never authored,
never hand-synced (deletes `summaries.js` logic and the `summary.*Preview`
write paths' ambiguity about who owns what).

## 10. Policy

Field visibility and grants per role, declared on the type; the compiler
projects them to DTO redaction and process grants. One home (today:
`field-access.js` and `roleGrants` restate each other). Missing policy =
hidden, as today.

## 11. Evolution

- Every type has `version: n`; every instance stamps `typeVersion`.
- Changing a row/enums/edges goes through the compiler's diff (the existing
  `contract-diff.js` becomes a compiler phase). Refusal applies to types
  with **persisted instances**: a type with zero instances redefines
  freely (a plain version bump) — there is nothing to migrate:
  - additive-nullable, added edge, added aggregate: minor bump, no migration;
  - rename/remove/retype: requires declared `migrate` steps (declarative:
    rename, add default, remove, retype via expression) run by the task
    runtime, idempotent, org-scoped;
  - no migration declared for a breaking diff = compile error, not a script
    someone remembers to write (the ~20 `server/scripts/migrate-*.js` files
    are this mechanism's absence).
- An instance whose `typeVersion` is behind is ill-typed by definition;
  queries may pin versions during rollout.

## 12. Static rules

The compiler enforces exactly these; each replaces a hand-maintained guard:

| # | Rule | Replaces |
|---|---|---|
| R1 | closed rows: every field path used by any predicate/patch/record node is in the target type's row | field-access duplication |
| R2 | typed edges: every Ref assignment checks the edge's target set and `onRemove` | bare `data.*Id` drift |
| R3 | unit discipline on `Quantity` | suffix strings, unit qualifiers |
| R4 | state authoring: flat values on state nodes wired into create/transition sockets; nesting is wiring a state into a state input; no axis names, no parent markers (§7) | process-graph validators |
| R5 | dataflow: process graph sockets typecheck; `s` consumes only V (entities reach services solely via `p`) | missing-field/reachability diagnostics |
| R6 | class obligations of §5 checked at type-compile | `meta` flag vs master/system drift |
| R7 | version/migration completeness per §11 | ad-hoc migrate scripts |

## 13. Code and DB mapping

| CTS concept | Storage | Code home |
|---|---|---|
| type declaration | `types` collection (versioned docs) | designer writes; starter packs are seed files in domain packages |
| party entities | `parties` | framework, fixed |
| file entities | `files` (+ GridFS blobs) | generic file service (today's artifacts service) |
| item entities | `items` | generic item service |
| group entities | `groups` | generic group service |
| process entities | `processes` | process runtime (today's compiled process definitions) |
| edges | slots on the entity docs | validators; no join tables |
| aggregates | `summary` cache on parent doc | aggregate runtime |
| logs | `command_runs`, `task_runs`, `status_events` | operator runtime, schema-free |
| grammar + validator | — | `packages/core`: CTS grammar; rows compile to JSON Schema validated by Ajv (custom keywords: `Quantity`, `Ref`) |
| expressions (guards, predicates, transforms) | — | CEL semantics; a standard CEL engine if it holds up in browser and server, else a small evaluator with exactly §18's rules |
| compiler (R1-R7, diff, migrations) | — | `packages/processes` |
| operator runtime | — | today's command/task machinery, signatures added |
| CNC vocabulary | seeded type pack + projections/services | `packages/facade` reduced to content |

Collections are per class with `type` discriminator (+ `typeVersion`); typed
fields with query hints project to compound indexes on `(type, field)`.
Index definitions derive from the registry view — never a hand-mirrored
list: every class collection carries `(type, organizationId, createdAt)`
for list ordering and `(type, organizationId, state)`; each declared
children edge adds `(type, organizationId, lineage.<key>)` on the child
type's class collection and each declared relation edge adds
`(type, organizationId, relations.<key>)` on the owner's. The instance
feature derives and (idempotently) applies them when declarations change
and at process activation.

## 14. Process designer in development

Authoring loop:

1. **Declaration view**: a declaration graph edits CTS facts — class, fields,
   children/relation/provenance edges, and operator signatures/triggers.
   State nodes declare flat values; they wire into create and transition
   operations and never nest (§7).
2. **Process view**: an executable graph composes the declared types and
   operators. It may appear in the same application shell, but its nodes and
   edges are a separate semantic graph: it references declarations and never
   mutates them. Construction receives its initial state through the create
   node's state socket; transitions receive their target the same way.
3. **Save = validate each graph at its own boundary, then compile the process
   against the declaration view.** R1–R7 run inline; errors name the
   declaration node or process edge that caused them.
4. **Breaking change = migration prompt.** The diff phase names what broke;
   the designer offers the declared migration step editor; deploying the
   version queues the migration task.
5. **Process graphs typecheck live** against operator signatures and declared
   edges. Type-changing traversal has an exact declared target type; raw
   instance ids, producer identities, packet matching, and compiler transport
   adapters are not palette operations.
6. **Engineers work the same loop in code** for framework/starter packs:
   a type pack is a seed module compiled by the same validator; org-authored
   types are the same documents. No second format.

## 15. Existing constructs -> CTS

| Existing | Becomes |
|---|---|
| 30 `cncEntities` + blocks | type declarations (data) |
| `workflows.js`, intents, `workflow_overrides` | state nodes in process definitions; intents on operator outputs — resolving the third home: entity-profile lifecycles and `stateDefinition` records compile INTO the process graphs (compiler-core `compileLifecycle`), never alongside them |
| `cncStatusUi`, icons, labels | display policy on state values (§7) plus `name`/`glyph`/field labels on declarations |
| `attachment-kinds.js` | payload traits + construct affiliations |
| `producers.js`, `artifact-conversions.js` | construct/conversion operator registry |
| `field-schemas.js` base/shape/itemType/unit | field-selector projection over rows (subsumed by §2; the runtime grammar is `packages/processes/types.js`, which CTS does not replace) |
| `field-access.js`, `roleGrants` | policy facet |
| `summaries.js` | per-edge aggregates |
| `revisions.js` | revision facet |
| commands/tasks/effects runtime | operator runtime (machinery unchanged; the six species classify the existing effect node family rather than replacing the graph calculus) |
| status v2 regions | parallel axes |
| `Specs` class, `specs` block | `Quantity` fields |
| surface keys, aliases, `meta` flag | deleted; nominal type + policy |
| `organization`/`user` | party types, framework-owned |
| snapshot fields on sheets | `provenance.effective` |
| `contract-diff.js` | compiler diff phase (§11) |
| migrate-*.js scripts | declared migrations (§11) |

## 16. Worked example

```
struct Ring   = [Point]; Point = (x: Quantity(mm), y: Quantity(mm))
struct Polygon = (outer: Ring, holes: [Ring])

type OCCS : file {
  payload application/perigram+occs
  fields { parameters: [Param], graph: Json }   -- graph: foreign-format
                                                -- entropy, quarantined
  revisions geometry
  operators { editor: cassette-designer }       -- construct | mutate via UI
}

type CutPlan : file {                           -- "sheet_design"
  fields { geometry: [Polygon], parts: [(ref: Ref(OCCS), qty: Number)] }
  revisions geometry
}

type Material : file {
  fields { code: String, thickness: Quantity(mm) }
}

type Sheet : item {
  fields { width: Quantity(mm), length: Quantity(mm), area: Quantity(m2),
           material: Ref(Material), placed: [Ref(Part)] }
}

type Part : item {                              -- "cassette_instance"
  fields { design: Ref(CutPlan) }
  edges relations { placed-on: Ref(Sheet), onRemove: detach }
}

type Project : group {
  edges children { queues: [Queue] onRemove cascade,
                   facades: [Facade] onRemove restrict }
  aggregates { on children(queues): { count } }
}

type Queue : process {
  fields { job: [(item: Ref(OCCS | CutPlan), qty: Number, params: Map)] }
  edges provenance-in { project: Ref(Project) }
}

type SolveRun : process {                       -- "nesting_run"
  outputs [Ref(CutPlan), Ref(Sheet)]
}

-- the nesting seam, fully typed:
p extract : (Ref(OCCS), params) -> [Polygon]      -- pure, declared next to OCCS
s solve   : (NestingProblem) -> NestingSolution   -- service: values only (R5)
k run     : (Ref(Queue)) -> Ref(SolveRun)         -- command: policy + record
                                                  -- + effects; provenance.effective
                                                  -- pins machine/tool/solver
                                                  -- versions
```

`nesting/operations.js`'s fused resolve-evaluate-merge-persist blob becomes
three declarations and one pure function.

## 17. A change, end to end

"Add foil thickness to sheets":

1. Designer: open `Sheet`, add `foil: Quantity(mm)?` (nullable).
2. Save compiles: additive-nullable -> minor version bump, no migration (R7
   satisfied); predicates/cards referencing `fields.foil` become available;
   nothing else changes.
3. "Rename `scrap` to `recycled`": diff is breaking; designer offers the
   migration step (`rename-enum-value main.scrap -> recycled`); deploy bumps
   the version and queues the task-runtime migration; instances migrate; R4
   checked throughout.
4. Screens that showed the old field fall back by derivation (absent from
   row -> absent from UI), not by editing components.

## 18. Expression forms and runtime contract

CTS is deliberately total, not Turing-complete. Everything static — rows,
graphs, expressions, checks R1–R7 — terminates by construction; decidability
is what makes live designer checking and diff-driven migrations possible.
Turing-completeness is quarantined inside `s` (and editors/workers) behind
typed `V -> V` signatures. The expression semantics are CEL's — total, no
recursion, iteration only as comprehensions — the same convergence Kubernetes
reached for admission rules; use a standard CEL engine where it performs in
browser and server, otherwise a small evaluator implementing exactly these
rules. `match` is specified now but implemented only when a variant first
sits in predicate position. Four completions follow from this principle:

1. **`match`** — the elimination form for variants:

   ```
   match e { tag1(x) -> expr1, tag2(y) -> expr2, ... }
   ```

   Total and exhaustiveness-checked: a missing tag is a static error, not a
   runtime fallthrough. Arms are expressions over V; guards may not recurse.

2. **Bounded structured iteration** — `map`/`filter` in CTS expressions;
   the graph layer additionally provides `control.forEach`/`collection.
   dispatch`/`tree.cross` over finite packets — bounded, typed, and
   structurally terminating (audit correction: "map/filter only" was
   falsified by the node catalog). Unbounded iteration and recursion still
   belong to `s`. The runtime's missing-field marker contract
   (`missing-field.js`: missing stays distinguishable from null through the
   whole pipeline, serialized only at result boundaries) is adopted as part
   of this discipline.

3. **Concurrency** — optimistic. Guards are re-evaluated atomically at commit
   against the current state snapshot (a conditional update on the stored
   document); a guard that no longer holds fails the transition. A racing
   transition that loses is rejected, never merged.

4. **Failure** — no sagas, no compensation operators. Operators are
   idempotent: request replay is deduplicated by idempotency key (the
   outbox/idempotency runtime already provides this), and
   `provenance.effective` makes `k` replay-safe — re-running a conversion
   with the same effective inputs converges instead of duplicating output.
   Retry policy is the declared per-operator knob and the whole failure
   story.

## 19. Build order

The spec is exhaustive; the implementation is not built all at once. Two
tiers:

**Core (the rewrite):** §2 grammar on the JSON Schema substrate, §3 stored
shape, §4 declarations + tenancy, §6 edges, §7 single-axis states with
intents on operators, §8 operator species + triggers, §12 rules R1–R6,
§11 reduced to version stamping + a diff that refuses breaking changes,
§13 collection mapping. Everything in §15's collapse table must land here —
completeness of the tier is measured by that table.

**Source flip (landed, then the cut):** the process designer and the
process compiler's domain input consume exactly one source — the
organization's registry view through `projectDomainFromView`. The
strangler phase converted legacy tables and asserted projection
equivalence by test; that phase is over and the converter is deleted.
The projection is now **synthesis-only**: every type in the view —
framework, pack, or org — synthesizes its entities entry (per-class
collection per §13), workflows (graph-derived at compile, never projected
from declarations), field
schemas (core-slot convention + rows; `item` quantities land in `specs`,
everything else in `data`), field access (bound to the cts-types
feature), containment (children edges), construction (`genericCreate` +
declared construct operators as `via` modes), relations (declared
edges), and attachment kinds (payload traits). Nothing passes through
from a legacy base domain: entity tables, workflows, construction,
field schemas, field access, relations, containment, and attachment
kinds supplied on `baseDomain` are ignored by the projection — the base
contributes only operator contracts (commands/tasks/hooks), the
framework canonical block vocabulary, and pack service registrations.
Legacy persisted data in per-entity collections is abandoned, not
migrated. Type declarations are authored in the process designer tree
(one tree, §20); `pages/organization/types.vue` is the registry browser.

**Open frontier (§13 second half — closed by the cut):** org-authored
and pack types execute through the generic per-class instance services;
there are no hand-written entity services beyond the framework's five.
The registry view is the whole catalog: legacy entity types outside the
view are not projected, not offered by the palette, and not executable —
constructing one fails loudly (`Unknown type`). Persisted legacy
collections and process definitions authored against them are abandoned
data; organizations re-author on declarations.

**Grammar alignment (from the audit, before L2):** reconcile V with
`PROCESS_BASE_TYPES` — adopt `entity`/`entityRef` separation, the coercion
lattice, and socket roles at the CTS boundary, or explicitly scope V to
declarations-only and translate at the seam. V is currently scoped to
declarations; the seam translator is `compat/field-schema-rows.js`.

**Deferred until a real need appears (specified, not built):** declarative
migration steps beyond refuse-on-diff (§11); aggregates and materialized
summary caches — compute on read first (§9); policy beyond closed-row
hiding (§10); state axes beyond `main` (§7); `match` implementation (§18).
Adding any of these earlier is speculative build, the exact failure mode
this spec exists to delete.

## 20. Graph protocol (v5): declaration-bound process definitions

Process definitions stop speaking the entity/block/status vocabulary. The
stored records of every entity-bound node reference declarations; the pure
value algebra (`source.*`, `value.*`, `collection.*`/`tree.*`, `control.*`,
literals) is already V-honest and is untouched.

### Node kinds

The stored executable record uses the species names of §8. Reads use one
kind with a closed `select` discriminator. These records are the compiler and
runtime contract; they are not rewritten to an older entity vocabulary before
execution:

| retired executable kind | current kind | binding |
|---|---|---|
| `effect.createEntity` / `effect.runProducer` | `cts.construct` | `typeId`, `construction.mode` |
| `effect.updateEntity` | `cts.mutate` | inferred entity stream, writable field ports |
| `effect.changeStatus` / `effect.archiveEntity` | `cts.transition` | entity stream, state socket |
| `effect.deleteEntity` | `cts.remove` | inferred entity stream |
| `effect.runCommand` / `effect.sendEntity` | `cts.command` | `commandId` |
| registered V→V operator | `cts.service` | `operator` |
| `effect.generateAttachment` | `cts.conversion` | operator + declared signature |
| ambient/current, by-reference, all, edge traversal | `cts.read` | closed `select` + exact input/output types |
| field projection | `cts.field` | inferred entity stream + declared field |
| producer-path convergence | internal compiler behavior | no author-facing node |

`cts.mutate` writes only declared row/relation fields. `cts.transition`
applies the state supplied on its state socket and cannot smuggle an
arbitrary field patch. `cts.construct` receives its initial state through
the state socket (§7). Type-changing reads select a declared edge and expose its
exact target type.

`cts.decompose` is the instance elimination form (owner's words,
2026-10-10): one instance in, every facet of that instance out as its own
typed socket — identity, every declared row field, every declared lineage
edge (the typed parent reference), every declared relation, the state axis,
provenance. The socket list derives entirely from the bound type's
projected field schemas; no hardcoded block list filters it. A facet the
runtime value does not carry reads as the missing-field marker, never as an
error. It is a palette item.

### References

- **Types**: `typeId: 'sheet_design'` becomes `typeId: 'sheet-design'`
  (the CTS id) in every record collection — `processNodes`, `producerOutputs`
  (`fields` path lists included), `actions`, `sockets` (descriptors via the
  grammar adapter), `screens` sources. The binding key is `typeId`, never
  `type`: `type` remains the value descriptor of the shared value algebra,
  and load-time migration normalizes legacy persisted `type` strings.
- **Fields**: row fields are row-relative (`specs.width` → `width`,
  `data.job.items` → `job.items`); managed slots keep qualified names
  (`identity.*`, `state`, `lineage.<key>`, `relations.*`,
  `provenance.*`, `data.value` the reserved generic slot) until the
  stored-shape migration (§3) re-homes them.
- **States**: the process authors state values as state nodes and supplies
  them through sockets. A construct node's `state` input socket carries the
  created instance's initial state; a transition node's `state` input socket
  carries its target. The wire from a state node is the value; an authored
  socket default is equivalent. A transition record carries no state payload
  and no transition reference — the socket is the only state authoring
  surface (§7).
- **Constructors**: `construction.mode` becomes `via`; typed constructor
  inputs and service signatures become declared operators (§8) — command and
  producer code registers as operators, unchanged.

### Resolution and migration

- `resolveCtsDefinition(definition, view)` is the single binding-resolution
  seam. It resolves declaration ids and declared row paths but preserves the
  current species kind, read discriminator, socket ids, and graph edges. The
  canonical records returned by this seam are what validation, compilation,
  orchestration, execution, and persistence all consume.
- `operationKindOf` is presentation/classification only. It may answer
  "construct", "mutate", "transition", "read", or "service" for shared code;
  it never changes a record kind or replaces its authored ports.
- Authored definitions speak the current species vocabulary only. There is
  no v4 rewrite at any seam; the retired executable kinds have no runtime
  fallback.
- `checkCtsGraphBindings(definition, view)` validates type, field, state,
  transition, operator, and declared-edge bindings beside R1–R6.
- Acceptance requires that resolution and compilation preserve every
  authored native record's kind and typed ports. A twin operation kind
  merely existing is not acceptance.

### Type nodes and binding wires

The palette is operations, never an implementation-mechanism catalog. A
construct may be dropped pre-bound when the chosen type/mode is itself the
authoring intent. Otherwise origin operations carry a persistent Type pin
wired from a type node or class. Consumers (mutate, transition, remove and
field projection) carry no Type pin: their entity input determines the bound
type. Entity-derived reads additionally select a declared edge; their output
type comes from that edge, not from the input type.

A typed reference (`Ref<T>`) is the only author-facing identity value for an
existing instance. Raw storage-id lookup is not a process operation. Query
means an unfiltered `All<T>` source; predicates are ordinary field/logic/list
dataflow. Type-changing traversal is generated from a children, parent, or
relation edge and exposes the edge's exact target type.

Binding wires are `role: 'type'` declaration edges, interpreted on every
declaration-graph change. They are live authoring channels but never dataflow
edges. The interpreted binding is persisted; executable validation sees one
canonical type contract, not a declaration wire and a duplicate record field.

### Canonical records and adapter internals

The designer, compiler, and runtime all store and execute the current species
records. `cts.mutate` keeps writable field ports through every boundary;
`cts.read` and `cts.field` keep `entity` inputs; `cts.transition` keeps its
declared target and note/access policy. No execution adapter may substitute
block, generic-value, or retired operation ports.

Producer outputs are provenance and field-policy records for actual entity
origins (construct or entity-producing operator). Reads and consumer effects
do not create producer outputs and do not own lifecycle machines. Workflow
identity comes from the process graph's state authoring; a process operation
may overlay process-role authorization for one transition.

Packet matching, topology adapters, and stream/list representation conversion
are compiler concerns. They may be explicit advanced primitives, but they are
not hidden per-node authoring requirements. The primary palette contains
only semantics a process author intentionally composes.

## 21. Packs

Domain content is optional plug-ins. The framework (registry, runtime,
designer) imports nothing domain-shaped; a pack mounts through one module
and provides:

**Requirements and composition:** a pack may declare `requires: [packIds]`.
The registry composes the system view as framework types plus every
mounted pack's types in dependency order; a missing requirement or a
duplicate system type id across packs is a mount-time error (packs never
shadow each other — the org-over-system overlay rule stays the only
shadowing). Cross-pack references are by type id only: a pack's
declarations and code never import another pack's modules, they resolve
through the composed view.

- **Types**: declarations (file/item/group/process). Pack types are
  `scope: 'system'` in every org view. Party types are framework-owned,
  never pack-owned.
- **Editors**: bindings of an authoring surface to a file type's payload
  (create/edit/view modes).
- **Services**: operator registrations — a service species (`s: V -> V`)
  with its task executor, or a conversion with its command; the operator
  runtime executes them unchanged.
- **Entity services** (transitional): legacy feature services with process
  bindings, mounted like everything else and deleted with the legacy layer.
- **Attachment kinds**: payload upload contracts for the pack's file types.

The boundary rule: `server/runtime/app-registry.js` (the framework
registry) imports packs, never domain modules directly; a pack's
declaration data is browser-safe (the designer imports it for the client
type view) while its mount module binds server services. Removing a pack
removes its types, editors, services, and routes from the running app.

**The nesting service's V→V boundary (§8, landed):** the registered
operator resolves to `solveNestingValue` — pure value in (job geometry
items + sheet params per the declared signature), value out (layouts +
summary). The worker call and the projections are the nesting feature's own
machinery, reused verbatim; no queue entities, no runs, no legacy services.
The queue-orchestrated flow remains pack-internal for the existing UI
surfaces until those flows are re-authored on the graph.

**Registered services as palette operators (§8, landed):** pack-registered
services appear as `cts.service` palette nodes bound to their operator;
resolution maps the operator to its declared command (the executable twin),
and ports resolve from the command contract. Unknown operators are
compile-time diagnostics. Editor registrations surface as chips on file
type nodes (the types canvas) and on the designer contract, and are served
with the organization type view (`describeOrganizationTypes`) so app
surfaces resolve `type → surface + modes` server-driven; the app maps
surface ids to its editor components in one fixed surface registry instead
of entity-keyed overload tables. Sheet design binds the editing
`sheet-design-editor` surface (create/edit), receiving the caller's write
grant — view-only when the grant is absent.

**Declaration authoring in nodes (§20/§7):** the declaration view is a
node graph — type/field/state/transition/operator nodes, class declarations,
typed children/relation/provenance edges, and state-parent edges. A state
connected to another state declares nesting under that parent; transition
nodes connect explicit `from` and `to` state references. Saving compiles this
graph into the recursive state/edge/operator declarations consumed by the
registry. The process view is a separate semantic graph in the same designer
shell and may reference those declarations but cannot rewrite them through a
process edge.

**Generic instance services (§13, landed; §3 stored shape):** every type
without an explicit feature service resolves through the registry's service
resolver to a generic per-class instance service. Instance documents are
stored in the §3 shape (`type`, `typeVersion`, `name`, flat `fields`,
`state`, `lineage`, `relations`); the block vocabulary
(`identity`/`status`/`data`/`specs`) is a wire-DTO projection owned by the
instance service boundary — screens and compiled contracts speak the wire
shape, storage speaks §3. No legacy entity services are mounted
at all: the CNC pack registers only its commands and the nesting task
executor, and the legacy entity API surface (queues, projects, sheets,
catalogs, machines, …) is deleted — the CNC feature modules that remain
are pack-internal implementation for the editors and the nesting solver (files/items/groups/processes
collections, type discriminator, generic construction from the
declaration, per-call declaration resolution — framework/pack static, org
from the type store). Pack types and org-authored types are executable
without hand-written services. The projected entity list is view-only:
legacy entity rows outside the registry view are not projected, and
constructibility falls back to the declaration when no explicit capability
exists.

The CNC pack is the reference implementation: cassette (OCCS file, edited
by the cassette designer), sheet design, facade design as file types, and
the nesting solver as a registered service. The legacy entity tables
(the deleted legacy domain tables) are no longer part of the
process path: the projection does not read them, the palette does not
offer them, and the runtime serves none of them. They remain in the
package only as pack-internal content for non-process surfaces (editors'
own feature modules, the legacy UI fallbacks SPEC §21 holds pack-internal)
until those surfaces are deleted.
