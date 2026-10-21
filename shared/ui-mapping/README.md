# CODE: UI Mapping

Level-2 design-system contract: one matcher table plus one resolver that maps
CTS declarations and compiled process contracts to presentation decisions —
component keys, spans, variants, chrome, budgets, and action presentation.
It is the seam between the semantic layers (the CTS client bundle from
`@perigram/cts` and the compiled screen/action manifests from
`@perigram/processes`) and the app's PrimeVue component registry.

This module is pure data and pure functions: no Vue, no Nuxt, no PrimeVue
imports, no CNC names. Resolver output names registered component keys
(`'InputNumber'`, `'InstanceInlineRef'`, …); the app-side fixed registry maps keys to
components. Persisted/process data never selects a component directly.

Parent: [shared/README.md](../README.md).

## Inputs

- **Field descriptors** — CTS row field descriptors (`{ base, unit?,
  accepts?, values?, itemType?, fields?, tags?, nullable?, label?,
  display?, control?, identifier?, depiction? }` per
  [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §2/§4); the authored
  `control` pins the edit-variant control.
- **Type records** — entries of the CTS client bundle
  (`compileClientBundle()`), carrying `class`, `payload`, `name`, `glyph`,
  `identifier`, `depiction`, and the derived display policy `sections`
  (total field assignment by base). Type records carry no state
  vocabulary (SPEC §7) and no `render` facet.
- **State policy maps** — `{ [typeId]: { [value]: { label, severity,
  icon, terminal } } }`, derived client-side by `statePolicyByType` from
  the compiled producer workflows the hydration payload carries
  (`producerOutputs[*].workflow.regions[*].states` — the authored
  label/severity/icon/terminal per state value). The contract hands the
  map to `composeScreen` as `statePolicy`; every region node carries its
  type's map (`null` when the process authored no states for the type).
- **Action records** — compiled process actions (`actionKind`, `trigger`,
  `state.to`, relation operation), per
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
An authored `control` string on the descriptor pins the editor
control for edit variants (`full`/`detail`); display variants stay
shape-derived projections — authored data chooses input affordances, not
read-only presentations. Field display names come from
`fieldLabel(name, descriptor)`: the descriptor's `label` override, else
the start-case name. Record titles resolve through `titleFor(record,
typeView, { unnamedLabel })`: the value of the type's `identifier`-flagged
field when non-empty, else the localized unnamed placeholder (default
`'Unnamed'`; callers pass `t('common.unnamed')`) — never record ids,
never slugs, never heuristics. Display glyphs resolve through
`iconFor(typeView, record?)`: `typeView.glyph`, except that a given
record with a non-empty `depiction.thumb` field value wins (the declared
thumbnail is per-record data). `formatQuantity` maps storage units to
display symbols
(`count`/`currency` render as bare localized numbers). Detail surfaces
are sectioned by the derived `sections` (`resolveFieldGroups`: base
assignment in summary/dimensions/media/relations/notes order, fields a
stale bundle left unassigned trailing in an unlabeled default group),
so record views carry field-group semantics instead of one
undifferentiated stream. Generated create dialogs resolve their rows from
compiled construction inputs through `resolveCreateDialogInputs(action,
type, bundle)`: declared fields match by flat-wire `fields.<name>` path
(the §3 stored shape compiled construction inputs speak) or bare name
(authored compose inputs) and render through their descriptor; the
identity `name` renders as a plain string control; `lineage.<key>`
inputs render
instance pickers over the parent types whose children edges declare that
lineage key for the target type (reverse containment over the bundle —
parents' edges are the declaration home, the child carries no parent list;
an edge matches by its declared `lineageKey`, the entry's map key is
authoring identity). Rows carry the compiled input's `required` flag, and
the type's `identifier` row is required unconditionally (the naming law:
its value is the record's title, so a create never submits an unnamed
record — the dialog's submit stays disabled while a required row is
empty). Quantity rows draft the SPEC §2 `{ value, unit }` shape their
control models (a unit-carrying default prefills in that shape), and the
dialog's payload scalarizes drafts at the boundary: instance refs by
`id`, quantities by `value`. Inputs
resolving to nothing stay hidden, so typed constructor inputs keep their
editor surfaces. Construction-input labels are authored vocabulary
resolved at the domain projection (parent type name, start-cased row
name), never raw storage paths.
Display presentations refine by
data shape: percent quantities render as Knob dials, percent-valued maps
as MeterGroup, long strings as prose, string lists as budgeted chips;
bounded scalars (declared min/max) edit through Slider, ordinal enums
(p0..p3, tier0..2 — value shapes all matching a rank pattern) render as
Rating, non-percent quantity maps as bar Charts, enum lists edit through
OrderList, destructive actions confirm through ConfirmDialog with Toast
feedback, and large media collections lay out as a carousel. Spec-row
values are click-to-edit via Inplace.

