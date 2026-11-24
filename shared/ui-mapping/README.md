# CODE: UI Mapping

Level-2 design-system contract: one matcher table plus one resolver that maps
CTS declarations and compiled process contracts to presentation decisions —
component keys, spans, variants, budgets, and action presentation.
It is the seam between the semantic layers (the CTS client bundle from
`@perigram/cts` and the compiled screen/action manifests from
`@perigram/processes`) and the app's PrimeVue component registry.

This module is pure data and pure functions: no Vue, no Nuxt, no PrimeVue
imports, no CNC names. Resolver output names registered component keys
(`'InputNumber'`, `'InstanceInlineRef'`, …); the app-side fixed registry maps keys to
components. Component choice is resolver output only.

Parent: [shared/README.md](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Inputs

- **Field descriptors** — CTS row field descriptors (`{ base, unit?,
  accepts?, values?, itemType?, fields?, tags?, nullable?, label?,
  display?, control?, identifier?, depiction? }` per
  [packages/cts/SPEC.md](../../packages/cts/SPEC.md) §2/§4); the authored
  `control` pins the edit-variant control.
- **Type records** — entries of the CTS client bundle
  (`compileClientBundle()`), carrying `class`, `payload`, `name`, `glyph`,
  `identifier`, `depiction`, the derived display policy `sections` (total
  field assignment by base), and the declared `stateVocabulary` when the class carries one. Type records carry no `render` facet.
- **State policy maps** — `{ [typeId]: { [value]: { label, severity,
  icon, terminal } } }`, derived client-side by `statePolicyByType` from
  the compiled producer workflows the hydration payload carries
  (`producerOutputs[*].workflow.regions[*].states`) and the class
  declarations' `stateVocabulary`; a class entry overrides the graph
  policy for the same value. The contract hands the
  map to `composeScreen` as `statePolicy`; every region node carries its
  type's map (`null` when the process authored no states for the type).
- **Action records** — compiled process actions (`actionKind`, `trigger`,
  `state.to`, relation operation), per
  [packages/processes/README.md](../../packages/processes/README.md).
- **Render context** — `variant`, supplied by the renderer, never
  authored.

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
shape-derived projections — authored data chooses input affordances,
read-only presentations derive from shape.

**Identity and labels:**

- `fieldLabel(name, descriptor)` — the descriptor's `label` override, else
  the start-case name.
- `typeLabelFor(type, { t, te, entitiesLabelKey, unnamedLabel })` — the
  one type-label chain every surface reads: the design-system
  `entities.*` key (pack types) → the generated `uiMapping.types.<id>`
  override → the authored bundle `name` → the unnamed placeholder.
  Takes a type record or a bare id; `utils/generated-labels.js`
  (`generatedEntityLabel`) is the app binding that feeds the entities
  key table and the registry-resolved record. Raw ids never render.
- `titleFor(record, typeView, { unnamedLabel })` — the value of the type's
  `identifier`-flagged field when non-empty, else the localized unnamed
  placeholder (default `'Unnamed'`; callers pass `t('common.unnamed')`).
  Titles are identifier values.
- `iconFor(typeView, record?)` — `typeView.glyph`; a given record with a
  non-empty `depiction.thumb` field value wins (the declared thumbnail is
  per-record data).
- `formatQuantity` — maps storage units to display symbols
  (`count`/`currency` render as bare localized numbers).
- The identifier field is the identity slot of every surface (record title,
  card title, table identity column); fact strips, card facts, and
  descriptor columns exclude it (`isIdentifierField`), so the title renders
  once per surface.

**Edit variants** resolve editor controls, refined by derived qualifiers:

| Input shape | Control |
|---|---|
| authored `control` | the pinned control |
| `quantity` | QuantityInput (InputGroup: InputNumber plus unit addon) |
| few-option `enum` | SelectButton |
| large `enum` | filtered Select |
| ordinal `enum` (p0..p3, tier0..2 — value shapes matching a rank pattern; quantitative type) | Rating |
| bounded scalar (declared min/max) | Slider |
| `ref` | InstancePicker |
| `list` of strings | ChipsInput |
| `list` of refs | InstanceMultiPicker |
| `list` of enums | OrderList |
| long string | Textarea |
| payload blob | FileUpload |
| `record` / `variant` / heterogeneous `list` | recursive structural editors |
| `map` | MapEditor key-value rows (itemType-typed value cells, value-shape cells otherwise) |
| schemaless `json` | ObjectSummary read-only summary — machine data ([SPEC](./SPEC.md) → Field I/O law) |

**Display variants** resolve read-only presentations, refined by data shape:

| Data shape | Presentation |
|---|---|
| `enum` | Tag |
| `ref` | InstanceInlineRef (the app's interactive reference surface; the shared layer names the key) |
| `quantity` | QuantityText |
| `boolean` | BooleanCheck — the readonly checkbox state (checked, unchecked, indeterminate) |
| `blob` | FileChip |
| percent quantity (quantitative type) | Knob dial |
| percent-valued map (quantitative type) | MeterGroup |
| non-percent quantity map (quantitative type) | bar Chart |
| long string | prose |
| string list | budgeted chips |
| detail spec-row value | Inplace (click-to-edit through `InlineField`) |

Spans are `'full' | 'half'`; the layout is a dumb responsive grid that
consumes spans (the container-relative `.ck-form-grid`). Dense
rows bound their field count through `ROW_FIELD_BUDGET`.

Detail surfaces are sectioned by the derived `sections`
(`resolveFieldGroups`: base assignment in summary/dimensions/media/
relations/notes order, fields a stale bundle left unassigned trailing in an
unlabeled default group), so record views carry field-group semantics.

**Create dialogs.** Generated create dialogs resolve their rows from the
compiled input policy through `resolveCreateDialogInputs(action, type,
bundle)` — the policy owns the row list, and the compiler keeps it to the
fields the graph leaves unsupplied, so wired producers and authored socket
defaults stay out of the dialog; construction inputs serve actions compiled
without a policy. A structured refusal (SPEC §24) keeps the dialog open:
the run's `failures` render as the offender list under the rows
(`refusalFailuresOf` in utils/action-failures.js reads the error body),
and the dialog closes only on success; row-level launches toast the same
list. A ref input whose compiled policy carries a `control` pin renders
that control: `spot-parts` (SPEC §24) turns the parts list into the
per-spot assignment widget — the picked single-ref row is the template,
its payload's `{spot:<name>}` anchors each take any accepted part
(`SpotPartsRow` reads the anchor names from the template type's served
editor surface module — the plugin's single parse home), name-equal
parts prefilled, and the assignment travels as `{ id, spot }` entries.
A `layer-mapping` pin renders the uploaded file's source layers against
the pin's `controlOptions.targets`; a `cassette-parameters` pin renders
the picked template's parameter table as one input per parameter.
`controlOptions` rides the resolved row so the control owns no target
vocabulary, and a control pin wins over the row's declared field
descriptor.
Reference rows carry the fill-dialog rails (SPEC §24): beside the
picker, `RefRowActions` creates through the accepted type's declared
creation mode — the `editor` protocol opens the blank editor page, a
compiled upload-mode create runs inline (the bytes travel the files
channel, the created record selects into the row), and every other
compiled create opens the nested create dialog inside the fill dialog —
and opens the picked instance's editor when its type binds one. A create whose created type declares a payload and whose action
carries a construction mode composes through the fill-dialog shell
(`FillDialogBody` widens the dialog and splits the form pane from the
preview pane; the shell renders transparent when there is nothing to
compose): the form pane keeps the rows and the refusal's named
offenders, the preview pane waits until the create's required rows are
filled, then debounces the draft into
`POST /api/instances/:type/construction-preview` and renders the
returned payload through the created type's preview mode, or its
computed geometry fields through the drawing canvas when the service
returns no payload ([instances feature](../../server/features/instances/README.md) owns
the route); the pane renders the refusal's named offenders inline, and
a preview failure beyond the quiet 404/403 (no binding, no grant)
surfaces as the same offender list over the transport's message. The
dialog
stays viewport-bounded: the form pane owns its scroll, the preview pane
stays bounded, and the picked instance's editor opens in place over the
dialog instead of navigating away. A values
input carrying the `template-values` control pin renders
`TemplateValuesRow` — one scalar input per token the composition's
`meta.tokens` names, the model staying the operator's values map. The contract's input list is the dialog's complete row
list: an identifier row reaches the dialog only as a contract input (a
non-constructible identity row authors nothing and stays out of every
contract). Declared fields match by flat-wire `fields.<name>` path
(the §3 stored shape compiled construction inputs speak) or bare name
(authored compose inputs) and render through their descriptor — the
block-composed policy's `field:`-prefixed ids map onto their wire path,
which is the row id and draft key; string
protocol inputs (the `content` body) render as full-width scalar rows
carrying their control pin; `lineage.<key>` inputs render
instance pickers over the parent types whose children edges declare that
lineage key for the target type — the served per-input parent type is
the fallback (the policy field's `typeId`, the exposure input's
`typeId`, or a parent-bound create's `parentTypeId`) — immediate axes
alone, the ancestor
chain derives at the construct seam
(reverse containment over the bundle —
parents' edges are the declaration home, the child carries no parent list;
an edge matches by its declared `lineageKey`, the entry's map key is
authoring identity). A lineage axis stays a row even when the compiled
policy marks it graph-supplied, unless the field carries an authored
default (a pinned parent stays supplied): its wire source is the launch
context, so a contextless launch prompts it (the row carries the
compiled `required` flag) and a scoped launch seeds and hides it through
the component layer's launch-context channel. Construct operator reference inputs render as
instance pickers over the operator's `accepts` — an `entity` single, a
`typeList` list; every other operator data input renders by its own
base (a free-form map as key-value rows, quantities their unit field).
Rows carry the compiled input's `required` flag; an
identifier row the contract prompts is required unconditionally (its
value is the record's title), and the dialog's submit stays disabled
while a required row is empty (`createDialogRowUnfilled` is the
predicate: nullish, empty string or list, a cleared quantity, or a
layer-mapping row missing its required target; picker and file models
count as filled). Upload/capture dialogs prompt the file
alone; the construct seam fills the record's name from the uploaded
file's name. Quantity rows draft the SPEC §2
`{ value, unit }` shape their control models (a unit-carrying default
prefills in that shape); numeric controls write through
`numericControlWrite` (a quantity descriptor wraps into that shape, a
plain `number` stays scalar), and the dialog's payload scalarizes drafts
at the boundary (`createDialogPayload`: instance refs by `id` — picker
lists entrywise, a spot assignment keeping its `spot` beside the id —,
quantity drafts by `value`, file references passing as the payload
object).
Inputs resolving to
nothing stay hidden, so typed constructor inputs keep their editor
surfaces. Construction-input labels are authored vocabulary resolved at the
domain projection (parent type name, start-cased row name).

**List layouts.** `resolveListLayout(type, { stateful })` →
one of `table`, `card-grid`, `timeline`, `stats`, `board`,
`gantt`, `calendar`, from one matcher table over `analyzeTypeShape(type)`:

| Signal | Layout |
|---|---|
| prose-dominant | `timeline` (chronological) |
| percent/quantity-dominant | `stats` (StatGrid cards with the `text-metric` role) |
| media | `card-grid` |
| two declared instants | `gantt` (an interval outranks chronology — the stronger structure) |
| lone instant | `calendar` (`temporalFieldsFor` derives the fields in declaration order) |
| process class whose state vocabulary spans ≥ `BOARD_MIN_COLUMNS` | `board` |
| default | `table` (generated columnar — the floor for every plain collection, whatever the loaded pool fills; SPEC §22.15) |

`listLayoutOf(node)` is the one region-level derivation: compose-time
traits, weight estimation, and the RegionBlock materialization pass the
same node through it, so the weighted arrangement is the rendered
layout.

Temporal shape beats size the way chronology already does. The board is the
one class+vocabulary decision: a process-class type whose served state
vocabulary spans at least `BOARD_MIN_COLUMNS` values (`stateful`, from
`hasStateVocabulary` over the region's state policy) renders its
collections as state lanes, because the authored workflow machine is that
collection's structure; the entry rides a derived `boardable` candidate
signal at one-key specificity so a narrow type override still outranks it
through the override splice. The app-side projection switch — persisted
user view state on the sort/filter seam, see
[components/ui-mapping](../../components/ui-mapping/README.md) — offers the
board for any stateful structural collection. A class's list surface is
always flat: containment is navigation (the workspace explorer owns
hierarchy), and a group-class collection is its record collection like
any other — membership renders on the record surface through the record
ladder (SPEC §22.11).

**Hierarchy materialization** (the workspace explorer) matches children
through `childrenOfParent(type, pool,
parentId)`: every children edge contributes the pool instances of its
declared child types whose `lineage[edge.lineageKey]` points at the parent —
the declared storage key (the edge's map key is authoring identity). A
lineage reference matches in both stored shapes, the `{ id }` ref and the
normalized id.

`formatValue(descriptor, value, { locale })` projects any field to display
text (unit symbols, dates, enums, counts); the optional `locale` drives
date and number formatting and components thread the active i18n locale
through it, which text surfaces (timeline meta) consume;
structural displays render as labeled inline summaries (SPEC §22.8:
wrapping rows, values on their own lines) bounded by `SUMMARY_BUDGET`.

### Instance shape and list controls

`analyzeInstanceShape(type, instances)` is the value-aware second pass —
pure over the loaded pool. It reports which fields actually carry data
(`filledScalarNames`; a field no instance fills never becomes a column
or fact) and the enum values present per field
(`enumValues`). `resolveListControls(type, instances)` builds the
compose-time list contract every collection surface consumes:
`searchKeys` (the `identifier`-flagged field only; a type without an identifier
searches by title and id alone), `sortKeys` (filled short scalars
with labels, the identifier field excepted — it is the identity axis;
the
first filled short scalar is the natural default), `relationColumn`
(the first declared relation — an explicit edge or a declared ref
field, `{ key }`, a column only when any loaded instance carries its
refs — the same filledness law as scalar columns), `summaryColumn` (the first declared
json/record/map field any instance fills, `{ key }` — the compact
structural summary column, same law), `childrenColumns` (one
`{ key, types }` per declared children edge — the edge's key labels its
column and only its instances ride it; an edge whose children no listed
row carries renders no column, derived over the pool the composition
and the host overlay provide), `facets` (enum
fields over the values actually present), and `pagination` from the
shared table budgets. Filledness is display-aware: a quantity carrying
a null value renders the fallback dash and counts as unfilled. The
contract is total and deterministic over the
type record plus instances.
Two pure helpers consume it: `toolbarVisibleFor(node)` decides the bar
(large lists always, small lists through multi-value facets, list
surfaces only) and `instanceMatchesToolbar(type, controls, instance,
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

- `statePolicyByType(producerOutputs, types)` — `{ [typeId]: { [value]:
  { label, severity, icon, terminal } } }` from the compiled producer
  workflows plus the class declarations' `stateVocabulary`; the first producer
  entry wins when several emit one type, and a class entry overrides its
  value's display policy.
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
`ready` otherwise). Two precedence rules reconcile the fetch outcome
with the live pool: a reported `ready` never overrides the pool-derived
state — readiness is resolved instances, so a data layer that counts a
non-empty type bucket cannot upgrade a single source whose scoped
instance is absent past `missing`; and a reported `empty` or `missing`
yields to resolved instances, so rows the pool gains after the fetch (a
created record lands with its snapshot while the screen stays mounted)
render as ready. `loading`, `denied`, and `error` stay authoritative.
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
status-forward detail); every record-class surface carries `identity`,
`fields`, and `relations`, with `children` on group surfaces and
`status`/`actions` on process surfaces. Unknown classes fall back to the
generic record surface.
Fields carrying `display: 'hidden'` stay out of derived detail groups and
card fact counts; their stored values remain available to logic and transports.
`resolvePreview(typeRecord)` keys on the declared payload `preview` mode
(`image`, `geometry`, `graph`, `attachment`, `none`) — preview behavior is
declared data. `RENDERABLE_PREVIEW_MODES`
(table export) lists the modes the app's shared viewer modules render
(`dxf`, `svg`, `sketch`, `image`, `pdf`, `docx`, `table`,
`workbook`, `text`, `graph`); app-side materializations import it instead of
restating the list, and every other mode degrades to a payload download.
A `graph` preview renders the saved canonical graph payload as an SVG.
`ASPECT_PREVIEW_MODES` (`pdf`) marks the page modes: the page renders
in the framed region (`LAYOUT.previewHeroBandAspect`), the viewer
fitting the frame's width;
prose flows unframed at the body's
content measure (`LAYOUT.previewHeroBandFlow`); every other renderable
mode fills the framed media region (`LAYOUT.previewHeroBandContent`).
The framed region fills the page's free space — viewport-derived
height floored at 24rem — and carries a reader-resizable grip on record
pages; bounded hosts (the record peek, Card variants) frame their
preview at the stepped quiet-band scale instead
(`LAYOUT.previewEmbedBand`), and fixed-height card bands carry content
thumbnails — cover-cropped rasters, clipped rows, clamped prose,
the PDF's painted first page.
`cardAnatomyFor(typeRecord)` derives a card grid's card layout from the
type's own data shape: a visual preview (renderable payload mode or
declared geometry source) with no fact fields (short non-identifier
scalars) resolves `tile`, a visual preview with fact fields resolves
`side`, everything else resolves `plain`. The card materialization
(`CardGrid`) renders the three anatomies through `LAYOUT.mediaTile*`
and `LAYOUT.previewSide`; bounded card hosts (the board) keep the
fixed `LAYOUT.previewBand` thumbnail.

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
iconOnly, confirm, hidden, inline }` from a fixed table: `createInstance` →
primary + captioned (the compiled label names the created type),
`deleteInstance` → danger + confirmation +
icon-only (trash), stateless `updateInstance` → hidden (fields edit
inline on detail surfaces), relation link/unlink → text/icon
presentations, `runCommand` and `emitEvent` → secondary + bolt,
event-triggered actions → hidden. Icon-only is the obvious-action
channel (delete, the construct re-run): the caption stays the tooltip
and accessible name, and menus
keep full labels. An entry with `inline: true` declares reference-bound
placement: the action renders on the rendered relation reference it
addresses (the unlink chip menu, a relation-scoped section row's menu)
and record headers exclude it; a relation link action's placement is
section-bound — the section toolbar for its target relation renders it
beside the create affordance (SPEC §22.12).
Status-transition actions (`state.to`) carry the target
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
its declared parameter type, prefilled with the authored default), `'confirm'` when the resolved action button declares
confirmation (the destructive kinds), else `'run'`. Grant level is an
access signal, never a presentation one: an admin-level create still
opens its construction dialog, so no create executes with an empty draft
merely because it was granted at admin. A lineage axis the graph
supplies without an authored default always counts as a dialog row —
its wire source is the launch context, and the dialog's launch-context
channel seeds and hides it inside the parent's surface (auto-running
when the context supplied every row).

`resolveInstanceActions(actions, typeId)` selects the per-instance quick
actions a collection surface may offer without a form context: manual
status transitions (`updateInstance` with a declared `status.to`),
deletion, and instance-scoped commands for exactly that type, in contract
order. Plain `updateInstance` edits, creates, relation link/unlink
(owner-scoped), and event-triggered actions never qualify — they belong
to their own surfaces.

`constructRerunAction(actions, record)` derives the construct re-run
(SPEC §24): a record whose `provenance.op` names a construct
(`cts.construct:<action>:<mode>`) carries a `rerunInstance` row for that
compiled action — icon-only refresh, `rerunOf` naming the action id it
launches with `rerun: true`, caption keyed `uiMapping.rederive` (the
`labelKey` channel `ActionButton` resolves ahead of the per-action key).
The stored inputs are the run's inputs: the
row prompts nothing (`planActionLaunch` → `run`).

`createActionControls(actions)` collapses the collection toolbar's create
set: creates targeting one type become a single control
`{ action, group }` whose `group` carries every same-type sibling in
contract order (a sole create is its own single-entry group), so a type
with several creation modes renders one affordance. The control's own
materialization (`CreateControl`) groups the creation-mode selection with
the create button in one PrimeVue `InputGroup`; the button caption names
the created type without the mode and dispatches the selected action,
which follows the ordinary launch contract (its params dialog, or a
direct run for a mode without prompted inputs).

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

Budget constants live in `tables.js` beside the matcher tables, so every
materialization reads the same numbers:

| Constants | Bound |
|---|---|
| `TABLE_COLUMN_SCALE`, `CARD_FACT_SCALE` | columns and facts per type richness |
| `TABLE_PAGINATE_AT`, `TABLE_PAGE_ROWS`, `SEARCH_AT` | collection thresholds: pagination, page size, toolbar search |
| `CHIP_BUDGET`, `ROW_RELATION_BUDGET`, `SUMMARY_BUDGET`, `DETAIL_FACT_BUDGET` | chip, relation-chip, structural-summary, detail-fact counts |
| `CHILDREN_TABS_AT`, `HEADER_ACTIONS_INLINE` | child regions per tab, inline header actions before the overflow menu |
| `ROW_FIELD_BUDGET`, `SCALAR_BASES` | dense-row field count, scalar base set |
| `BOARD_MIN_COLUMNS` | board column floor |
| `CONTAINER_WIDTH_STEPS`, `HOST_PROFILES` | container width steps (`medium` 40rem, `wide` 60rem — the form grid and record split materialize them, and the record document's `LAYOUT.measure` bounds the depth-0 record page at the wide step, SPEC §22.17), host fallback traits (page, pane, dialog, popup, mobile tab) incl. the density tier per host |
| `SPACING_WEIGHT_AT` | composed screen weight that tightens the rhythm one step |
| `FULL_BREADTH_LAYOUTS`, `BOUNDED_GROWTH_LAYOUTS`, `PAGINATED_GROWTH_LAYOUTS` | data-trait derivations: full-row layouts, scroll-owning layouts, layouts that page past `TABLE_PAGINATE_AT` |

`LAYOUT` is the one layout-class vocabulary materializations may use —
PrimeVue components own their internal layout, and every grid/stack/row/gap
the generator needs comes from that table. The layout language
([SPEC](./SPEC.md) → Layout language) owns the vocabulary: nine atoms
(`stack`, `row`, `grid` with earned/floor/steps track derivations, `band`,
`well`, `tabs`, `placement`, `stub`, `pack`) plus the ambient sets they
compose under (cells, clamps, chrome, data-driven geometry). The
`LAYOUT_ATOMS`/`LAYOUT_AMBIENT` registries in `tables.js` assign every
recipe to its atom or set, and the engine spec pins the partition — a
recipe outside the registries is a vocabulary defect.

### Arrangement

Presentation context is tree-owned: every composed region node carries
`level` — real tree depth:
every top-level region sits at level 0, and the record-page treatment
follows surface kind — so materializations style themselves from their
position in the hierarchy.

Every composed node carries its **data traits** (`regionDataTraits`, pure
over the type record and pool, frozen at compose): `weight`
(`estimateRegionWeight`), `breadth` (`content` most
collections and detail bodies · `full` table/board/gantt/calendar —
layouts that demand the row), `volume`, `shape` (`shapeFamilyOf`), 
`filledness` (zero instances is `inert`), and `growth` (`bounded` for
scroll-owning layouts and collections past the pagination budget,
`flowing` otherwise). Arrangement decisions consume the record; the
random-world spec pins its domains over every composed node.

**Container traits** (`resolveContainerTraits({ widthRem, hostKind,
density, height?, scroll? })`) resolve the host side: the measured width
maps to the `CONTAINER_WIDTH_STEPS` steps (narrow / medium 40rem / wide
60rem), and `HOST_PROFILES` supply the fallback `height`/`scroll`/`density`
per host
kind — the measured box wins over the profile, and a placement box
overrides height/scroll with the host record's values while measuring its
own width. The resolved record carries its `hostKind`, so consumers can
gate host-specific presentations (the record popup's compact document)
on the box they actually render in. Density derives from the host profile alone
(bounded hosts —
panes, popups — ride the compact rhythm; pages and dialogs ride the page
rhythm); an explicit
value (a placement box inheriting its host's density) wins over the
profile. The app-side measurement seam is `useContainerTraits`
([composables](../../composables/README.md)): hosts declare their profile
through `provideContainerTraits` (the pane and the record popup measure
themselves, fixed-shape hosts provide the profile, the routed screen
provides the measured page
record when no host declared one), placement boxes measure where they
render, and surfaces resolve the nearest record through
`useHostContainerTraits` (the page profile is the providerless default).
Budgets consume the resolved record — a `narrow`/`medium` box sheds table
columns (compact column scale) and a `narrow` box sheds card facts; the
screen's spacing coefficient resolves from the record's density and the
screen's composed weight (`spacingCoefficientFor` + `screenWeight`).

Sibling arrangement is weight-driven, compose-time, and step-carried.
The record page is a document (SPEC §22.17, superseding §22.1–§22.2's
arrangement outcomes for record pages): in the `record` presentation a
depth-0 detail region's children resolve the stack at every width step —
no side rail, peer columns, or tabs on record pages — while the ladder
below keeps governing list screens, nested surfaces, and the whole tree
under the `peek` presentation.
`estimateRegionWeight` estimates each region's full rendered height from
its own data — facts, structural fields, and relation refs for detail
regions; per-layout row factors (`ROW_WEIGHT_BY_LAYOUT`: a preview card ≈ 4
table rows, a board card ≈ 4, a timeline entry ≈ 2)
times actual instance counts for lists (with the same size classes the
materialization derives, so the weighted layout is the rendered layout),
plus the wrapped relation-chip rows the first declared relation adds.
`arrangeChildren` resolves the sibling set by ordered rule at every width
step — the node's `childArrangement` and the screen's `regionsArrangement`
carry `{ narrow, medium, wide }`, and the materialization engages the step
its host record grants, so one composed tree serves every host and a host
change re-engages without recomposition. Arrangement applies through a
top-down pass (`withArrangement` in `screen.js`) that threads each step's
tab ancestry: a tab arrangement at a step excludes tabs in its descendants
at that step (root SPEC §22.1):

| Rule | Constant | Behavior |
|---|---|---|
| Full-row claim | `FULL_BREADTH_LAYOUTS` | breadth-`full` siblings claim whole rows in flow order (`fullRow` ids on the columns outcome) and stay out of the peer columns and the record side rail |
| Dominant child | `DOMINANT_CHILD_SHARE` | a sibling holding at least the share of total weight keeps the vertical flow; its remainder carries its own stepped arrangement within `SURFACE_ROW_BUDGET`, and a heavier remainder tabs the set |
| Side rail | `SIDE_MAX_WEIGHT` | the record page's wide-step ladder outcome (the `peek` presentation's record split; record pages resolve the document stack, SPEC §22.17): a light child set (combined weight at or under the budget, no full-breadth child) rides beside the record body while the body carries at least the rail's weight — a lighter body keeps the children below at full width; the side column's span earned by weight (`REGION_SIDE_SPANS`) |
| Peer columns | `COLUMN_MAX_WEIGHT` | columnable peers each at or under the cap share proportional columns (track fr from each child's estimated rows) at every step past narrow, any peer count |
| Tabs | `SURFACE_ROW_BUDGET` | a set over the budget with a sibling past the column cap tabs in descending weight order at any tree level; a sibling set inside a tab arrangement stacks (root SPEC §22.1) |
| Stack | — | the terminal arrangement: content-height blocks in flow order |

The record side rail engages only at the wide step (narrower hosts take
the step's own outcome below the body), and peer columns engage when the
measured box grants every track its earned minimum (`trackCount ×
REGION_COLUMN_EARNED_REM`), shedding to the stack when it cannot.

Arrangement is content-aware (SPEC §22, 2026-10-22): a child
collection with zero loaded instances is layout-inert — it joins the node's
`stubRegions`, renders its create affordance alone (see RegionBlock in
[components/ui-mapping](../../components/ui-mapping/README.md)) below the
arranged content, and every arrangement decision (weights, columns, tabs,
the side rail) sees filled children only; its relation key still covers the
record body's chip row.
Screen-level sections arrange through the same stepped rules
(`regionsArrangement` on the composed screen, materialized by
RegionChildren): multi-section screens share proportional columns when the
weights grant them and tab past the budget — one ladder for screens and
record children. A screen section that resolved empty leaves the ladder as
a compact stub strip below the arranged content (`stubRegions` on the
composed screen; loading/denied/error sections keep their state surfaces
in the arrangement). A host whose empty collection is its own content
passes `keepEmptyLists` and keeps the section in the arrangement with its
header and empty state. Every weight is a compose-time value over the
composed tree.

The spacing coefficient (0.5–2) selects the rhythm set
(`spacingClasses` over the literal `SPACING_SCALES` table): stack rhythm,
section gaps, fact-row padding, chip-row leading, toolbar gaps, control
size, and editor size move together — real coefficients,
Tailwind-scannable by construction. The coefficient derives from context
and data (`spacingCoefficientFor`, the one derivation): the host
record's density tier tightened one step for bounded hosts when the screen's composed
weight passes `SPACING_WEIGHT_AT`, floored at the tightest; an explicit
coefficient (the showcase slider) overrides the derivation. The rule binds everywhere siblings exist: detail nodes carry
`childArrangement` for their child regions, and the composed screen carries
`regionsArrangement` for its top-level sections. Rhythm and type follow hierarchy through `GAP_BY_LEVEL` (depth from
two rides the tight rhythm) and
`TYPE_BY_LEVEL` (heading typography role per level), so spacing and text
scale are data too. Widths stay in
the vocabulary (`LAYOUT.clip`, `LAYOUT.bounded` over the bounded-grid-item
tokens) and card grids run through the shared `ResponsiveGrid` primitive
(container queries).
Container-relative layout that Tailwind variants cannot express (the
build ships no container-queries plugin, so `@container`/`@[w]:` classes
silently compile to nothing) lives as named recipes in the global
stylesheet, `assets/css/main.css`, referenced through LAYOUT tokens:
record headers (`LAYOUT.header`/`headerRow`/`headerIdentity` name
`.ck-record-header*`: the header declares its own `container-type`;
wide headers lay identity and actions on one wrapping row with a 16rem
identity floor — long names still truncate through the `min-w-0` chain —
narrow headers stack, the record title steps with the same width
(`text-record-title`: 1.5rem narrow, 1.75rem from the 34rem step), and
the header's action cluster groups by control kind over
`LAYOUT.actionGroup`/`actionDivider`, with at most
`HEADER_ACTIONS_INLINE` generated buttons inline before the ellipsis
overflow menu), the form grid
(`LAYOUT.formGrid` names
`.ck-form-grid`: one column under 40rem of container width, two above;
full-span rows opt in with `.ck-span-full`), the record body's fill grids
(`LAYOUT.factsGrid`/`LAYOUT.bodyGrid`: content width is the floor and the
host grants growth — fact groups fill in 22rem-floor tracking columns,
body blocks grow into spare row width under a 46rem content cap, and
`LAYOUT.packRow` packs content-width stubs side by side), and the record
preview hero (`LAYOUT.previewHero`/`LAYOUT.previewHeroBand`: the quiet
glyph band keeps the small stepped ladder — 7rem base, 11rem past the
medium step, 14rem past the wide step — while the card slot keeps the
fixed `LAYOUT.previewBand` stamp). A rendered preview takes the
treatment its content earns: `LAYOUT.previewHeroBandFlow` flows record
prose unframed at the body's 46rem content measure, and
`LAYOUT.previewHeroBandAspect` and `LAYOUT.previewHeroBandContent`
are the framed media region (rounded, hairline border, subtle ground)
that fills the page's free space — viewport-derived height floored at
24rem; a page's viewer fits the frame's width and scrolls inside.
Every other
container-relative
mechanism — the record split and the peer columns — engages through the
container seam alone: `RegionChildren` renders the weight-derived
zero-floored track list (`minmax(0, Nfr)`, so wide content scrolls inside
its column) and engages it when the measured box grants every track its
earned minimum (`trackCount × REGION_COLUMN_EARNED_REM`, generative for
any track count), and `RegionBlock` lays the record body beside the side
column on the 12-track grid the children's weight earns
(`REGION_SIDE_SPANS`) when the wide step's side outcome engages.

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
lists WITH its declared ancestry visible (`containmentAncestors` over
the effective containment contract; materializations render the lineage
breadcrumb trail beside the identity), never
a bare flat pile — class surfaces never nest at all, and containment
navigation is the workspace explorer's (the sidebar nests instances
under their parents through the same `childrenOfParent` matcher); maps
regions to surface kinds (detail main regions at `full`, nested detail at
`detail`, list rows at `row`), attaches resolved surface policy, the
region's data traits (see Arrangement), resolved action records, the
per-region `dataState` (see Data states), the
`listControls` contract for list regions (see Instance shape and list
controls), the per-type `statePolicy` map off the contract (see State
display), and nested child regions. `options.presentation` (`record`
default, `peek`) selects the depth-0 record arrangement: `record`
resolves the document stack (SPEC §22.17), `peek` the ladder. Relation link and unlink actions are
section-scoped (SPEC §22.12): a detail region's records for those kinds
inject into each relation-scoped child region whose `relationKey` and
type match the action's targets, landing on the child node as actions
beside the parent instance reference (`relationParent`) for the row run
context; the parent's own action set keeps a link action no section
consumed. Region nesting is slot-driven and
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

`recordChildSectionKey(region)` keys a record document's child region for
the overlay order (SPEC §26): `relation:<key>` for a relation-scoped
child (the same key the relation's inline chip section carries),
`children:<lineageKey>:<typeId>` for a lineage-scoped one (one edge key
may carry several child types; the key stays unique per section),
`children:<typeId>` for a lineage-less one.
`composeDocumentSections(declaredKeys, overlay)` applies an instance
overlay to the document's declared section keys — the storage contract
and its order law (declared keys append in derivation order when the
authored order omits them; order entries naming nothing drop; stored
blocks their order omits appends) are canonical in the
[instance-overlays feature](../../server/features/instance-overlays/README.md).

## Consumption

- Runtime: [pages/screens/[screenKey].vue](../../pages/README.md) renders
  the compiled UI contract for active processes through the generator —
  auth hydration carries the client bundle and projected actions, and
  `utils/instance-shape.js` (through the instances store) maps entity collections onto the
  instance pool.
- Container measurement: `useContainerTraits`
  ([composables](../../composables/README.md)) is the app-side seam that
  resolves container traits — materializations consume `resolveContainerTraits`
  through it and never measure layout themselves.
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
  showcase rerolls seeds from the URL. The world is what the seed rolls:
  nothing overwrites a rolled type, edge, or count after the fact. The
  only post-roll touches are validity floors — an authored `name`/`glyph`
  per type, at least one `identifier`-flagged field, at least one
  `control` pin, and nullable marking on refs whose target types rolled
  empty — beside a seeded `sourceStatesMatrix` (loading/denied/error, one
  per screen) the showcase applies on demand through `?state=on`.
  Projection and arrangement coverage is a property of rerolling seeds,
  not of stamps. Its spec validates every generated
  instance against CTS `checkValue` and composes every screen across
  seeds. Percent quantities roll within their
  scale so meter and knob presentations show distributions instead of
  clamped saturation.
- Spec: `ui-mapping.spec.js` (table-driven resolver/budget tests),
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
