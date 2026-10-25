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
| `volume` | instance count (number) | the pool | budgets, pagination and virtualization thresholds, size classes |
| `shape` | `media` \| `temporal` \| `stateful` \| `prose` \| `measure` \| `plain` | the type-shape analysis signals, named | list layout resolution, preview policy |
| `filledness` | `filled` \| `inert` | a list source with zero loaded instances; a field no loaded instance fills | ladder participation, stubs, list controls |
| `growth` | `flowing` \| `bounded` | the resolved layout kind under its budgets: surfaces that scroll or page past a budget are `bounded`; sections, fact strips, and small lists are `flowing` | scroll ownership, host fit |

Breadth semantics:

- `chip` — row-scaled references, scalars, and tags; packs in wrap rows and
  never widens its row past what the values fill.
- `content` — reads at its own width up to the content cap; packs beside
  peers when the host grants the width.
- `full` — demands the whole row to stay readable; claims the row and
  scrolls, pages, or virtualizes inside it.

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

## Arrangement decision procedure

`arrange(siblings, container)` — one ordered rule list; rules apply in
order and earlier decisions bind later ones; the last rule is terminal, so
resolution is total. For a sibling set (a record page's children, a
screen's sections, a tab panel's content):

1. **Inert partition.** `filledness: inert` siblings leave the arrangement
   and render as compact stubs after the arranged content.
2. **Full-row claim.** `breadth: full` siblings claim the whole row in flow
   order at every width step; in `bounded` hosts they carry their own
   scroll.
3. **Dominant child.** A sibling holding at least `DOMINANT_CHILD_SHARE` of
   total weight keeps the vertical flow; the remainder arranges after it
   within `SURFACE_ROW_BUDGET`, else tabs in descending weight order.
4. **Side rail.** At `wide`, a stack-mode child set of combined weight at
   or under `SIDE_MAX_WEIGHT` rides beside the record body; the side column
   earns its span by weight (`REGION_SIDE_SPANS`).
5. **Peer columns.** Siblings each at or under `COLUMN_MAX_WEIGHT` share
   proportional columns (track fr from each child's weight); the columns
   engage when the measured host grants every track its earned minimum
   (`trackCount × REGION_COLUMN_EARNED_REM`), else stack.
6. **Tabs.** A set over the arrangement budgets tabs in descending weight
   order (`CHILDREN_TABS_AT` at screen level, `childrenModeFor`).
7. **Stack.** The terminal arrangement: content-height blocks in flow
   order.

The `width` step gates rules 4–5: `narrow` hosts skip them and stack. The
composed tree carries the outcomes of all engaged steps, so engagement is
a selection among carried arrangements, never a recomposition.

## Intrinsic sizing

- Width follows breadth. `chip` packs in wrap rows; `content` renders at
  content width under the declared cap (sections cap at
  `fit-content(46rem)`); `full` keeps the row. Nothing stretches to fill
  width its content does not need.
- Height follows weight. Vertical placement derives from weights, and
  budgets cap exposed cardinality (show-more, pagination, bounded scroll),
  so no surface grows without bound.
- Minima hold readable content: tracks zero-floor (`minmax(0, Nfr)`) so
  wide content scrolls inside its column; label chains truncate through
  the `min-w-0` chain. Nothing is squeezed below its content's minimum.
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
| Stub | one compact line: label, count, its own create action | one compact line |

Composition recursion terminates at the reference: a class reference
inside another component's surface renders as an instance chip — the
shared inline ref with inspect-and-open behavior — for ref field values,
relation references, and table relation cells alike. A record surface
renders only at its own page, pane, dialog, or popup level; opening a chip
is navigation to that surface, and a full record composes inside another
record's surface at no placement.

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