`resolveListLayout(type, { size, stateful })` → `'table' |
'card-grid' | 'timeline' | 'stats' | 'list' | 'board' |
'gantt' | 'calendar'` from one
matcher table over `analyzeTypeShape(type)`: prose-dominant types are
chronological (timeline), percent/quantity-dominant types are
statlike (StatGrid cards with the `text-metric` role), media types get
card grids, handful-sized
sets render as a bare stacked list, and the default is the generated
columnar table — no hand-picked type ids anywhere and no authored
override channel (display derivation replaced it). A class's list
surface is always flat: containment never projects onto the class
screen — hierarchy is navigation (the workspace explorer owns it). The temporal shapes:
a type declaring two instants is durational (an interval — the gantt,
outranking chronology because an interval is the stronger structure)
and a lone instant with no stronger shape schedules the calendar
(`temporalFieldsFor` derives the fields in declaration order); temporal
shape beats size the way chronology already does. The board is the one
class+vocabulary decision: a process-class type whose served state
vocabulary spans at least `BOARD_MIN_COLUMNS` values (`stateful`, from
`hasStateVocabulary` over the region's state policy) renders its
collections as state lanes, because the authored workflow machine is
that collection's structure; the entry rides a derived `boardable`
candidate signal at one-key specificity so a narrow type override still
outranks it through the override splice. The app-side projection switch —
persisted user view
state on the sort/filter seam, see
[components/ui-mapping](../../components/ui-mapping/README.md)) — offers
the board for any stateful structural collection. Hierarchy
materialization (InstancePicker's hierarchical mode, the workspace
explorer) matches children
through `childrenOfParent(type, pool, parentId)`: every children edge
contributes the pool instances of its declared child types whose
`lineage[edge.lineageKey]` points at the parent — the declared storage
key, never the edge's map key. A lineage reference matches in both
stored shapes, the `{ id }` ref and the normalized id.
Presentation budgets
scale with type richness (`TABLE_COLUMN_SCALE`, `CARD_FACT_SCALE`: wide
types earn more columns and facts) instead of fixed constants. Collection
thresholds are budgets too (`TABLE_PAGINATE_AT`, `TABLE_PAGE_ROWS`,
`TABLE_VIRTUALIZE_AT`, `SEARCH_AT`) so materializations carry no magic
numbers. The
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
read-only presentations (`enum` → Tag, `ref` → InstanceInlineRef — the
app's interactive reference surface; the shared layer names the key,
`quantity` → QuantityText, `blob` → FileChip). Spans are `'full' | 'half'`; the layout is
a dumb responsive grid that consumes spans (the container-relative
`.ck-form-grid`; see Chrome below). Dense rows bound their field
count through the same budget mechanism (`ROW_FIELD_BUDGET`).

### Instance shape and list controls

`analyzeInstanceShape(type, instances)` is the value-aware second pass —
pure over the loaded pool. It reports which fields actually carry data
(`filledScalarNames`; a field no instance fills never becomes a column
or fact) and the enum values present per field
(`enumValues`). `resolveListControls(type, instances)` builds the
compose-time list contract every collection surface consumes:
`searchKeys` (the `identifier`-flagged field only — the preferred-name
and first-short-string heuristics are gone; a type without an identifier
searches by title and id alone), `sortKeys` (filled short scalars
with labels; the authored default-sort override channel is gone — the
first filled short scalar is the natural default), `facets` (enum
fields over the values actually present), and `pagination` from the
shared table budgets. The contract is total and deterministic over the
type record plus instances — never instance-of-the-week heuristics.
Two pure helpers consume it: `toolbarVisibleFor(node)` decides the bar
(large lists always, small lists through multi-value facets, never off
list surfaces) and `instanceMatchesToolbar(type, controls, instance,
query, facetSelections)` applies it — the selection composes into the
canonical instance-filter tree
([shared/instance-filters](../instance-filters/README.md)): an `or` of
case-insensitive substring matches over the search-key fields plus the
instance id (ids stay private display vocabulary, but finding a row by id
remains functional) and one `in` predicate per facet value set
(multi-select within a facet, conjunction across facets), evaluated by
the one shared
matcher.

