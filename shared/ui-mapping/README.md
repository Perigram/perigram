# CODE: UI Mapping

Level-2 design-system contract: one matcher table plus one resolver that maps
CTS declarations and compiled process contracts to presentation decisions —
component keys, spans, variants, chrome, budgets, and action presentation.
It is the seam between the semantic layers (the CTS client bundle from
`@perigram/cts` and the compiled screen/action manifests from
`@cutkit/processes`) and the app's PrimeVue component registry.

This module is pure data and pure functions: no Vue, no Nuxt, no PrimeVue
imports, no CNC names. Resolver output names registered component keys
(`'InputNumber'`, `'EntityChip'`, …); the app-side fixed registry maps keys to
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
`renderPolicyFor` applies to type labels. Display presentations refine by
data shape: percent quantities render as progress bars and string lists as
budgeted chips.
Edit variants resolve editor controls, refined by derived qualifiers:
`quantity` → QuantityInput (InputGroup: InputNumber plus unit addon), few-option
`enum` → SelectButton, large `enum` → filtered Select, `ref` → EntityPicker,
`list` of strings → InputChips, `list` of refs → EntityMultiPicker, long
strings → Textarea, payload blobs → FileUpload, and `record`/`variant`/
heterogeneous `list` → recursive structural editors. Display variants resolve
read-only presentations (`enum` → Tag, `ref` → EntityChip, `quantity` →
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
confirm, hidden }` from a fixed table: `createEntity` → primary,
`deleteEntity` → danger + confirmation, relation link/unlink → text/icon
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

## Composition

`composeScreen(screen, contract, bundle, pool)` (in `screen.js`) projects one
compiled screen contract into a pure region tree — no Vue. It resolves
sources (`mode: 'single'` by `scope.entityId` with first-instance fallback;
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
