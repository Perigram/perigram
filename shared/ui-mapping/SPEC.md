```yaml
doc_id: UI-MAPPING-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-25
updated: 2026-10-25
```

# SPEC: UI Mapping — Arrangement Foundations

Target state of the generative UI's arrangement subsystem: the trait
records it is founded on, the decision procedure that places content, and
the placement rules that pick presentations. The owner direction is root
[SPEC.md](../../SPEC.md) §22.7; current reality is
[README.md](./README.md). Parent: [shared/SPEC.md](../SPEC.md).

## What it is

The engine composes one region tree per compiled screen and materializes
it in any host. Arrangement is the subsystem deciding, for every node of
that tree, how it shares space with its siblings and how its content is
sized. It consumes exactly two inputs and derives everything else:

- the node's **data traits** — what the content is, derived compose-time in
  the pure contract;
- the host's **container traits** — where the content renders, resolved at
  the materialization seam.

Type ids, host names, and component internals reach no arrangement
decision. The decision procedure is pure, deterministic, and total: every
input combination resolves exactly one arrangement.

Decisions happen in two phases. **Compose-time**, the region tree carries
each node's data traits and its arrangement as data for every width step —
one composed tree serves every host. **Engage-time**, the materialization
resolves the host's container traits and engages the step the host grants;
a host change (a pane dragged narrow, a viewport resized) re-engages
without recomposition, and only a data change recomposes.

## Data traits

One frozen record per composed region node, derived in `composeScreen`
pure over the type record and the loaded pool, re-derived when the pool
changes — the same lifecycle `dataState` and `listControls` ride today. A
data trait reads declarations and instances; it reads the DOM at no phase.

| Trait | Domain | Derives from | Consumed by |
|---|---|---|---|
| `weight` | row units (number) | estimated rendered height: facts, structural fields, relation chips; list row factors × instance counts at the derived size class | the ladder, side-rail spans, tab order, surface budgets |
| `breadth` | `chip` \| `content` \| `full` | intrinsic width demand, from the resolved list layout kind and field shapes; detail bodies are `content`, ref/scalar sets are `chip`, table/board/gantt/calendar/canvas surfaces are `full` | row claiming, packing, column engagement |
| `volume` | instance count (number) | the pool | budgets, the pagination threshold, size classes |
| `shape` | `media` \| `temporal` \| `stateful` \| `prose` \| `measure` \| `plain` | the type-shape analysis signals, named | list layout resolution, preview policy |
| `filledness` | `filled` \| `inert` | a list source with zero loaded instances; a field no loaded instance fills | ladder participation, stubs, list controls |
| `growth` | `flowing` \| `bounded` | the resolved layout kind under its budgets: surfaces that scroll or page past a budget are `bounded`; sections, fact strips, and small lists are `flowing` | scroll ownership, host fit |

Breadth semantics:

- `chip` — row-scaled references, scalars, and tags; packs in wrap rows and
  never widens its row past what the values fill.
- `content` — reads at its own width up to the content cap; packs beside
  peers when the host grants the width.
- `full` — demands the whole row to stay readable; claims the row and
  scrolls or pages inside it.

Growth semantics: `flowing` content grows its parent's flow; `bounded`
content owns a scroll inside its box once past its budget, wherever it
renders.

## Container traits

One record per host box, resolved at the materialization seam — the only
place layout measurement lives. The pure contract consumes the resolved
record as plain data.

| Trait | Domain | Meaning |
|---|---|---|
| `width` | one step of the width-step table (`narrow` \| `medium` \| `wide`) | the host box's width class, in rem steps named in the layout vocabulary |
| `height` | `bounded` \| `flow` | a bounded host clips (pane, dialog, popup); a flow host grows (routed page, mobile tab) |
| `scroll` | `surface` \| `page` | which box scrolls when content overflows |
| `density` | the spacing coefficient (0.5–2) | the rhythm scale the whole screen rides |

Host profiles are fallbacks; the measured box is the truth — a pane
dragged narrow renders the narrow arrangement, whatever its host kind:

| Host | Default profile |
|---|---|
| Routed page | `flow`, page scroll, `wide`/`medium` by viewport |
| Workspace pane | `bounded`, surface scroll, width from the user's split |
| Dialog | `bounded`, surface scroll, `medium`/`narrow` by dialog sizing |
| Popup | `bounded`, `narrow` |
| Mobile tab | `flow`, page scroll, `narrow` |

Every container-relative mechanism — the sanctioned scoped-CSS container
homes, the `ResponsiveGrid` container queries, the measured track
engagement — materializes the same step vocabulary the seam resolves. A
surface declaring its own breakpoint set is a defect.

Hosts declare their profile through the seam: the pane and popup hosts
measure themselves and provide the resolved record, fixed-shape hosts
provide their profile, and the page profile is the default a surface
resolves with no provider. Fragments measure where they render (the
peer-column engagement). Budgets consume the provided record: a `narrow`
or `medium` host sheds table columns and card facts through the compact
budgets — a surface sized for its host, every host.