### State display (flat vocabulary, SPEC §7)

Instances carry one flat `state` string (the wire DTO projects it
verbatim through `dtoToScreenInstance`; nothing synthesizes one). Three
pure helpers own every state-presentation decision:

- `statePolicyByType(producerOutputs)` — `{ [typeId]: { [value]:
  { label, severity, icon, terminal } } }` from the compiled producer
  workflows; the first authored entry wins when several producers emit
  one type. This is the only client-side derivation of the state
  vocabulary — types declare nothing about states.
- `stateFieldPolicyByType(producerOutputs)` — `{ [typeId]: { [value]:
  { visible, editable } } }` from the same workflows (CTS SPEC §7
  `fieldPolicy`): the per-state field narrowing the display seam and the
  instance write boundary consume; only states carrying a facet enter
  the map, first authored entry winning like the policy derivation.
- `stateTransitionsByType(producerOutputs)` — `{ [typeId]: [{ from, to,
  region, intent }] }` from the same compiled producer workflows'
  `regions[*].transitions`: the authored machine edges, the board
  projection's instant legal-move map. First edge per from→to pair wins,
  mirroring the policy derivation; process-owned edges (event-wired
  transitions) stay out — manual moves ride user edges only. Edges compile only from wired update
  actions in the process, so the contract copy can lag the served
  machine (override or default machines serve transitions the producer
  copy never carried) — the board replaces this map at dragstart with
  the host's state-service resolver, the same authority the transition
  buttons use (see
  [components/ui-mapping](../../components/ui-mapping/README.md)).
  `hasStateVocabulary(policy)` is the
  companion signal: a vocabulary spanning `BOARD_MIN_COLUMNS` values
  earns the board projection.
- `stateSegmentsOf(value)` — the display path of one value: single
  segments stay whole; dotted values (declaration-era tree paths that
  persist flat, nested machine state keys) split on `.`, because a
  compound state renders as a path, not one opaque token.
- `stateDisplayFor(policyByValue, value)` — the one resolver every state
  surface (tags, table cells, card badges, transition buttons) reads.
  Lookup is exact first, then the leaf segment (authored policy rides
  the wired state node's own value). SPEC §7 defaults apply: the label
  derives from the leaf segment, terminal severity defaults to
  `secondary`, other severity to `info`. A value outside the served
  vocabulary still displays (stale data degrades to a neutral raw chip,
  `known: false`); a type without a vocabulary resolves `null` and its
  bulk surfaces render no state chrome at all — the detail header is the
  one surface that shows the data's state regardless (the neutral
  stop-line), because the header reports the record, not the
  vocabulary.

### Data states

`composeScreen` accepts `options.sourceStates`, a map of source id to
`'loading' | 'ready' | 'empty' | 'denied' | 'error'` from the data
layer. Every composed region carries `dataState`: the reported state
when present, else derived purely from the pool (`empty` for a list
source with no instances, `missing` for a single source without one,
`ready` otherwise). One precedence rule: a reported `ready` never
overrides the pool-derived state — readiness is resolved instances, so
a data layer that counts a non-empty type bucket cannot upgrade a
single source whose scoped instance is absent past `missing`.
Materializations render one shared message per
state, so loading/empty/denied surfaces never differ per component.

### Generated labels

`typeLabelKey`, `fieldLabelKey`, and `actionLabelKey` derive stable
localization keys (`uiMapping.types.<id>`,
`uiMapping.fields.<typeId>.<name>`, `uiMapping.actions.<id>`) with no
authored vocabulary. `localizedLabel({ te, t }, key, fallback)` resolves
them through any vue-i18n translator scope and falls back to the
resolver-derived label when a key is absent — locale files may override
any generated label without touching the resolvers.

### Surfaces and previews

