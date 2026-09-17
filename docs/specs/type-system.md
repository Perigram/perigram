# SPEC: CutKit Type System (CTS)

Status: proposed target model. Nothing in here is a runtime module yet. It is
the collapse point of the current constructs spread across
`packages/core` (canonical blocks), `packages/domain-cnc` (entities,
workflows, kinds, field schemas), and `packages/processes` (compiler checks):
same semantics, one declaration language, every hand-mirrored list derived.

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

"Not in the row" means "does not exist": selectable field lists, predicate
paths, patch paths, and card fields are all derived from the row. No list is
hand-mirrored anywhere (this deletes `field-access.js` duplication,
`cncStatusUi`, alias tables, ghost keys in one stroke).

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

Purity means exactly: no entity writes, no hidden reads. Determinism is NOT
required — services version and drift. Therefore every `k`/`s` result records
its effective inputs (`provenance.effective`: params + versions of every
input). The current `machineSnapshot`/`toolSnapshot`/algorithm-revision field
habit on sheets becomes provenance semantics instead of per-entity cargo.

Composition: process graphs are compositions of `p/s/k/c/m` with dataflow
typing. The compiler's existing socket/packet checking and missing-field
diagnostics are this calculus; CTS finishes them.

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
| R4 | state totality: transitions within axis enum; one initial; reachable terminal; intents unique per type | workflow validators |
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
| grammar + validator | — | `packages/core` (promoted `field-schemas` base/shape/itemType) |
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
| `workflows.js`, intents, `workflow_overrides` | states/transitions in type defs; intents on operator outputs |
| `cncStatusUi`, icons, labels | render policy on enum values |
| `attachment-kinds.js` | payload traits + construct affiliations |
| `producers.js`, `artifact-conversions.js` | construct/conversion operator registry |
| `field-schemas.js` base/shape/itemType/unit | V (promoted to the real grammar) |
| `field-access.js`, `roleGrants` | policy facet |
| `summaries.js` | per-edge aggregates |
| `revisions.js` | revision facet |
| commands/tasks/effects runtime | operator runtime (machinery unchanged, signatures added) |
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
  payload application/cutkit+occs
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
typed `V -> V` signatures. Four completions follow from this principle:

1. **`match`** — the elimination form for variants:

   ```
   match e { tag1(x) -> expr1, tag2(y) -> expr2, ... }
   ```

   Total and exhaustiveness-checked: a missing tag is a static error, not a
   runtime fallthrough. Arms are expressions over V; guards may not recurse.

2. **`map` / `filter`** — bounded structural iteration over typed lists
   (`(A -> B) -> [A] -> [B]`, `(A -> Boolean) -> [A] -> [A]`). Terminating
   because the input is finite; this is the sanctioned "for each job item"
   form. General loops, `while`, and recursion do not exist; iteration over
   unbounded data belongs to `s`.

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
