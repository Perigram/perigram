```yaml
doc_id: SHARED-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-25
```

# SPEC: Shared Contracts

The cross-runtime contract plane: pure data and pure functions consumed by
browser Nuxt code, server features, worker executors, and plain Node
scripts. Every contract has exactly one home here; every consumer — Vue
materializations, stores, server transports — links it.

Parents: [README.md](../README.md) · [SPEC.md](../SPEC.md) ·
[shared/README.md](./README.md)

## Contracts owned here

### Portability

Modules import package-resolved paths (`#shared/…`, `#packages/…`) or
sibling relatives, so every runtime resolves them; alias rules live in
[scripts/README.md](../scripts/README.md).

### Generative UI — [ui-mapping](./ui-mapping/README.md)

The canonical home of presentation-resolution law (root
[SPEC.md](../SPEC.md) §22 states the system-level arrangement law; the
arrangement foundations — trait records, decision procedure, placement
slots — are specified in [ui-mapping/SPEC.md](./ui-mapping/SPEC.md); this
module is the engine):

| Contract | Law |
|---|---|
| Resolution | Each resolver walks one flat entry list (`{ match, …outcome }`); the most specific match wins — specificity is matched-key count, ties break by table order — and a terminal `{ match: {} }` entry makes resolution total and deterministic. `createUiMapping(overrides)` splices app overrides ahead of the defaults; narrow override matchers (`type`, `preview`, `actionKind`) are the only extension seam. |
| Variants | `full`/`detail` (editor family) and `row`/`inline` (display family); the container picks the child's variant. |
| Fields | `resolveFieldControl(descriptor, { variant })` → `{ component, span, props }`; an authored `control` pins edit variants; display variants stay shape-derived projections. |
| Titles | `titleFor(record, typeView, { unnamedLabel })`: the `identifier`-flagged field value, else the localized unnamed placeholder. The identifier value renders once per surface — record title, card title, or table identity column — and fact strips exclude it (`isIdentifierField`). |
| List layouts | `table`, `card-grid`, `carousel`, `timeline`, `stats`, `list`, `board`, `gantt`, `calendar`, derived from `analyzeTypeShape`: two instants are durational (gantt), a lone instant schedules (calendar), a stateful vocabulary spanning `BOARD_MIN_COLUMNS` values earns the board (boardable signal at one-key specificity). A class's list surface is flat; containment is navigation. |
| Budgets | Every materialization limit is a named constant: `TABLE_COLUMN_SCALE`, `CARD_FACT_SCALE`, `TABLE_PAGINATE_AT`, `TABLE_PAGE_ROWS`, `TABLE_VIRTUALIZE_AT`, `SEARCH_AT`, `CHIP_BUDGET`, `ROW_RELATION_BUDGET`, `ROW_FIELD_BUDGET`, `CHILDREN_TABS_AT`, `SUMMARY_BUDGET`, `SCALAR_BASES`. `LAYOUT` is the only layout-class vocabulary. |
| Arrangement | Siblings share the surface by estimated rendered weight (`estimateRegionWeight` over data, DOM-free): stack-mode children at or under `SIDE_MAX_WEIGHT` ride the side rail, peers up to `COLUMN_MAX_WEIGHT` share proportional columns, a sibling holding `DOMINANT_CHILD_SHARE` keeps the flow, heavier sets tab in descending weight order — tabs sit at any tree level, and a set inside a tab arrangement stacks (root SPEC §22.1). A child collection with zero loaded instances is layout-inert (`stubRegions`). |
| Traits | Data traits (weight, breadth, volume, shape family, filledness, growth) derive compose-time on every composed node; container traits (width step, height boundedness, scroll ownership, density) resolve at the materialization seam. Arrangement is a total function over data × container traits (root [SPEC.md](../SPEC.md) §22.7; design in [ui-mapping/SPEC.md](./ui-mapping/SPEC.md)). |
| State vocabulary | `statePolicyByType`, `stateFieldPolicyByType`, `stateTransitionsByType` derive from the hydration payload's compiled producer workflows — the one client-side derivation; first authored entry wins. `stateDisplayFor`: exact value → leaf segment → neutral raw chip outside the served vocabulary; a type without vocabulary resolves `null`. |
| List controls | `resolveListControls(type, instances)`: `searchKeys` is the identifier field alone, `sortKeys` the filled short scalars (identifier excepted), `facets` the enum values present, `pagination` from the table budgets. `instanceMatchesToolbar` composes search and facet selection into the [instance-filters](./instance-filters/README.md) tree and evaluates the one matcher. |
| Data states | Region `dataState` is the source-reported `loading`/`ready`/`empty`/`denied`/`error`, else pool-derived (`empty` list, `missing` single, `ready`); a reported `ready` leaves a pool-derived `missing` in place. |
| Chrome | Roles `canvas`/`section`/`card`/`control`/`inline` resolve to surface/padding/border tokens; same-role nesting flattens to padding plus a divider. |
| Previews | `RENDERABLE_PREVIEW_MODES` = `dxf, svg, sketch, image, pdf, docx, table, workbook, text`; app viewers import the list; every other mode degrades to a payload download. |
| Actions | `resolveActionButton` is a fixed presentation table (transition actions carry the target state's resolved display); `planActionLaunch` → `link`/`dialog`/`confirm`/`run`; `resolveInstanceActions` selects per-instance quick actions (manual transitions, delete, instance-scoped commands). |
| Labels | `typeLabelKey`/`fieldLabelKey`/`actionLabelKey` derive stable i18n keys; `localizedLabel` falls back to the resolver label. |
| Composition | `composeScreen` projects one compiled screen contract into a frozen pure region tree. `single` sources resolve `scope.instanceId` exactly; `list` sources scope by relation, lineage, or the compiler's flat `$screen.*` filter map (normalized through instance-filters). Regions with `slot: 'children'` nest under every top-level region; an unscoped list of a child-capable type composes the containment cross-cut (`childrenOfParent`, `incomingChildrenEdges`). |

### Instance filters — [instance-filters](./instance-filters/README.md)

The one filter vocabulary. Tree nodes: `{ and }`, `{ or }`, `{ not }`, and
`{ field, op, value }` predicates over the closed operator set
`eq, in, contains, gt, gte, lt, lte`. Addresses read the screen instance
shape: `_id`/`id`, `states.main`, `lineage.<key>`, one-hop existential
traversals `relations.<key>.<field>`, `lineage.<key>.<field>`,
`children.<type>.<field>`; any other name reads `fields.<name>`
(quantities by `.value`). `normalizeFilter` is total: empty combinators
collapse, malformed predicates drop as no-ops, the result freezes. The
flat transport map is a projection of the tree behind the declared
`lineageKeys` gate; the builder edits a one-combinator projection that
round-trips. Mongo translation belongs to
[server/features/instances](../server/features/instances/README.md).

### Field access

- `fieldAccessPolicies` ([field-access-policies.js](./field-access-policies.js)) maps framework types to a feature key and `read`/`write`/`admin` path sets.
- Declared types carry per-type policies registered through the registry seam (`registerDeclarationFieldAccess`, [stores/README.md](../stores/README.md)).
- [instance-field-access.js](./instance-field-access.js) decides which DTO paths display: `canDisplayEntityField`/`filterEntityFields` apply the policy level plus the active state's field policy (`stateFieldPolicies`), redacting array subfields per item.

### Access control

[access-control.js](./access-control.js) is the one grant evaluator:
feature keys × levels `none`/`read`/`write`/`admin`; scopes over lineage
ids, entity id, and transitions; additive `rule` gates (`all`/`any`/`not`
over `exists`, `equals`, `notEquals`, `in`, `includes`, `atLeast`).
Relation grants are explicit per feature.
[permission-templates.js](./permission-templates.js) presets expand into
copied grants at assignment; runtime checks read the copied grants.

### Plugin surfaces

[plugin-surfaces.js](./plugin-surfaces.js) pins the surface mount contract
versions the platform can mount; the server install/upgrade gates and the
client loader read the same set.

### Support contracts

[markdown.js](./markdown.js) (GFM with hard breaks, mermaid fences → pele
SVG, window-guarded rendering), [icon-fonts.js](./icon-fonts.js)
(generated beside the CSS contract, spec-guarded),
[role-access-summary.js](./role-access-summary.js),
[assignment-access-preview.js](./assignment-access-preview.js),
[public-entities.js](./public-entities.js),
[relation-domain.js](./relation-domain.js),
[instance-tokens.js](./instance-tokens.js), `assistant-mention.js`,
`types/`.

## Structure

| Path | Homes |
|---|---|
| `ui-mapping/` | resolver tables, budgets, arrangement, screen composition, state derivation (target: [ui-mapping/SPEC.md](./ui-mapping/SPEC.md)) |
| `instance-filters/` | filter tree, flat projection, builder |
| root `*.js` | one contract per file, spec beside it |
| `types/` | cross-runtime type definitions |

## Laws

- Contract modules are pure; the component registry stays app-side
  ([components/ui-mapping](../components/ui-mapping/README.md)).
- Component choice is resolver output; persisted and process data reach
  components through resolver tables (root [SPEC.md](../SPEC.md) §4).
- Field descriptors and class obligations come from
  [packages/cts/SPEC.md](../packages/cts/SPEC.md); compiled screen/action
  placement from [packages/processes](../packages/processes/README.md);
  visual tokens from [assets/tokens](../assets/tokens/README.md).
- Offline outbox semantics live in the [root README](../README.md) PWA
  section; instance-event reconciliation in
  [stores/README.md](../stores/README.md).

## End state

Contract prose in ui-mapping is table-shaped (entry tables, budget
constants, arrangement ladder); every enumerated vocabulary equals the
code's; the state-vocabulary derivation has one home repo-wide.
