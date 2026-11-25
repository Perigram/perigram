# COMPONENT: @perigram/cts

The Perigram Type System: the value universe, type declarations, classes,
edges, states, operators, expressions, versioned diffing, and tenancy that
the process designer authors and the compiler enforces. Pure declarations
and checks — no Vue, Nuxt, Mongo, or worker imports.

Parent: [packages README](../README.md).

The normative contract is [SPEC.md](./SPEC.md). This README maps the
modules onto its sections.

## Modules

- `units.js` — closed unit set, declared conversions, unification (R3,
  SPEC §2/§12).
- `values.js` — the value universe V (SPEC §2): descriptor normalization,
  instance checking, ref-free detection for services (R5), the ref-field
  predicate and accepted-target reader (`isRefDescriptor`,
  `refAcceptsOf`), `durationMs` (the one ISO-8601 duration parser), and
  `FIELD_BASES` — V minus `id`, the single home of the authorable
  field-base list.
- `rows.js` — closed field rows (SPEC §2), compiled to JSON Schema
  2020-12 with `x-quantity`/`x-ref` keywords (the substrate for standard
  validators and designer form generation).
- `classes.js` — the five class presets, their structural obligations,
  and `classMayDeclareChildren` (the SPEC §5 containment predicate
  authoring surfaces gate on); `DECLARABLE_CLASSES` — party is
  framework-only, so every class picker offers the same set.
- `edges.js` — children/relations/provenance declarations with
  `onRemove` integrity (SPEC §6). Relation entries normalize `cardinality`
  to `one | many` (default `many`); child entries carry their storage
  `lineageKey` (authored, else the derived
  `camel(declaringTypeId)+"Id"` — one derivation home, consumed by the
  domain projection, derived indexes, and the UI generator); relation
  entries carry their optional target domain `where` and their optional
  unlink policy `unlink: 'detach' | 'delete'` (absent means `detach`;
  `UNLINK_POLICIES` is the closed vocabulary — the registry check
  covers ref-field entries the same way); lineage
  acyclicity (R2) with recursive self-containment compiling clean.
- `states.js` — the state-vocabulary facet of type declarations:
  normalization (flat values, per-state display policy).
  Class declarations carry the vocabulary and policy; transitions stay
  graph-derived (SPEC §7).
- `operators.js` — the six species with typed signatures and
  event/schedule triggers (SPEC §8); services and projections are
  ref-free.
- `expressions.js` — CEL-semantics expression ASTs (SPEC §15): one
  evaluation engine — a generator walker whose only suspension points are
  collection resolvers — driven by two public entries: `evaluate`
  (bounded synchronous preview; fails closed on a resolver that returns a
  promise) and `evaluateAsync` (authoritative evaluation awaiting
  organization-scoped collection resolvers). Finite
  quantifiers/aggregates, relation/containment resolver hooks, membership
  `in`, and typed predicate/aggregate checks.
- `diff.js` — version stamping, evolution classification, and the
  declared migration gate (R7, SPEC §11). `planTypeMigration(previous,
  next)` is the one planner: diff, normalized steps, coverage verdict.
  A covered plan is what the registry accepts and the server executes
  against instances
  ([cts-types](../../server/features/cts-types/README.md)).
- `payload.js` — the payload-trait acceptance predicate (SPEC §4):
  `payloadAccepts(traits, { mime, size })` plus its `mimeMatches`
  wildcard matcher — one home for "does this type's payload take this
  file", called by the generic construct boundary and the chat
  materialization seam.
- `registry.js` — type records as data, tenancy resolution (system
  first, one org overlay, SPEC §4), `compile()` running R1–R6 (party
  types refused as children targets; relation `where` domains
  type-checked against every declared target, including nested relation/containment traversals), payload normalization to the canonical
  trait shape (including `payload.inputs`, the extra construction inputs
  an upload-backed type prompts beside its file), the SPEC §4
  display-flag laws (exactly one authored
  `identifier` field, at most one `depiction`, a name on every
  type), and the graph-validation pin facet (SPEC §30.3):
  `graphValidation: { graphId, revision, outputId }` names the saved
  graph whose declared boolean output an instance write must satisfy —
  normalized as strings with all three keys required, `graphId` and
  `outputId` compile-checked as stable identifiers, and the graph
  resolving under the acting principal at the
  [instance write boundary](../../server/features/instances/README.md)
  (compile checks shape only). `defineType` gates redefinition per SPEC §11; the free paths
  are zero live instances (synchronous `hasInstances` probe) and repair
  of a stored declaration that violates class obligations or declares
  unresolvable children. Declarations may carry `projections` (extract
  gates); each entry declares `{ id, label?, output, resolve }` with exactly
  one of `field`, `handler`, or plugin `service` resolve. Org-authored
  declarations persist their projections beside fields and edges.
Authored instance-scoped `constraints` compile against the composed typed
view; `validateConstraints` evaluates them with asynchronous collection
resolvers. The generic instance service enforces declared constraints on
generic creation, constrained field updates, and re-derive; the state-machine
adapter delegates flat CTS transition candidates to that same validator.
- `render.js` — display-policy derivation and `compileClientBundle()`,
  the single frontend/designer consumption contract. Naming is authored
  vocabulary (SPEC §4); everything else derives — `glyph`, `depiction`,
  `previewSource` (the declared data-field preview channel with ordered
  stored-shape fallbacks), per-state display policy, and the derived
  `sections` grouping (total assignment by field base, fixed section
  order, only non-empty sections). Fact-row surfaces consume it through
  [utils/instance-display-contract.js](../../utils/README.md); the UI
  mapping resolvers consume the same record
  ([shared/ui-mapping](../../shared/ui-mapping/README.md)).
