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
  terminal reachability (R4).
- `operators.js` — the six species with typed signatures, event/schedule
  triggers; services and projections are ref-free.
- `expressions.js` — CEL-semantics expression ASTs: total evaluation with a
  step budget, `map`/`filter` comprehensions, compile-checked exhaustive
  `match` (§18).
- `diff.js` — version stamping and refuse-on-breaking-diff (R7 core tier);
  the classification is complete over the row, the single-axis state enum,
  and children edges: additive changes (`add-nullable-field`,
  `loosen-field`, `add-state`, `add-edge`) are minor, while
  `remove-field`/`retype-field`/`add-required-field`/`remove-state`/
  `remove-edge` are breaking. Rename intent is not inferred from the diff —
  a rename is a declared migration step, so the diff reports the underlying
  remove/add pair and the declaration carries the mapping. Declarative
  migration steps are deferred per SPEC §19: a breaking diff on a type
  with persisted instances is still refused. Redefinition is
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
  boundary.
- `compat/domain-projection.js` — the single CTS → compiler-domain
  translator, synthesis-only: every type in the view (framework, pack,
  org) synthesizes its entities entry (per-class collection, §13),
  `workflows` (declared states/transitions with render policy), 
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
- `render.js` — render-policy projection (labels/icons/state severities
  derived from declarations; where hand-mirrored status tables die) and
  `compileClientBundle()`, the single frontend/designer consumption
  contract. The projection compiles label/icon/preview/state policy and
  passes the authored UI vocabulary through verbatim — `identityField`,
  field `groups`, `listLayout`, and `sortKey` — so the client bundle is
  the one input the UI mapping resolvers need (see
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
`@cutkit/processes`); `pages/organization/types.vue` is the read-only
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
