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
  checking, ref-free detection for services (R5), and `durationMs`, the
  one ISO-8601 duration parser (deadline facets, duration arithmetic,
  scans). Owns the authorable
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
- `states.js` — the state-vocabulary facet of declarations: vocabulary
  normalization (flat values, terminal flags, per-state display policy)
  and its readers. Machines themselves are graph-derived (SPEC §7):
  `compileTreeDeclarations` in `packages/processes/src/designer.js`
  builds the recursive trees, and transition guards are authored on
  `cts.transition` records (see SPEC §7).
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
- `payload.js` — the payload-trait acceptance predicate (SPEC §4):
  `payloadAccepts(traits, { mime, size })` plus its `mimeMatches` wildcard
  matcher, tolerating the raw single-string `mime` shape beside the
  normalized list. One home for "does this type's payload take this file" —
  the generic construct boundary and the chat materialization seam both call
  it instead of restating the rule.
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
  `fields` (descriptors including the normalized naming facet),
  `previewSource` (`{ path, display, fallbackPaths? }` adopted from the
  authored `render.groups` row flagged `previewSource` — the declared
  data-field preview channel, or null; `fallbackPaths` are stored-shape
  fallbacks the preview channel walks in order, the same vocabulary
  `DataBlock` rows use, so a type whose renderable source exists in
  several stored shapes previews whichever the record carries), and
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
- `compat/domain-cnc.js` — DELETED (the strangler converter; the legacy domain package itself is deleted too). The
  equivalence phase is over: the projection synthesizes from declarations
  only and legacy tables are not converted, projected, or served.
- `compat/field-schema-rows.js` — the row ⇄ field-schema translation the
  domain projection synthesizes through: block-slot conventions,
  descriptor typing, nested-path grouping.
- `compat/process-checks.js` — declaration checks against a registry view,
  run before the process compiler's graph validation. It reads semantic
  records only, and type bindings positionally (`typeId`, species
  `typeId`, legacy species `type`): process-vocabulary descriptor strings
  and canvas card kinds are never misread as type references. Transition
  guards are checked here (SPEC §7): boolean expression ASTs only, field
  paths rooted at `value` and row-checked. State deadlines are checked
  here too: `after` parses as an ISO-8601 duration, `to` names another
  declared state of the type's vocabulary, and the deadline guard follows
  the guard contract.
- `compat/domain-projection.js` — the single CTS → compiler-domain
  translator. See SPEC §15/§19 for what it owns per key.
- `compat/graph-protocol.js` — the native species graph protocol (SPEC §20):
  `resolveCtsDefinition` resolves declaration ids and row paths while
  preserving species kinds, discriminators, socket ids, and graph edges;
  `checkCtsGraphBindings` validates type, field, state, transition,
  operator, and edge bindings; an executable `cts.transition` must carry an
  authored target (inspector state reference, authored default, or a wire
  into its status socket) — a target-less transition is refused at draft
  acceptance and activation instead of failing at run time. `operationKindOf`
  answers the record's own kind — classification never translates between
  vocabularies (the v4 twin table is gone with the retired kinds).
  `declarationsFromCtsRecords` receives the declaration graph as well as
  records, so nested state and edge acceptance matches what APPLY posts.
  Authored definitions speak the current species vocabulary only: there is
  no v4 rewrite at any seam and no runtime fallback vocabulary.
  `renameLegacyTypeKeys` remains a pure key rewriter exported for the
  one-shot persisted-data migration script, never invoked at load.
- `pack/cnc.js` — the CNC starter type pack: the collapse-table acceptance
  fixture (file/item/group/process families, the typed nesting seam, and
  sample instances).
- `index.js` — public exports.

## Consumption

The package is browser-safe by contract (SPEC §13). The process designer
imports the registry directly and consumes the compiler-domain projection
(`projectDomainFromView`) as its only domain source — palette options,
fields, and statuses derive from the organization's type view. The
designer shell separates declaration authoring from executable process
composition: Class/Field/State/Transition/Operator nodes compile through
`compileTreeDeclarations`, while process nodes reference those declarations
without rewriting them. `pages/organization/types.vue` is the read-only
registry browser fed by `GET /api/admin/cts/types` (org view: system types
+ org-authored declarations stored by `server/features/cts-types`). See
[pages/organization/README.md](../../pages/organization/README.md).

## Validation

`npx vitest run packages/cts` — the acceptance suite covers every static
rule with both passing and failing fixtures, the tenancy resolution, the
diff refusal path, the pack compile, and the synthesis projection
(`compat/domain-projection.spec.js`: per-class collections, declared
workflows/construction/containment, tenancy). The graph-protocol acceptance
gate proves resolution preserves current species kinds, typed ports, and
executable behavior through compilation. The retired source-flip
converter has no runtime path.

## Related

- [SPEC.md](./SPEC.md) — normative type system contract (canonical home).
- [packages/README.md](../README.md) — package map.
- [docs/specs/README.md](../../docs/specs/README.md) — spec index entry.
