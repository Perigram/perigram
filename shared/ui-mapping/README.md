# CODE: UI Mapping

Level-2 design-system contract: one matcher table plus one resolver that maps
CTS declarations and compiled process contracts to presentation decisions —
component keys, spans, variants, chrome, budgets, and action presentation.
It is the seam between the semantic layers (the CTS client bundle from
`@perigram/cts` and the compiled screen/action manifests from
`@cutkit/processes`) and the app's PrimeVue component registry.

This module is pure data and pure functions: no Vue, no Nuxt, no PrimeVue
imports, no CNC names. Resolver output names registered component keys
(`'InputNumber'`, `'InstanceChip'`, …); the app-side fixed registry maps keys to
components. Persisted/process data never selects a component directly.

Parent: [shared/README.md](../README.md).

## Inputs

- **Field descriptors** — CTS row field descriptors (`{ base, unit?, accepts?,
  values?, itemType?, fields?, tags?, nullable? }` per
  [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §2/§4).
- **Type records** — entries of the CTS client bundle
  (`compileClientBundle()`), carrying `class`, `payload`, and `render`
  (label/icon/preview/state severities).
- **Action records** — compiled process actions (`actionKind`, `trigger`,
  `status.to`, relation operation), per
  [packages/processes/README.md](../../packages/processes/README.md).
- **Render context** — `variant` and parent chrome role, supplied by the
  renderer, never authored.

## Resolution

Every resolver walks one flat entry list. An entry is
`{ match: { ... }, ...outcome }`; the most specific matching entry wins
(specificity = number of matched keys; ties break by table order), and the
last entry always matches (`{ match: {} }`) so resolution is total and
deterministic. `createUiMapping(overrides)` returns resolvers with app
overrides spliced ahead of the defaults; overrides with narrow matchers
(`type`, `preview`, `actionKind`) are the only extension mechanism — there is
no second dispatch system.

### Variants

One vocabulary across fields and surfaces: `full`, `detail` (editor-family),
`row`, `inline` (display-family). **The container picks the child's variant**:
a collection region asks children for `row`, an opened entity for `detail`.
The same type therefore resolves to different components at different places
in one render tree without any composite registry entries.

### Fields

`resolveFieldControl(descriptor, { variant })` → `{ component, span, props }`.
Field display names come from `fieldLabel(name, descriptor)`: the
descriptor's `label` override, else the start-case name — the same policy
`renderPolicyFor` applies to type labels. `instanceIdentity(type,
instance)` resolves the record label: the type's declared
`render.identityField` first, then the short-string heuristic, then the
id — and `formatQuantity` maps storage units to display symbols
(`count`/`currency` render as bare localized numbers). Detail surfaces
are sectioned by authored `render.groups` (`resolveFieldGroups`: ordered
groups with labels, unlisted fields trailing in an unlabeled default
group), so record views carry field-group semantics instead of one
undifferentiated stream. Display presentations refine by
data shape: percent quantities render as Knob dials, percent-valued maps
as MeterGroup, long strings as prose, string lists as budgeted chips;
bounded scalars (declared min/max) edit through Slider, ordinal enums
(p0..p3, tier0..2 — value shapes all matching a rank pattern) render as
Rating, non-percent quantity maps as bar Charts, enum lists edit through
OrderList, destructive actions confirm through ConfirmDialog with Toast
feedback, and large media collections lay out as a carousel. Spec-row
values are click-to-edit via Inplace.

`resolveListLayout(type, { hierarchical, size })` → `'table' |
'tree-table' | 'card-grid' | 'timeline' | 'stats' | 'list'` from one
matcher table over `analyzeTypeShape(type)`: prose-dominant types are
chronological (timeline), percent/quantity-dominant types are statlike
(StatGrid cards with the `text-metric` role), media types get card grids,
lineage-holding collections get tree tables, handful-sized sets render as
a bare stacked list, and the default is the generated columnar table — no
hand-picked type ids anywhere. Presentation budgets scale with type
richness (`TABLE_COLUMN_SCALE`, `CARD_FACT_SCALE`: wide types earn more
columns and facts) instead of fixed constants. The
shared presentation budgets (`CHIP_BUDGET`, `ROW_RELATION_BUDGET`,
`CHILDREN_TABS_AT`, `SCALAR_BASES`) live beside the other defaults so
materializations carry no magic numbers,
and `LAYOUT` is the only layout-class vocabulary they may use — PrimeVue
components own their internal layout, and every grid/stack/row/gap the
generator needs comes from that table. `formatValue(descriptor, value)`
projects any field to display text (unit symbols, dates, enums, counts),
which text surfaces (timeline meta) consume; structural displays render
as labeled description lists and checklists bounded by
`SUMMARY_BUDGET`.
Edit variants resolve editor controls, refined by derived qualifiers:
`quantity` → QuantityInput (InputGroup: InputNumber plus unit addon), few-option
`enum` → SelectButton, large `enum` → filtered Select, `ref` → InstancePicker,
`list` of strings → InputChips, `list` of refs → InstanceMultiPicker, long
strings → Textarea, payload blobs → FileUpload, and `record`/`variant`/
heterogeneous `list` → recursive structural editors. Display variants resolve
read-only presentations (`enum` → Tag, `ref` → InstanceChip, `quantity` →
QuantityText, `blob` → FileChip). Spans are `'full' | 'half'`; the layout is
a dumb responsive grid that consumes spans. Dense rows bound their field
count through the same budget mechanism (`ROW_FIELD_BUDGET`).

### Surfaces and previews

`resolveSurface(typeRecord, { variant })` → `{ archetype, component, slots,
budgets }`. Class presets pick the archetype family (`file` → payload
surface, `item` → record card/row, `group` → collection, `process` →
status-forward detail); the class obligations in
[packages/cts/SPEC.md](../../packages/cts/SPEC.md) §5 guarantee which slots
are fillable. Unknown classes fall back to the generic record surface.
`resolvePreview(typeRecord)` keys on the declared payload `preview` mode
(`image`, `geometry`, `attachment`, `none`) — preview behavior is declared
data, never guessed from MIME or extension.

### Actions

`resolveActionButton(action, { render })` → `{ component, tone, icon,
confirm, hidden }` from a fixed table: `createInstance` → primary,
`deleteInstance` → danger + confirmation, relation link/unlink → text/icon
presentations, event-triggered actions → hidden. Status-transition actions
carry the target state's render severity as their tone.

## Chrome

Components declare a role; `resolveChrome(role, parentRole)` →
`{ surface, padding, border }` token names from one table:

| Role | Surface | Padding | Border |
|---|---|---|---|
| `canvas` | `page` | `none` | `none` |
| `section` | `none` | `lg` | `none` |
| `card` | `content` | `md` | `hairline` |
| `control` | `control` | `sm` | `ui` |
| `inline` | `none` | `none` | `none |

Same-role nesting flattens: a card inside a card does not paint a second
surface — it degrades to padding plus a divider (`border: 'divider'`,
materialized as PrimeVue `Divider`). Surfaces step only when the role steps;
the `card` role itself materializes as PrimeVue `Card` so preset chrome owns
borders and surfaces. The app materializes remaining token names with the
existing Tailwind/PrimeVue aliases (`bg-content`, `bg-subtle`,
`border-content-border`, …, see
[assets/tokens/README.md](../../assets/tokens/README.md)); this module never
emits raw visual values.

## Budgets

`applyBudget(items, budget)` → `{ mode, visible, hidden }` with
`mode: 'all' | 'collapsed' | 'scroll'`. Variable cardinality (an item with a
different number of files) is the container's concern: surface entries
declare per-slot budgets (`{ max, overflow }`, `overflow` is
`'count' | 'more' | 'scroll'`). Children render themselves; the budget rule
collapses the list (`+n`, "show more", or bounded scroll). Row variants use
tight budgets (`max: 2, overflow: 'count'`); full surfaces scroll instead.

Presentation context is tree-owned: every composed region node carries
`chrome` (`resolveChrome` of its container role by depth — top regions are
sections, nested regions are cards) plus its `level`, so materializations
style themselves from their position in the hierarchy instead of guessing.
Sibling arrangement is weight-driven and compose-time: `estimateRegionWeight`
estimates each region's full rendered height from its own data — facts,
structural fields, and relation refs for detail regions; per-layout row
factors (`ROW_WEIGHT_BY_LAYOUT`: a preview card ≈ 4 table rows, a timeline
entry ≈ 2) times actual instance counts for lists, with no sampling cap —
and `childrenModeFor` stacks siblings until their combined weight exceeds
`SURFACE_ROW_BUDGET`, then arranges them into tabs at the top level. Never
measured from the DOM. The screen's total weight also picks its density
(`screenDensityFor(totalWeight, bias)` → `DENSITY.compact | regular`;
the bias shifts the classification threshold and never overrides the
outcome). One global spacing coefficient (0.5–2, the showcase slider)
selects the rhythm set (`spacingClasses` over the literal
`SPACING_SCALES` table): stack rhythm, section gaps, fact-row padding,
chip-row leading, facts-grid gutters, control size, and editor size
move together — real coefficients, Tailwind-scannable by construction. The rule binds everywhere siblings exist: composed screens carry
`regionsMode` for their top-level regions (a heavy home tabs its
sections), and detail nodes carry `childrenMode` for their child
regions. Rhythm and type follow hierarchy through `GAP_BY_LEVEL` and
`TYPE_BY_LEVEL` (heading typography role per level), so spacing and text
scale are data too. Widths stay in
the vocabulary (`LAYOUT.clip`, `LAYOUT.bounded` over the bounded-grid-item
tokens) and card grids run through the shared `ResponsiveGrid` primitive
(container queries), never viewport breakpoints inside panels.

## Composition

`composeScreen(screen, contract, bundle, pool)` (in `screen.js`) projects one
compiled screen contract into a pure region tree — no Vue. It resolves
sources (`mode: 'single'` by `scope.instanceId` with first-instance fallback;
`mode: 'list'` unscoped, or scoped by `relation: { sourceId, key }` /
`lineage: { sourceId, key }` against the origin source's instance), maps
regions to surface kinds (detail main regions at `full`, nested detail at
`detail`, list rows at `row`), attaches resolved surface policy, resolved
action records, and nested child regions. `buildInstancePool(instances)`
normalizes instance groups into the `{ type -> { id -> instance } }` pool the
data layer stands in with. The region tree is frozen, pure, and what
[components/ui-mapping](../../components/ui-mapping/README.md) materializes
— screens are generated from the contract, never handwritten.

## Consumption

- Showcase: [pages/test/ui-mapping.vue](../../pages/test/ui-mapping.vue)
  mounts the generated screen engine over synthetic compiler output.
- Materialization: [components/ui-mapping/README.md](../../components/ui-mapping/README.md)
  — the SFC registry and the generated screen engine.
- Fixtures: [test-data/ui-mapping-fixtures.js](../../test-data/ui-mapping-fixtures.js)
  — a synthetic CTS client bundle, compiled screens/actions, and instance
  graph (privacy-safe, factory-shaped).
- Random hydration: [test-data/ui-mapping-random.js](../../test-data/ui-mapping-random.js)
  — a seeded generator producing entire worlds (types, containment DAGs,
  relations, instances, screens, actions) with nothing hand-authored; the
  showcase rerolls seeds from the URL. Its spec validates every generated
  instance against CTS `checkValue` and composes every screen across
  seeds.
- Spec: `ui-mapping.spec.js` (table-driven resolver/chrome/budget tests),
  `screen.spec.js` (composition mechanics), and
  `test-data/ui-mapping-fixtures.spec.js` (fixture/composition integration).

## Related

- [shared/README.md](../README.md) — shared contracts inventory.
- [packages/cts/README.md](../../packages/cts/README.md) — declaration layer
  whose client bundle is the input.
- [packages/processes/README.md](../../packages/processes/README.md) —
  compiled screen/action contracts that supply placement.
- [assets/tokens/README.md](../../assets/tokens/README.md) — visual token
  vocabulary consumed at materialization.
