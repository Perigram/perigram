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
- `classes.js` — the five class presets and their obligations (R6), plus
  `DECLARABLE_CLASSES` (party is framework-only — what org authoring and
  every class picker offer).
- `edges.js` — children/relations/provenance declarations with
  `onRemove` integrity; lineage acyclicity (R2).
- `states.js` — single-axis states, guarded transitions, unique intents,
  terminal reachability (R4).
- `operators.js` — the six species with typed signatures, event/schedule
  triggers; services and projections are ref-free.
- `expressions.js` — CEL-semantics expression ASTs: total evaluation with a
  step budget, `map`/`filter` comprehensions, compile-checked exhaustive
  `match` (§18).
- `diff.js` — version stamping and refuse-on-breaking-diff (R7 core tier);
  declarative migration steps are deferred per SPEC §19.
- `registry.js` — type records as data, tenancy resolution (system first,
  one org overlay, no shadowing), `compile()` running R1–R6, instance
  validation with `typeVersion` ill-typing. Payload declarations normalize
  to the canonical trait shape (`mime` list, `accept`, `maxSize`,
  `preview`); a bare MIME string (legacy persisted docs) normalizes at the
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
  `compileClientBundle()`, the single frontend/designer consumption contract.
- `compat/domain-cnc.js` — DELETED (the strangler converter). The
  equivalence phase is over: the projection synthesizes from declarations
  only and legacy tables are not converted, projected, or served.
- `compat/field-schema-rows.js` — the row ⇄ field-schema translation the
  domain projection synthesizes through: block-slot conventions,
  descriptor typing, nested-path grouping.
- `compat/process-checks.js` — declaration checks against a registry view,
  run before the process compiler's graph validation.
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