`resolveSurface(typeRecord, { variant })` → `{ archetype, component, slots,
budgets }`. Class presets pick the archetype family (`file` → payload
surface, `item` → record card/row, `group` → collection, `process` →
status-forward detail); the class obligations in
[packages/cts/SPEC.md](../../packages/cts/SPEC.md) §5 guarantee which slots
are fillable. Unknown classes fall back to the generic record surface.
`resolvePreview(typeRecord)` keys on the declared payload `preview` mode
(`image`, `geometry`, `attachment`, `none`) — preview behavior is declared
data, never guessed from MIME or extension. `RENDERABLE_PREVIEW_MODES`
(table export) lists the modes the app's shared viewer modules render
(`dxf`, `svg`, `sketch`, `occs`, `image`, `pdf`, `docx`, `table`,
`workbook`, `text`); app-side materializations import it instead of
restating the list, and every other mode degrades to a payload download.

### Filterable fields

`builderFieldsForType(type, { bundle })` derives the filterable field
list one collection surface offers its conditions panel: every scalar
field of the type (strings, enums, booleans, numbers, quantities,
instants — never JSON/blob/record/list), plus the one-hop traversal axes
of the canonical filter vocabulary
([shared/instance-filters](../instance-filters/README.md)): relation
targets (`relations.<key>.<field>`, declared by the type's own relation
edges), the lineage parent (`lineage.<lineageKey>.<field>`, derived from
the parents' children edges), and children (`children.<type>.<field>`,
from the type's own children edges). Labels read the authored vocabulary
(type names and start-cased keys prefix the field label). Without a
bundle only direct fields derive. Pure over the type record and bundle.

### Actions

`resolveActionButton(action, { statePolicy })` → `{ component, tone, icon,
iconOnly, confirm, hidden }` from a fixed table: `createInstance` →
primary + icon-only (`+`), `deleteInstance` → danger + confirmation +
icon-only (trash), plain `updateInstance` → secondary + icon-only
(pencil), relation link/unlink → text/icon presentations,
event-triggered actions → hidden. Icon-only is the obvious-action
channel: the caption stays the tooltip and accessible name, and menus
keep full labels. Status-transition actions (`state.to`) carry the target
state's resolved display as their presentation — severity as tone, plus
the authored icon and label (the label derives from the target value when
the policy authors none, so a transition button is never anonymous); a
transition whose policy authors no icon falls back to the swap glyph so
every state-changing button is iconned.

`planActionLaunch(action)` is the launch contract the screen engine
consumes: `'link'` for relation link (its picker dialog), `'dialog'` when
the action carries construction inputs (the generated create dialog —
regardless of grant level) or when a run action carries prompted
exposure inputs (`resolveRunDialogInputs` builds one row per input from
its declared parameter type, prefilled with the authored default), `'confirm'` when the resolved action button
declares confirmation (the destructive kinds), else `'run'`. Grant level is
an access signal, never a presentation one: an admin-level create still
opens its construction dialog, so no create executes with an empty draft
merely because it was granted at admin. The launch decision is
context-free; the screen engine adds the launch context (a dialog whose
every row the context supplies runs with no form — see the component
README's create-dialog contract).

`resolveInstanceActions(actions, typeId)` selects the per-instance quick
actions a collection surface may offer without a form context: manual
status transitions (`updateInstance` with a declared `status.to`),
deletion, and instance-scoped commands for exactly that type, in contract
order. Plain `updateInstance` edits, creates, relation link/unlink
(owner-scoped), and event-triggered actions never qualify — they belong
to their own surfaces.

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
Client-side ordering and paging over the list-controls contract stay pure
too: `sortControlRows(rows, key, order)` orders by a `sortKeys` entry
(quantities by numeric value, absent values always last, never mutating
the input) and `pageSlice(rows, first, rowsPerPage)` cuts one page — the
shared semantics for surfaces that sort or page without PrimeVue.

Presentation context is tree-owned: every composed region node carries
`chrome` (`resolveChrome` of its container role by depth — top regions are
sections, nested regions are cards) plus its `level` — real tree depth:
every top-level region sits at level 0, and the record-page treatment
follows surface kind, never array position — so materializations
style themselves from their position in the hierarchy instead of guessing.
Sibling arrangement is weight-driven and compose-time: `estimateRegionWeight`
estimates each region's full rendered height from its own data — facts,
structural fields, and relation refs for detail regions; per-layout row
factors (`ROW_WEIGHT_BY_LAYOUT`: a preview card ≈ 4 table rows, a board
card ≈ 4, a carousel card ≈ 3, a timeline entry ≈ 2) times actual
instance counts for lists (with the same size classes the materialization
derives, so the weighted layout is the rendered layout),
plus the wrapped
relation-chip rows the first declared relation adds, with no sampling
cap —
and `arrangeChildren` decides how sibling regions share the surface from
the same weights at card scale (a preview/board card is 4 rows, a table
row 1): a stack-mode child set at or under `SIDE_MAX_WEIGHT` rides beside
the record body, peers up to `COLUMN_MAX_WEIGHT` rows each share
proportional columns (track fr from each child's estimated rows), a
sibling holding at least `DOMINANT_CHILD_SHARE` of the total keeps the
vertical flow with the rest arranged after it, and heavier peers tab in
descending weight order at the top level (nested heavy content stacks).
Screen-level sections keep their own budget rule (`childrenModeFor`:
over-budget top-level sections tab). Never measured from the DOM. One global spacing coefficient (0.5–2, the showcase slider)
selects the rhythm set (`spacingClasses` over the literal
`SPACING_SCALES` table): stack rhythm, section gaps, fact-row padding,
chip-row leading, toolbar gaps, control size, and
editor size
move together — real coefficients, Tailwind-scannable by construction. The rule binds everywhere siblings exist: composed screens carry
`regionsMode` for their top-level regions (a heavy home tabs its
sections), and detail nodes carry `childrenMode` for their child
regions. Rhythm and type follow hierarchy through `GAP_BY_LEVEL` and
`TYPE_BY_LEVEL` (heading typography role per level), so spacing and text
scale are data too. Widths stay in
the vocabulary (`LAYOUT.clip`, `LAYOUT.bounded` over the bounded-grid-item
tokens) and card grids run through the shared `ResponsiveGrid` primitive
(container queries), never viewport breakpoints inside panels.
Container-relative layout that Tailwind variants cannot express (the
build ships no container-queries plugin, so `@container`/`@[w]:` classes
silently compile to nothing) lives in real CSS through four sanctioned
homes: record headers (scoped CSS in `SurfaceHeader`, which declares its
own `container-type`; wide headers lay identity and actions on one
wrapping row with a 16rem title floor — long names still truncate
through the `min-w-0` chain — narrow headers stack, with at most
`HEADER_ACTIONS_INLINE` generated buttons inline before the ellipsis
overflow menu), the record page's weight-proportional split (scoped CSS in
`RegionBlock`: past 60rem of container width the record body shares a
12-track grid with the side column, whose span the children's combined
weight earns through `REGION_SIDE_SPANS`; narrower hosts stack), peer
columns (scoped CSS in `RegionChildren`: the children render on their
weight-derived zero-floored `--region-tracks` list — `minmax(0, Nfr)`,
so wide content scrolls inside its column — engaging past 80rem of
container width for two tracks and 120rem for three; narrower hosts
stack), and the form grid
(`LAYOUT.formGrid` names the global `.ck-form-grid` utility in
`assets/css/main.css`: one column under 40rem of container width, two
above; full-span rows opt in with `.ck-span-full`).

## Composition

`composeScreen(screen, contract, bundle, pool, options)` (in `screen.js`)
projects one compiled screen contract into a pure region tree — no Vue.
It resolves
sources (`mode: 'single'` by `scope.instanceId` — the screen's own scoped
instance is explicit: an id that is not in the pool is a missing detail,
never a guess at the first loaded record, and a detail source renders its
resolved instance or nothing, never the whole type; sources of another
type, such as relation/lineage origins, keep the first-instance fallback;
`mode: 'list'` unscoped, or scoped by
`relation: { sourceId, key }` / `lineage: { sourceId, key }` against the
origin source's instance — references match in both stored shapes, the
`{ id }` ref and the normalized id — or scoped by the compiler-emitted flat
`filters` map — the inferred child-region shape — whose `$screen.*`
placeholders resolve against the screen scope: the flat map normalizes
into the canonical instance-filter tree
([shared/instance-filters](../instance-filters/README.md)) and evaluates
over the pool (bare keys read as lineage keys — the total client default;
an unresolved `$screen` placeholder means the pinned scope is unknown, so
the source resolves no instances instead of the whole type); an unscoped
list of a type that can be someone's child (a declared children edge
names it) composes the containment cross-cut: every instance of the type
lists WITH its declared parent context visible (`incomingChildrenEdges`
resolves the parent ref; materializations render the parent chip), never
a bare flat pile — class surfaces never nest at all, and containment
navigation is the workspace explorer's (the sidebar nests instances
under their parents through the same `childrenOfParent` matcher); maps
regions to surface kinds (detail main regions at `full`, nested detail at
`detail`, list rows at `row`), attaches resolved surface policy, resolved
action records, the per-region `dataState` (see Data states), the
`listControls` contract for list regions (see Instance shape and list
controls), the per-type `statePolicy` map off the contract (see State
display), and nested child regions. Region nesting is slot-driven and
matches the compiler's emission: regions with `slot: 'children'` (the
child collections inferred detail screens carry) nest under every
top-level region — the detail record page stacks them below the record
body, and their relation keys cover the detail body's relation chips —
while every other slot composes top-level at depth 0.
`buildInstancePool(instances)`
normalizes instance groups into the `{ type -> { id -> instance } }` pool
the data layer stands in with. The region tree is frozen, pure, and what
[components/ui-mapping](../../components/ui-mapping/README.md)
materializes — screens are generated from the contract, never
handwritten.