Density derives from the host record: bounded hosts — panes, popups —
ride the compact rhythm; pages and dialogs ride the neutral page rhythm.
A screen whose composed weight passes the density budget tightens
one step, floored at the tightest — the rhythm is data-aware. An
explicit host coefficient (the design-lab slider) overrides the
derivation.

## Layout language

Every generated surface composes from one closed vocabulary of layout
atoms. Traits select atoms and derive their parameters; an atom owns one
rendering concern; every layout mechanism in the app is an atom instance.
A layout mechanism the vocabulary covers at no atom is a defect; one the
vocabulary cannot express is a pin (see Pins) recorded here when admitted.

### Atoms

| Atom | Carries | Parameter derivation | Materialization home |
|---|---|---|---|
| `stack` | vertical flow on the rhythm scale | gap from the density coefficient; tight rhythm for embedded surfaces | `LAYOUT.stack`/`stackTight` over the spacing scales |
| `row` | horizontal wrap at content width | items pack and wrap freely | `LAYOUT.row`/`rowBetween`/`chipRow` |
| `grid` | track-derived columns | `earned`: track fr from sibling weights, zero-floored, engaging when the measured box grants every track its earned minimum · `floor`: auto-fill at a content floor while the host grants growth · `steps`: fixed columns per width step | `RegionChildren` tracks and the record split (earned); `.ck-facts-grid`/`.ck-body-grid` (floor); `.ck-form-grid` (steps) |
| `band` | a full-width strip whose height steps with its container | steps from `CONTAINER_WIDTH_STEPS` | `.ck-preview-hero` |
| `well` | an inset cell one step above the canvas | a bounded well owns its scroll | `LAYOUT.boardColumn*`, `calendarCell`, `ganttTrack`, `LAYOUT.well` |
| `tabs` | the page-height bound arrangement | descending weight order | PrimeVue Tabs in `RegionChildren` |
| `placement` | a slot that measures its own box | width is the placement box; height/scroll/density inherit the host record | `PlacementBox` |
| `stub` | the inert one-line claim | the create affordance alone, packed at the surface foot | `RegionBlock` stub slot |
| `pack` | content-width side-by-side | inert stubs pack in a wrap row | `RegionChildren` `pack` |

The atom registry in `tables.js` (`LAYOUT_ATOMS`) assigns every
`LAYOUT` recipe to its atom; the engine specs pin the partition, so the
vocabulary stays closed by guard. Typography rides the role tokens and
the spacing coefficient scales every rhythm; these are ambient, and
atoms compose under them.

### Composition rules

1. A value renders as a cell (`InlineField`); measured values carry the
   mono face with tabular figures.
2. A fact row pairs a label cell and a value cell; a fact group fills in
   floor-grid tracking columns; a collapsed group carries its show-more
   control.
3. A rich structural value renders as an open labeled section; simple
   structural rows share the fact grammar.
4. Relation references render as budgeted chip rows; a child region
   covering the relation owns that surface.
5. The record body is a floor grid: blocks render at content width and
   grow into the width the host grants; the preview renders in a band.
6. Record children arrange through the ordered ladder (Arrangement
   decision procedure); the record page's `wide` step may claim a side
   rail — a two-track earned grid of body and weight-spanned rail.
7. Screen sections arrange through the same ladder.
8. A bounded-growth surface owns its scroll inside whatever atom renders
   it; flowing content rides the host's scroll column.
9. A surface inside a placement sizes to the placement box: step
   engagement, compact budgets, and column scales resolve against the
   nearest container record.

## Arrangement decision procedure

`arrange(siblings, container)` — one ordered rule list; rules apply in
order and earlier decisions bind later ones; the last rule is terminal, so
resolution is total. For a sibling set (a record page's children, a
screen's sections, a tab panel's content):

1. **Inert partition.** `filledness: inert` siblings leave the arrangement
   and render as compact stubs after the arranged content — at every
   level: record children and screen sections alike. A section whose
   resolved state is `loading`, `denied`, or `error` keeps its state
   surface inside the arrangement.
2. **Full-row claim.** `breadth: full` siblings claim the whole row in flow
   order at every width step; in `bounded` hosts they carry their own
   scroll.
3. **Dominant child.** A sibling holding at least `DOMINANT_CHILD_SHARE` of
   total weight keeps the vertical flow; the remainder arranges after it
   within `SURFACE_ROW_BUDGET`, else tabs in descending weight order.
4. **Side rail.** At `wide`, a light child set of combined weight at
   or under `SIDE_MAX_WEIGHT` rides beside the record body while the body
   carries at least the rail's weight — a body lighter than its rail
   keeps the children below at full width. The side column earns its
   span by weight (`REGION_SIDE_SPANS`).
