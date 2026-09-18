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
  checking, ref-free detection for services (R5).
- `rows.js` — closed field rows; compiles to JSON Schema 2020-12 with
  `x-quantity`/`x-ref` custom keywords (the substrate for standard
  validators and designer form generation); total instance walker (R1).
- `classes.js` — the five class presets and their obligations (R6).
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
  validation with `typeVersion` ill-typing.
- `compat/domain-projection.js` — the collapse direction: projects a CTS
  registry view back onto the compiler-consumable domain shape. It owns
  `workflows` (states/transitions from declarations, legacy transition
  access and state flags merged for system types), `fieldSchemas` (row
  fields synthesized back to block paths, plus the declared legacy
  remainder for system types), `containment` (children edges with lineage
  keys), `relations`, `entities` (org types appended), `fieldAccess` (org
  types bound to the cts-types feature), `construction` and
  `attachmentKinds` (synthesized for org types, legacy content passed
  through for system types until their facets collapse). System-type
  projection equivalence with the legacy tables is asserted by tests.
- `render.js` — render-policy projection (labels/icons/state severities
  derived from declarations; where hand-mirrored status tables die) and
  `compileClientBundle()`, the single frontend/designer consumption contract.
- `compat/domain-cnc.js` — the strangler converter: maps live
  `@cutkit/domain-cnc` entities, workflows, containment, and attachment
  kinds onto CTS type records (pure mapping, no domain import). Field rows
  are extracted for real (SPEC §15: field schemas promote to the grammar),
  not quarantined: `data`/`specs` paths become row fields (nested paths
  group into `record` rows, unit-qualified numbers become `quantity`,
  entity refs become `ref`, each field keeps its legacy `slot`), workflows
  become states/transitions, containment becomes `children` edges carrying
  the legacy `lineageKey`, relations become `relations` edges, and
  derivation containment (cassette → cassette-design, run → sheet-design,
  design → sheet) becomes child-side relations instead of lineage children.
- `compat/field-schema-rows.js` — the row ⇄ legacy field-schema translation
  used by the converter (extraction) and the domain projection
  (synthesis): block-slot conventions, descriptor typing, nested-path
  grouping.
- `compat/domain-projection.js` — the single CTS → compiler-domain
  translator. See SPEC §15/§19 for what it owns per key.
- `compat/process-checks.js` — declaration checks against a registry view,
  run before the process compiler's graph validation.
- `compat/graph-protocol.js` — the v5 graph protocol (SPEC §20):
  `migrateV4Definition` (one-way persisted rewrite to species kinds, CTS
  type ids, and verified row paths), `resolveCtsDefinition` (compile-time
  lowering back to the executable working shapes through the projected
  domain — internal, never persisted), `checkCtsGraphBindings`
  (declaration-level binding validation). The v4 kind mapping derives from
  `SPECIES_BY_EFFECT_KIND`; the equivalence gate lives in the server
  process-definitions suite.
- `pack/cnc.js` — the CNC starter type pack: the collapse-table acceptance
  fixture (file/item/group/process families, the typed nesting seam, and
  sample instances).
- `index.js` — public exports.

## Consumption

The package is browser-safe by contract (SPEC §13). The process designer
imports the registry directly and consumes the compiler-domain projection
(`projectDomainFromView`) as its only domain source — palette options,
fields, and statuses derive from the organization's type view.
`pages/organization/types.vue` is the declaration-authoring pane fed by
`GET /api/admin/cts/types` (org view: system types + org-authored
declarations stored by `server/features/cts-types`). See
[pages/organization/README.md](../../pages/organization/README.md).

## Validation

`npx vitest run packages/cts` — the acceptance suite covers every static
rule with both passing and failing fixtures, the tenancy resolution, the
diff refusal path, the pack compile, and the source-flip equivalence gate
(`compat/source-flip.spec.js`): for every system type the projected
fieldSchemas, workflows, and containment must equal the legacy tables they
replace. The v5 graph protocol equivalence gate
(`server/features/process-definitions/cts-v5-equivalence.spec.js`) proves
`compile(v4)` and `compile(resolve(migrate(v4)))` behave identically.

## Related

- [SPEC.md](./SPEC.md) — normative type system contract (canonical home).
- [packages/README.md](../README.md) — package map.
- [docs/specs/README.md](../../docs/specs/README.md) — spec index entry.