## Consumption

- Runtime: [pages/screens/[screenKey].vue](../../pages/README.md) renders
  the compiled UI contract for active processes through the generator —
  auth hydration carries the client bundle and projected actions, and
  `utils/instance-shape.js` (through the instances store) maps entity collections onto the
  instance pool.
- Showcase: [pages/test/ui-mapping.vue](../../pages/test/ui-mapping.vue)
  mounts the generated screen engine over synthetic compiler output; its
  board drops execute through an optimistic state-override executor (the
  lab owns no state service), so drag-to-move is demonstrable end to end
  and rerolling the seed resets the world.
- Materialization: [components/ui-mapping/README.md](../../components/ui-mapping/README.md)
  — the SFC registry and the generated screen engine.
- Fixtures: [test-data/ui-mapping-fixtures.js](../../test-data/ui-mapping-fixtures.js)
  — a synthetic CTS client bundle, compiled screens/actions, and instance
  graph (privacy-safe, factory-shaped).
- Random hydration: [test-data/ui-mapping-random.js](../../test-data/ui-mapping-random.js)
  — a seeded generator producing entire worlds (types, containment DAGs,
  relations, instances, screens, actions) with nothing hand-authored; the
  showcase rerolls seeds from the URL. Beyond the random shapes, every
  world guarantees the showcase-reachable contracts by construction: at
  least one `identifier`-flagged field, an authored `name`/`glyph` per
  type, and a per-field `control` pin; `runCommand` and `unlink` beside the
  create/transition/delete/link/hidden kinds; one volume collection over
  fifty instances (virtualized tables, paginated views, toolbar search);
  one guaranteed-empty type with its own list screen (empty state) and a
  detail screen over it (missing state); loaded parent records with
  weight-sized peer collections (concentrated lineage — each parent type
  has one record holding most of its children, peer collections sized by
  estimated rendered weight) so sibling arrangements engage over
  realistic shapes; and a seeded
  `sourceStatesMatrix` (loading/denied/error, one per screen) the
  showcase applies on demand. Its spec validates every generated
  instance against CTS `checkValue`, composes every screen across
  seeds, and pins each guarantee. Percent quantities roll within their
  scale so meter and knob presentations show distributions instead of
  clamped saturation.
- Spec: `ui-mapping.spec.js` (table-driven resolver/chrome/budget tests),
  `screen.spec.js` (composition mechanics), and
  `test-data/ui-mapping-fixtures.spec.js` (fixture/composition integration).

## Related

- [shared/README.md](../README.md) — shared contracts inventory.
- [shared/instance-filters](../instance-filters/README.md) — canonical
  filter tree the toolbar and source scoping compose into.
- [packages/cts/README.md](../../packages/cts/README.md) — declaration layer
  whose client bundle is the input.
- [packages/processes/README.md](../../packages/processes/README.md) —
  compiled screen/action contracts that supply placement.
- [assets/tokens/README.md](../../assets/tokens/README.md) — visual token
  vocabulary consumed at materialization.