- `projection.js` — the CTS → compiler-domain translator
  (SPEC §13), synthesis-only: every authorable type in the view
  synthesizes its entities entry (per-class collection, §13),
  `fieldSchemas` (the §3 stored shape plus row fields as flat
  `fields.*` paths and relations as `relations.*` — ref and list-of-ref
  fields join explicit edges with their declared `one`/`many`
  cardinality; lineage schemas carry the full ancestor chain,
  read-model vocabulary for filters and access facts), `fieldAccess`,
  `containment`, `construction` (`genericCreate` plus declared
  construct operators as `via` modes with signature-derived mode
  inputs; payload protocols add the file input plus the type's declared
  `payload.inputs`; ref fields marked `constructible: false` stay out of
  every create form; construction lineage inputs address immediate parent
  axes — the ancestor chain derives at the instance construct seam;
  relation inputs are one entity ref for `cardinality: 'one'` edges and a
  type list for many, labelled by the target type's name),
  `relations`, and `attachmentKinds`. Party types project as readable
  principals
  (SPEC §13). The base domain contributes operator contracts, the
  framework block vocabulary, and pack service registrations only
  (SPEC §13). Owns the per-class collection map (`CLASS_COLLECTIONS`)
  shared with the instance repository.
- `field-schema-rows.js` — the row ⇄ field-schema translation
  the domain projection synthesizes through: row fields mint flat
  `fields.*` paths (SPEC §13), nested-path
  grouping; leaf types derive through the process adapter
  (`ctsFieldToLegacyType`).
- `process-grammar.js` — the one CTS ⇄ process adapter (SPEC §2 grammar
  relation): `ctsFieldToProcessType` maps declaration descriptors onto
  process socket types; `ctsFieldToLegacyType` maps them onto legacy
  field-schema types; `ctsFieldToConstructionInput` and
  `legacyTypeToConstructionInput` derive construction input kinds from
  descriptors and legacy types; `CTS_UNIT_TO_LEGACY` is the one
  unit-spelling table. Consumed by `packages/processes` (designer, node
  catalog) and the in-package projection and field-schema synthesis.
- `process-checks.js` — declaration checks against a registry
  view, run before the process compiler's graph validation: transition
  guards and state `fieldPolicy` lists row-checked against the bound
  type (SPEC §7), with type bindings read positionally so vocabulary
  strings and canvas card kinds are never misread as type references.
- `graph-protocol.js` — the species graph protocol (SPEC §14):
  `resolveCtsDefinition` resolves declaration ids and row paths while
  preserving species kinds, discriminators, socket ids, and graph
  edges; `checkCtsGraphBindings` validates type, field, state,
  transition, operator, and edge bindings (an executable
  `cts.transition` must carry an authored target — refused at draft
  acceptance and activation); `declarationsFromCtsRecords` receives
  the declaration graph beside records, so nested state and edge
  acceptance match what APPLY posts (children wires land child-first);
  `rowFieldId` mints an authored name's row key — latin letter/digit
  segments in lowerCamelCase, else a stable digest of the name — the one
  row-key derivation home, shared by the class editor's initial field id,
  the designer's field wires, and migration vocabulary;
  `operationKindOf` answers the record's own kind;
  `rewriteRetiredWirePaths`, `orientChildrenEdgesChildFirst`, and
  `retireStateScopeAuthoring` (the state-scope strip: state→class
  `declares` wires and the state `typeId`/`initial`/`terminal` fields)
  are the one-way seam rewrites for persisted drafts (SPEC §14 resolution
  and migration); `renameLegacyTypeKeys` is the pure key rewriter for
  the one-shot persisted-data migration script.
- `pack/cnc.js` — the CNC starter type pack: the collapse-table
  acceptance fixture (file/item/group/process families, edges, operators,
  triggers, payload traits).
- `pack/page.js` — `pageTypeDeclaration`/`PAGE_TYPE_ID`: the default Page
  class seeded as an organization type by the pages feature.
- `pack/framework.js` — `frameworkTypes`: the framework's own type
  declarations, exported from the index. The `graph-document` type saves
  under `GRAPH_DOCUMENT_EXTENSION` (`.perigram-graph`) with a JSON mime and
  a `graph` payload preview. Its `graphId` field is stored with
  `display: 'hidden'`.
- `index.js` — public exports.

## Consumption

The package is browser-safe. The process designer imports the registry
directly and consumes the compiler-domain projection
(`projectDomainFromView`) as its only domain source — palette options,
fields, and statuses derive from the organization's type view. The
designer shell separates declaration authoring from executable process
composition: Class/Field/State/Transition/Operator nodes compile through
`compileTreeDeclarations`, while process nodes reference those
declarations. The org view (`GET /api/admin/cts/types`, org declarations
stored by [cts-types](../../server/features/cts-types/README.md)) feeds
the designer through `composables/useProcessDesignerTypes.js`
([pages/organization](../../pages/organization/README.md)).

## Validation

`npx vitest run packages/cts` — the acceptance suite covers every
static rule with passing and failing fixtures, tenancy resolution, the
diff refusal path, the pack compile, the synthesis projection
(`projection.spec.js`), and the graph-protocol acceptance
gate (resolution preserves species kinds, typed ports, and executable
behavior through compilation).

## Related

- [SPEC.md](./SPEC.md) — normative type system contract (canonical home).
- [packages/processes](../processes/README.md) — the compiler that
  consumes the projection and graph protocol.
- [packages/README.md](../README.md) — package map.
