# COMPONENT: Queue UI

Production queue card and detail surface.

## Files

| File | Purpose |
|---|---|
| `QueueCard.vue` | Entity card wrapper for queue identity, job item totals, output summary, and command actions. |
| `QueueDetail.vue` | Detail page body for artifacts, job composition, consumed source relations, and history. |
| `QueueEntryCard.vue` | Queue-editor cassette card with parent-template identity, inline design parameters, queue-local quantity, and remove controls. |
| `QueueSourceCard.vue` | Compact queue-editor material source tile with deterministic SVG preview, identity, dimensions, and count. |

## Contract

- Expects a `queue` DTO with `status`, `lineage`, `data.job`, `data.materialConsumption`,
  and `summary`.
- `EntityCard`/`EntityPage` own identity, trace, and status placement.
- Artifact and consumed material relations render through `EntityInlineRef`.
- Available material source context is owned by nesting runs; queue cards do not
  render material availability summaries.
- Running nesting is a queue command action surfaced through page/header
  actions; material selection remains owned by `QueueEditor`.
- Queue delete commands are rendered outside the status rail. Compact queue
  cards keep command buttons in the card body, while the queue detail page
  exposes feature commands in the header actions slot. Queue lifecycle reset
  transitions come from `EntityStatus` through the workflow/status API.
- The queue editor passes command actions to `QueueCard` through the
  `commandActions` prop so lifecycle transitions and non-status commands stay
  separated by name as well as placement.
- Selector surfaces pass `expandable=false` and `density=dense` so clicking the
  compact card selects the queue without opening the `EntityCard` popover or
  using full card padding. Queue number prefixes and the full queue data block
  render only on full queue cards.
- Queue relations remain typed design references and never carry parameter or
  quantity overrides. The queue card displays OCCS parameters inline. When the
  active process exposes the queue's Link action with an embedded
  cassette-design creator, saving those fields bakes a new immutable design and
  atomically replaces only that queue reference; it never mutates a design that
  another queue may use. Quantity is independent queue association data stored
  in `data.job.items` and survives design replacement.
- The generated/process queue composer exposes Add in the cassette panel header
  beside the view controls. The header action opens a source menu whose entries
  stay separated by producer: existing readable `cassette_design` records use
  the existing-design source, and each process/generated action that currently
  outputs `cassette_design` appears as its own source. The grid contains queue
  entries only; it must not add a fake in-grid Add tile. Add Entry uses
  secondary emphasis because queue composition, rather than source creation, is
  the primary surface.
- Queue job item relation rows read `item.entityType` to distinguish
  `cassette_design` from `cassette` template ids. When a process role can read
  the queue but not the related design/template directly, `QueueEntryCard`
  renders a typed id chip with a localized source type and skips protected
  relation fetches instead of calling the wrong endpoint. Explicit legacy
  `entityType: cassette` queue items hydrate from readable cassette templates
  and remain labeled as cassette-template entries; ids without an explicit
  entity type are not reinterpreted as templates.
- Queue editor cassette rows never render `cassette_design.identity.name`. The
  compact header renders only the canonical source cassette template from
  `provenance.derivedFrom.source` as a non-interactive inline
  `EntityInlineRef`, followed by quantity and remove controls. Designs without
  cassette-template provenance fall back to their typed source id. Missing
  design hydration only probes rows that may be `cassette_design`; explicit
  legacy `entityType: cassette` rows must not be fetched from
  `/api/cassette-designs/:id`.
- Grid-mode queue entries use the bounded repeated-item grid. Each card has a
  finite maximum inline size, and additional container width creates more
  tracks instead of stretching existing cards indefinitely. The cassette
  thumbnail remains constrained but preserves the standard cassette preview
  layers, including dimension annotations; card sizing must not suppress
  drawing information. It uses a fixed square frame whose complete SVG is
  fitted inside the frame and spans the card's left column. The right column
  owns the template/quantity header and parameters below it. Each parameter
  label sits inline with its input rather than consuming a separate label row.
  Because PrimeVue `Panel` always renders its header container, the entry card
  hides that unused container so content begins at the card's top padding
  instead of reserving an empty header band.
- In generated process queue details, cassette producer actions come from the
  current user's compiled action manifest and must expose a current
  `contracts.outputs[]` entry for `cassette_design`. QueueEditor does not
  accept legacy output shapes. The available Add menu is resolved from the
  domain producer registry: existing readable cassette designs, readable
  library cassette templates that can be baked, DXF/artifact import, and any
  additional compiled process action that outputs `cassette_design` remain
  separate menu sources. Existing readable cassette designs are a separate
  source producer: selecting one in process mode appends through the
  active-process queue item endpoint, which delegates to queue `processUpdate()`
  instead of using the generic queue PATCH path. Process DXF import receives
  queue context through the same process action execution body so the produced
  design is appended by the action boundary rather than by a generic queue
  patch.
- The library cassette source prompts for the readable `library` container
  first, then loads cassette templates scoped to that `lineage.libraryId`.
  QueueEditor must not hide library templates behind project relation filters
  when the active source is explicitly "from library". The cassette Add action
  remains visible but loading/disabled until its library, template, and design
  source collections are ready; opening the producer can therefore never
  capture a transient empty option set during initial queue hydration.
- Process cassette-design producers whose construction mode supports server
  default cassette-template resolution must not block the Add button on an
  unreadable or empty template selector. If no selectable template options are
  visible to the process role, QueueEditor omits that field and lets the active
  process action resolve its default constructable template on the server while
  still sending the current material thickness as parameter `T`.
- Queue card summaries count `relations.cassettes` as designs to nest and sum
  the matching queue-local `data.job.items[].quantity` values. Each relation
  points to one real cassette design; quantity belongs to the queue entry and
  is passed to nesting without being copied onto or into that design.
- Selecting a `QueueEntryCard` is local editor state for the queue association,
  never an Explorer entity. A selected readable `cassette_design` can be opened
  for inspection through the generated workspace event path. Its source
  `cassette` template may open in the registered cassette designer only with
  cassette write access. These actions do not mutate the selected design;
  configuration continues to use the compiled replacement relation action.
- Queue editor selected warehouse sources use compact `QueueSourceCard` tiles
  instead of embedding pile/sheet/remnant cards. It draws remnant polygons when
  present and rectangular sheet previews for stock sources without stored
  geometry.
- Queue editor nesting output is a current-output surface, not a run-history
  browser. It renders the accepted production run from
  `queue.data.materialConsumption.runId` / `queue.data.physicalOutputs.runId`
  when present, otherwise the latest readable run while a queue is still being
  solved or reviewed. Historical runs stay in the `nesting_runs` collection but
  are not all shown as selectable revisions in the production workspace.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/queues/README.md](../../../server/features/queues/README.md)
