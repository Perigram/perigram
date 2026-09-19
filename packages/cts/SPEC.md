# SPEC: Perigram Type System (CTS)

Status: core tier implemented (`packages/cts`, see its README for the module
map). The declaration layer is the live source of the process designer and
the process compiler's domain input; the runtime instance services
(§13 per-class collections) remain the open strangler frontier. This spec is
the collapse point of the constructs spread across `packages/core`
(canonical blocks), `packages/domain-cnc` (entities, workflows, kinds, field
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
- **UI layout.** Screens, cards, field groups are render-policy projections
  of type declarations. They are downstream data, not part of the language.

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
  id:         Id
  type:       TypeId            -- assigned at construct, immutable
  typeVersion: Number           -- version of T's row it conforms to (§11)
  fields:     T.row             -- the type's product, instantiated
  lineage:    { key -> Ref }    -- tree edges (containment), from child
  relations:  { key -> Ref | [Ref] }   -- peer edges
  provenance: { op, sources: [Ref], effective: Record }
                                  -- causal edges; `effective` records params
                                  -- AND input versions (§8 purity)
  states:     { axis -> enum value }  -- may be empty
  payload:    Blob | none       -- iff T declares payload
  history:    [revision]        -- iff T declares a revision scope
}
```

The ten canonical blocks reduce to slots: `data`/`specs` -> fields (specs
become `Quantity` fields), `identity/origin/status` -> id/states/history,
`attachments` -> payload, `summary` -> derived cache (§9), `lineage/
relations/provenance` -> the three edge kinds.

## 4. Type declaration

```
type T : Class {
  fields:      { name: FieldType, ... }        -- closed row
  payload:     mime | none
  edges:       edge declarations (§6)
  states:      { axis: Enum, ... }             -- may be absent
  transitions: { from -> to, axis, intent?, guard?, effects? }[]
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

Payload traits: the payload declaration carries the accepted MIME list and
byte limits (enforced at construct time) plus the preview mode (render
policy, projected to UI like enum labels). This is the whole of today's
`attachment-kinds.js`, as data on the type.

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
| `file` | payload or fields | lineage children, item states | content/value identity; replaceable; referenced |
| `item` | states; serial or specs | payload* | tracked individual; never replaced |
| `group` | lineage children | states beyond publish | identity is its membership |
| `process` | states; input edges (provenance sources); output types | payload | identity is a run; state driven by operators, not users |

*publish-style states (`draft/active/archived`) are the shared `archivable`
facet, available to all classes.

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

This is the type-level home of what `propagateToChildren` and the delete
grant matrix currently improvise in code.

A `Ref` stored outside a declared edge slot (the `data.manufacturerId`,
`data.queueId`, `lineage.catalogId` drift) is a static error (R2). `Id`
fields without a carrier `Ref` are the same error.

## 7. States

```
states: { main: draft | nesting | ready | error | closed,   -- axes are
          quality: unchecked | passed }                     -- independent
}
```

- One axis moves per transition; guards are predicates over V plus actor
  identity and grants; effects are declared side-effect lists executed by the
  operator runtime after the state snapshot is written.
- Intents (`requestNesting`, `nestingSolveCompleted`, ...) are declared by
  the operator that fires them, on its output contract. There is no second
  place where lifecycle information lives — no `workflows.js`, no
  `workflow_overrides`, no status-label mirror. Status v2 `regions` are the
  axes, restated.
- Labels, icons, severity are render policy attached to enum values in the
  designer; they project to UI, they are not checked.

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

Composition (audit correction): process graphs are the composition
calculus, owned by `@cutkit/processes` — its node catalog (90+ kinds),
socket roles, and packet shapes stay authoritative. The six species are a
CLASSIFICATION of the graph's effect layer (`effect.createEntity/
updateEntity/changeStatus/runCommand` are c/m/d plus command wrapping), not
a parallel calculus. CTS supplies the declaration-layer types those nodes
reference and constrains them (R1 rows, R2 targets, R5 service purity); it
does not re-implement dataflow typing.

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
  `contract-diff.js` becomes a compiler phase):
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
| R4 | state totality: transitions within axis enum; one initial; reachable terminal; one intent has one target state | workflow validators |
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
| CNC vocabulary | seeded type pack + projections/services | `packages/domain-cnc` reduced to content |

Collections are per class with `type` discriminator (+ `typeVersion`); typed
fields with query hints project to compound indexes on `(type, field)`.

## 14. Process designer in development

Authoring loop:

1. **Types pane**: list of type records (grouped by class). Type editor shows
   one section per facet: fields row editor (with V types and units), edges
   (children/relations + `onRemove`), states graph (axes, transitions,
   guards, effects), operators (signatures, which may bind an editor or a
   command), aggregates, policy, migrations.
2. **Save = compile.** R1–R7 run inline; errors surface where they bite
   (a predicate node referencing a removed field names the node; a unit
   mismatch names the socket).
3. **Breaking change = migration prompt.** The diff phase names what broke;
   the designer offers the declarative step editor; deploying the version
   queues the migration task.
4. **Process graphs typecheck live** against operator signatures: sockets
   carry V types; invalid wiring is visible at authoring time, not at run.
5. **Engineers work the same loop in code** for framework/starter packs:
   a type pack is a seed module compiled by the same validator; org-authored
   types in `types` are the same documents. No second format.

## 15. Existing constructs -> CTS

| Existing | Becomes |
|---|---|
| 30 `cncEntities` + blocks | type declarations (data) |
| `workflows.js`, intents, `workflow_overrides` | states/transitions in type defs; intents on operator outputs — resolving the third home: entity-profile lifecycles and `statusDefinition` records compile INTO these declarations (compiler-core `compileLifecycle`), never alongside them |
| `cncStatusUi`, icons, labels | render policy on enum values |
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
  states { main: available | cutting | milled | scrap }
}

type Part : item {                              -- "cassette_instance"
  fields { design: Ref(CutPlan) }
  states { main: cut | milled | installed }
  edges relations { placed-on: Ref(Sheet), onRemove: detach }
}

type Project : group {
  edges children { queues: [Queue] onRemove cascade,
                   facades: [Facade] onRemove restrict }
  aggregates { on children(queues): { count } }
}

type Queue : process {
  fields { job: [(item: Ref(OCCS | CutPlan), qty: Number, params: Map)] }
  states { main: draft | nesting | ready | error | closed }
  edges provenance-in { project: Ref(Project) }
}

type SolveRun : process {                       -- "nesting_run"
  states { main: nesting | complete | failed | chosen }
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
collection per §13), workflows (declared states/transitions), field
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

Effect nodes take the species names of §8 (the canonical table is
`SPECIES_BY_EFFECT_KIND`); reads collapse to one projection kind with a
`select` discriminator; the records family becomes field/edge structure:

| v4 kind | v5 kind | binding |
|---|---|---|
| `effect.createEntity` / `effect.runProducer` | `cts.construct` | `type`, `via` (constructor) |
| `effect.updateEntity` | `cts.mutate` | `type`, field refs |
| `effect.changeStatus` / `effect.archiveEntity` | `cts.transition` | `type`, `target` state (+ optional `intent`) |
| `effect.deleteEntity` | `cts.remove` | `type` |
| `effect.runCommand` / `effect.sendEntity` | `cts.command` | `command` |
| `effect.generateAttachment` | `cts.conversion` | `kind` + attachment contract |
| `read.*` (7 selects + filter) | `cts.read` | `select`, `type` |
| `record.getField` | `cts.field` | field ref |
| `record.composeBlock` / `modifyBlock` | `cts.compose` | field/edge refs |
| `record.deconstruct` / `getBlock` | `cts.decompose` | `type` |
| `record.construct` / `entityDraft` | `cts.compose` | `record: type` |
| `producer.join` | `cts.join` | `type` |

### References

- **Types**: `entityType: 'cassette_design'` becomes `typeId: 'cassette-design'`
  (the CTS id) in every record collection — `processNodes`, `producerOutputs`
  (`fields` path lists included), `actions`, `sockets` (descriptors via the
  grammar adapter), `screens` sources. The binding key is `typeId`, never
  `type`: `type` remains the value descriptor of the shared value algebra,
  and load-time migration normalizes legacy persisted `type` strings.
- **Fields**: row fields are row-relative (`specs.width` → `width`,
  `data.job.items` → `job.items`); managed slots keep qualified names
  (`identity.*`, `status.state.primary`, `lineage.<key>`, `relations.*`,
  `provenance.*`, `data.value` the reserved generic slot) until the
  stored-shape migration (§3) re-homes them.
- **States**: status strings become declaration-owned state values;
  `cts.transition` carries `target` plus optional `intent` (intent-first
  authoring arrives with the designer slice; the runtime resolves from-state
  dynamically, so target-only is lossless).
- **Constructors**: `construction.mode` becomes `via`; typed constructor
  inputs and service signatures become declared operators (§8) — command and
  producer code registers as operators, unchanged.

### Resolution and migration

- `resolveCtsDefinition(definition, view)` lowers v5 records to the
  executable working shapes (types back to storage ids, row paths back to
  slot paths, species kinds back to operation kinds). It runs inside
  `prepareAuthoredDefinition` (`@cutkit/processes`) — the single seam every
  validate/compile/activate path flows through; no consumer outside that
  package resolves or lowers the vocabulary. The lowered form is internal:
  never authored, never persisted.
- `migrateV4Definition(definition)` is the one-way persisted rewrite
  (same pattern as the process package's v4 identity migration). It runs at
  the server boundary on load, so stored graphs become v5 within one deploy;
  `dataflowVersion` stays `4` (the wire protocol of the value algebra is
  unchanged — v5 changes record vocabulary, not dataflow semantics).
- `checkCtsGraphBindings(definition, view)` validates bindings (type exists,
  state declared, field in row) beside R1–R6.
- Equivalence is the acceptance gate: for any definition,
  `compile(v4)` and `compile(resolve(migrate(v4)))` produce the same
  contract.

### Type nodes and binding wires

The palette is operations, never a domain catalog. No node drops pre-bound:
a seeded domain type is an invisible authoring decision the user never
made — records are unbound until the author binds them (the palette's
type-catalog constructs are the one exception, where the chosen item IS
the binding). Type reference nodes persist on the canvas as `ctsType`
nodes (they own no records). Binding semantics split by species: origin
species (`cts.construct`, `cts.read`) carry a persistent Type pin wired
from a type node or class; consumer species (`cts.mutate`,
`cts.transition`, `cts.remove`) carry no pin — their binding follows the
Type wire while one exists, else the entity input's source type, else
the stored preset. Binding wires are `role: 'type'` canvas edges — live
binding channels, interpreted on every graph change (renaming the
source re-binds every wired descendant; removing the channel unbinds
what it carried). Normalization drops them before validation because
the interpreted binding itself is persisted in the record.

### Residue (explicit)

The designer authors v5: the palette speaks species kinds (`cts.*`), node
creation writes `typeId`/`via`/`slots`, stored v4 graphs migrate on load,
and `operationKindOf` is the single seam every kind-matching consumer
routes through (client and catalog; no duplicated vocabulary). Producer
outputs synced by the designer keep storage entity ids — load-time
migration normalizes them on the next cycle. The composer-less construct
landed (2026-09-18): declared row fields project as generic-construction
inputs and surface as typed construct sockets (no block sockets on the
species record; blocks are the v4 twin's substrate), declared construct
operators project as `via` modes with signature-derived mode inputs, and
`cts.mutate` patches leaves (writable row fields as field sockets; blocks
stay on the v4 twin). Remaining residue: field pickers list slot paths,
which resolution passes through unchanged. `statusDefinitions` remain
definition-plane records authoring state metadata; per §7 they compile
into declarations, never alongside.

## 21. Packs

Domain content is optional plug-ins. The framework (registry, runtime,
designer) imports nothing domain-shaped; a pack mounts through one module
and provides:

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
type nodes (the types canvas) and on the designer contract.

**Declaration authoring in nodes (§20/§7, landed):** the types surface is a
node canvas — type/field/state nodes, declares wires, state-to-state
transition wires carrying intents, type-to-type children wires. Saving
compiles the canvas into declarations (fields from field nodes, states and
transitions from state nodes and wires, edges from type wires); system
types render read-only. The state machine is declared flat, in the same
plane as everything else.

**Generic instance services (§13, landed; §3 stored shape):** every type
without an explicit feature service resolves through the registry's service
resolver to a generic per-class instance service. Instance documents are
stored in the §3 shape (`type`, `typeVersion`, `name`, flat `fields`,
`states.main`, `lineage`, `relations`); the block vocabulary
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
(`domain-cnc` entities/workflows/construction) are no longer part of the
process path: the projection does not read them, the palette does not
offer them, and the runtime serves none of them. They remain in the
package only as pack-internal content for non-process surfaces (editors'
own feature modules, the legacy UI fallbacks SPEC §21 holds pack-internal)
until those surfaces are deleted.
