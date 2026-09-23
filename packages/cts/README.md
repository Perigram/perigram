# COMPONENT: @perigram/cts

The Perigram Type System: the value universe, type declarations, classes,
edges, states, operators, expressions, versioned diffing, and tenancy that
the process designer authors and the compiler enforces. Pure declarations
and checks — no Vue, Nuxt, Mongo, or worker imports.

The normative contract is [SPEC.md](./SPEC.md). This README describes the
module layout and how the code maps to the spec's build-order tiers.

## Modules

- `units.js` — closed unit set, declared conversions, unification (R3).
- `values.js` — the value universe V: descriptor normalization, instance
  checking, ref-free detection for services (R5). Owns the authorable
  field-base list (`FIELD_BASES` — V minus `id`; single home for every
  field editor).
- `rows.js` — closed field rows; compiles to JSON Schema 2020-12 with
  `x-quantity`/`x-ref` custom keywords (the substrate for standard
  validators and designer form generation); total instance walker (R1).
- `classes.js` — the five class presets, their structural obligations, and
  `classMayDeclareChildren` — the SPEC §5 containment predicate authoring
  surfaces gate on (file/party classes never declare lineage children) so
  wire legality and type-compile obligations share one home
  (R6; classes constrain declarations, never content), plus
  `DECLARABLE_CLASSES` (party is framework-only — what org authoring and
  every class picker offer).
- `edges.js` — children/relations/provenance declarations with
  `onRemove` integrity; children entries carry their storage `lineageKey`
  (authored, else the derived `camel(declaringTypeId)+"Id"` fallback — one
  derivation home, consumed by the domain projection, derived indexes, and
  the UI generator); lineage acyclicity (R2).
- `states.js` — single-axis states, guarded transitions, unique intents,
  terminal reachability (R4); `mergeTransitionNodeStates` merges
  transition-node-declared target statuses into a tree-declared axis
  (values union, fan-out edges from every other value, sinks ∪ explicit
  terminals — the shared core of `compileTreeDeclarations` and
  `declarationsFromCtsRecords`).
- `operators.js` — the six species with typed signatures, event/schedule
  triggers; services and projections are ref-free.
- `expressions.js` — CEL-semantics expression ASTs: total evaluation with a
  step budget, `map`/`filter` comprehensions, compile-checked exhaustive
  `match` (§18).
- `diff.js` — version stamping, evolution classification, and the declared
  migration gate (R7, SPEC §11). The classification is complete over the
  row, the single-axis state enum, and children edges: additive changes
  (`add-nullable-field`, `loosen-field`, `add-state`, `add-edge`) are
  minor, while `remove-field`/`retype-field`/`add-required-field`/
  `remove-state`/`remove-edge` are breaking. Rename intent is not inferred
  from the diff — a rename is a declared migration step, so the diff
  reports the underlying remove/add pair and the declaration carries the
  mapping. The declaration's `migrate` steps are the executable half of
  SPEC §11: `{ kind: 'rename-enum-value', axis: 'main', from, to }` (the
  `to` value must exist in the next state enum), `{ kind: 'rename-field',
  from, to }`, `{ kind: 'add-default-field', field, value }`,
  `{ kind: 'remove-field', field }`, and `{ kind: 'retype-field', field,
  via }` where `via` is a CEL expression AST evaluated per instance over
  `{ value }`. `planTypeMigration(previous, next)` is the one planner: it
  returns the diff, the normalized steps, and the coverage verdict —
  every breaking change must be covered by a declared step (rename-field
  covers its remove/add pair when the descriptors match;
  remove-edge is coverable by nothing and stays refused), and every
  declared step must match a breaking change, so stale steps fail the
  gate instead of rotting on the declaration. A covered plan is what the
  registry accepts and the server executes against instances (see
  [cts-types](../../server/features/cts-types/README.md)); an uncovered
  breaking change on a type with persisted instances remains the R7
  refusal. Redefinition is
  free for empty types (instance probe reports zero rows) and for repairs:
  a stored declaration that itself violates class obligations or declares
  unresolvable children never compiled as a contract, so the diff does not
  protect it.
- `registry.js` — type records as data, tenancy resolution (system first,
  one org overlay, no shadowing), `compile()` running R1–R6, instance
  validation with `typeVersion` ill-typing. Payload declarations normalize
  to the canonical trait shape (`mime` list, `accept`, `maxSize`,
  `preview`, `creation` protocol list — `upload | capture | editor`,
  defaulting to `upload`); a bare MIME string and a `byteLimit` key
  (legacy persisted docs and older pack fixtures) normalize at the
  boundary. The same boundary adopts the retired `render` facet
  (SPEC §4 migration): `render.label`→`name`, `render.icon`→`glyph`,
  `render.identityField`→the field's `identifier` flag,
  `render.states`→the axis `render` home; system types without a carrier
  adopt `startCase(id)`, org-stored ones keep `name: null` ("Unnamed").
  Compile also enforces the display-flag laws: exactly one `identifier`
  field (when none is flagged, normalization mints the first declared
  string field — once, frozen; explicit flags deviate; no string field at
  all is the compile error "mark the field that names its records"), at
  most one `depiction` field, and a name on every system type.