5. **Peer columns.** Siblings each at or under `COLUMN_MAX_WEIGHT` share
   proportional columns (track fr from each child's weight); the columns
   engage when the measured host grants every track its earned minimum
   (`trackCount × REGION_COLUMN_EARNED_REM`), else stack.
6. **Tabs.** A set over the arrangement budgets with a sibling past the
   column cap tabs in descending weight order. Tabs sit at any tree
   level; a tab arrangement at a step excludes tabs in its descendants
   at that step — a sibling set inside a tab stacks (root SPEC §22.1,
   owner direction 2026-10-26).
7. **Stack.** The terminal arrangement: content-height blocks in flow
   order.

The `width` step gates rules 4–5: `narrow` hosts skip them and stack. The
composed tree carries the outcomes of all engaged steps, so engagement is
a selection among carried arrangements, never a recomposition.

A screen's top-level sections arrange through the same ordered rules:
multi-section screens share proportional columns when the sections'
weights grant them and tab when the set exceeds the budget — one ladder
for screens and record children alike.

## Intrinsic sizing

- Width follows breadth, and content width is the floor while the host
  grants growth: `chip` packs in wrap rows; `content` renders at content
  width and grows into spare host width (fact groups fill in columns,
  sections share the row); `full` keeps the row. Nothing stretches past
  what its content fills in a column narrower than the host.
- Height follows weight. Vertical placement derives from weights, and
  budgets cap exposed cardinality (show-more, pagination, bounded scroll),
  so no surface grows without bound.
- Minima hold readable content: tracks zero-floor (`minmax(0, Nfr)`) so
  wide content scrolls inside its column; label chains truncate through
  the `min-w-0` chain. Nothing is squeezed below its content's minimum.
- The record preview scales with its container: the fixed-height band is
  the card slot's anatomy; the record body's band steps up with the host
  width through the sanctioned container home.
- Scroll ownership: `bounded`-growth content scrolls in its own box
  wherever it renders; `flowing` content in a `flow` host grows the page;
  `flowing` content in a `bounded` host rides the host's scroll column.

## Placement-aware composition

The container picks the child's variant (`full`/`detail` editor family,
`row`/`inline` display family — the existing law). Placement picks the
presentation: a node's slot decides how it renders.

| Slot | A list node renders | A detail node renders |
|---|---|---|
| Page body | its resolved layout at full width, budgets open | the record body (header, packed facts and sections) |
| Side rail | bounded list, tight budgets | card variant, capped facts |
| Column peer | its resolved layout at proportional width, medium budgets | card variant |
| Tab panel | its resolved layout at full width | card/section variant |
| Row | chip row or dense row, tight budgets | row variant, budgeted fields |
| Stub | the create affordance alone | packed at the surface foot |

Composition recursion terminates at the reference: a class reference
inside another component's surface renders as an instance chip — the
shared inline ref with inspect-and-open behavior — for ref field values,
relation references, and table relation cells alike. A record surface
renders at its own page, pane, dialog, or popup level, and opening a
chip is navigation to that surface; the one in-place composition of a
record inside another surface is the handful collection's record card
(root SPEC §22.16) — a collection of fewer than three loaded
instances renders each item as its detail card, the identity opening
the record's page.

## Surface context laws (owner direction 2026-10-26)

- The containment cross-cut composes on unscoped class lists only. A
  collection scoped inside its parent — relation, lineage, or
  screen-pinned filters — renders its rows bare: the surrounding surface
  already states the parent.
- The identifier field is the identity slot: it renders once per surface
  as the title (header, card, row identity), and fact rows never repeat
  it — generated surfaces and the design-system fact contract alike.
- The card grid serves preview-dominated collections: a payload
  type whose declared preview renders visually. Every
  other collection resolves its shape-derived layout.

## Field I/O law (owner direction 2026-10-28)

Raw JSON is not a UI vocabulary: field display renders structural
summaries, field input renders typed controls.

- A schemaless `json` field is machine data: every variant renders its
  read-only structural summary. Human authoring of such values belongs
  to dedicated surface editors.
- A `map` field edits as key-value rows: each value cell resolves its
  control from the declared `itemType`, else from the value's own type;
  a nested value renders its read-only summary.

## Pins

Derivation is the default. A presentation the trait vocabulary cannot
express is pinned as data through the declared seams — authored
declarations (`control`, render policy, preview modes) or
`createUiMapping` overrides with narrow matchers (`type`, `preview`,
`actionKind`). Every layout threshold is a named constant in the one
budget and layout table. A type-keyed layout branch in app code, a
component-local layout magic number, and a private breakpoint set are
defects. A pin admitted because a concrete need defeats the vocabulary
records its justification in this SPEC.

## End state

- Every arrangement decision consumes the two trait records; the decision
  procedure and its thresholds live single-homed in the pure contract.
- The container seam is the one measurement path; every
  container-relative mechanism materializes the step vocabulary.
- Engine specs pin totality: the random-world generator composes screens
  across seeds, and every composed tree resolves an arrangement at every
  width step.
- One composed tree serves every host; a host change re-engages without
  recomposition.
