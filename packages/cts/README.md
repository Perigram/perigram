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
- `render.js` — render-policy projection (labels/icons/state severities
  derived from declarations; where hand-mirrored status tables die) and
  `compileClientBundle()`, the single frontend/designer consumption contract.
- `compat/domain-cnc.js` — the strangler converter: maps live
  `@cutkit/domain-cnc` entities, workflows, containment, and attachment
  kinds onto CTS type records (pure mapping, no domain import). Legacy
  `data.*` payloads land as quarantined `legacy`/`specs` Json fields until
  per-type field extraction; derivation containment edges (cassette →
  cassette-design, run → sheet-design, design → sheet) become child-side
  relations instead of lineage children.
- `pack/cnc.js` — the CNC starter type pack: the collapse-table acceptance
  fixture (file/item/group/process families, the typed nesting seam, and
  sample instances).
- `index.js` — public exports.

## Consumption

The package is browser-safe by contract (SPEC §13): the process designer
imports it directly — `LanguageTesterPanel.vue` evaluates expressions and
validates instances client-side with no endpoint, and
`pages/organization/types.vue` renders the types pane fed by
`GET /api/admin/cts/types` (org view: system types + org-authored
declarations stored by `server/features/cts-types`). See
[pages/organization/README.md](../../pages/organization/README.md).

## Validation

`npx vitest run packages/cts` — the acceptance suite covers every static
rule with both passing and failing fixtures, the tenancy resolution, the
diff refusal path, and the pack compile.

## Related

- [SPEC.md](./SPEC.md) — normative type system contract (canonical home).
- [packages/README.md](../README.md) — package map.
- [docs/specs/README.md](../../docs/specs/README.md) — spec index entry.