- `compat/domain-projection.js` — the single CTS → compiler-domain
  translator, synthesis-only: every type in the view (framework, pack,
  org) synthesizes its entities entry (per-class collection, §13),
  `workflows` (declared states/transitions with render policy — derived
  by the exported `declarationWorkflow(type)`, the one declaration→v2
  machine seam the server's status resolution reuses), 
  `fieldSchemas` (core-slot convention + rows), `fieldAccess` (bound to
  the cts-types feature), `containment` (children edges with lineage
  keys), `construction` (`genericCreate` + declared construct operators
  as `via` modes with signature-derived `modeInputs`), `relations`
  (declared edges), and `attachmentKinds` (payload traits). Nothing
  passes through from the base domain: legacy entity/workflow/
  construction/field-schema/access/relation/containment/attachment-kind
  content supplied on `baseDomain` is ignored; the base contributes
  operator contracts (commands/tasks/hooks), the framework block
  vocabulary, and pack service registrations only. Owns the per-class
  collection map (`CLASS_COLLECTIONS`) shared with the instance
  repository.
- `render.js` — display-policy derivation and `compileClientBundle()`,
  the single frontend/designer consumption contract (this is where
  hand-mirrored status tables die). Naming is authored vocabulary
  (`name`, `glyph`, field `label`s — SPEC §4); everything else derives.
  The bundle type record carries `name` (null → consumers render
  "Unnamed"), `glyph` (declaration override || class default),
  `identifier` (the resolved flag field id, or null), `depiction:
  { glyph, thumb }` (thumb = the depiction flag field id or null),
  `fields` (descriptors including the normalized naming facet), and
  `sections` — the derived grouping that replaces authored groups: total
  assignment by base (`quantity`→dimensions, `ref`→relations, `blob` or
  the depiction flag→media, multiline/long strings→notes, else summary;
  `list`/`map` by item base), section order summary/dimensions/media/
  relations/notes, declared row order within a section, only non-empty
  sections emitted as `{ id, label: null, fields: [fieldId] }`. No
  authored override channel exists — deviations are not render concerns.
  Per-state display policy resolves onto the state axes
  (`states.<axis>.render[value]`: label default startCase — state values
  are authored vocabulary — severity terminal→secondary else `info`,
  icon null). The `render` key exists on neither declarations nor the
  bundle; fact-row surfaces consume the derived sections through
  [utils/instance-display-contract.js](../../utils/README.md), and the
  UI mapping resolvers consume the same record (see
  [shared/ui-mapping](../../shared/ui-mapping/README.md)).
- `compat/domain-cnc.js` — DELETED (the strangler converter). The
  equivalence phase is over: the projection synthesizes from declarations
  only and legacy tables are not converted, projected, or served.
- `compat/field-schema-rows.js` — the row ⇄ field-schema translation the
  domain projection synthesizes through: block-slot conventions,
  descriptor typing, nested-path grouping.
- `compat/process-checks.js` — declaration checks against a registry view,
  run before the process compiler's graph validation. It reads semantic
  records only, and type bindings positionally (`typeId`, species
  `typeId`, legacy species `type`): process-vocabulary descriptor strings
  and canvas card kinds are never misread as type references.
- `compat/domain-projection.js` — the single CTS → compiler-domain
  translator. See SPEC §15/§19 for what it owns per key.
- `compat/graph-protocol.js` — the v5 graph protocol (SPEC §20):
  `migrateV4Definition` (one-way persisted rewrite to species kinds, CTS
  type ids, and verified row paths), `resolveCtsDefinition` (compile-time
  lowering back to the executable working shapes through the projected
  domain — internal, never persisted), `checkCtsGraphBindings`
  (declaration-level binding validation), `operationKindOf` /
  `resolveCtsRecord` (the single-record seam the designer and node catalog
  route kind matching and port resolution through), and
  `declarationsFromCtsRecords` (persisted `ctsTypes` draft records back
  into declaration objects, so acceptance gates can validate a draft
  against its own in-tree declarations before APPLY posts them). The v4
  kind mapping
  derives from `SPECIES_BY_EFFECT_KIND`; equivalence gates live in the
  server process-definitions suite and the processes designer round-trip
  spec.
- `pack/cnc.js` — the CNC starter type pack: the collapse-table acceptance
  fixture (file/item/group/process families, the typed nesting seam, and
  sample instances).
- `index.js` — public exports.

## Consumption

The package is browser-safe by contract (SPEC §13). The process designer
imports the registry directly and consumes the compiler-domain projection
(`projectDomainFromView`) as its only domain source — palette options,
fields, and statuses derive from the organization's type view. The
designer tree is also the declaration-authoring surface (Class/Field/State
nodes; compiled by `compileTreeDeclarations` from
`@perigram/processes`); `pages/organization/types.vue` is the read-only
registry browser fed by `GET /api/admin/cts/types` (org view: system types
+ org-authored declarations stored by `server/features/cts-types`). See
[pages/organization/README.md](../../pages/organization/README.md).

## Validation

`npx vitest run packages/cts` — the acceptance suite covers every static
rule with both passing and failing fixtures, the tenancy resolution, the
diff refusal path, the pack compile, and the synthesis projection
(`compat/domain-projection.spec.js`: per-class collections, declared
workflows/construction/containment, tenancy). The v5 graph protocol
equivalence gate
(`server/features/process-definitions/cts-v5-equivalence.spec.js`) proves
`compile(v4)` and `compile(resolve(migrate(v4)))` behave identically. The
legacy source-flip equivalence gate was deleted with the converter:
there is no legacy source left to be equivalent to.

## Related

- [SPEC.md](./SPEC.md) — normative type system contract (canonical home).
- [packages/README.md](../README.md) — package map.
- [docs/specs/README.md](../../docs/specs/README.md) — spec index entry.
