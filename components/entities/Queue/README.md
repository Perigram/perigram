# COMPONENT: Queue UI

Production queue card and detail surface.

## Files

| File | Purpose |
|---|---|
| `QueueCard.vue` | Entity card wrapper for queue identity, job item totals, output summary, and command actions. |
| `QueueDetail.vue` | Detail page body for artifacts, job composition, consumed source relations, and history. |
| `QueueEntryCard.vue` | Queue-editor cassette entry card with row identity/typed id, thumbnail, quantity, and parameter editing. |
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
- Queue editor cassette rows use `QueueEntryCard`; the component emits quantity
  and parameter updates while `QueueEditor` remains the owner of persistence and
  `_key`-based row deletion. Editable fields come from the canonical queue-item
  `parameters` snapshot, supplemented by the hydrated design's declared
  parameter names. They are not gated by the item's `STATIC`/`PARAMETRIC`
  nesting behavior: a baked design can still be request-locally reevaluated
  when its queued parameter snapshot changes. `T` remains material-owned and
  locked in the editor. These rows keep natural panel height inside the center
  lane grid; the workspace lane owns scrolling.
- The generated/process queue composer exposes Add in the cassette panel header
  beside the view controls. The header action opens a source menu whose entries
  stay separated by producer: existing readable `cassette_design` records use
  the existing-design source, and each process/generated action that currently
  outputs `cassette_design` appears as its own source. The grid contains queue
  entries only; it must not add a fake in-grid Add tile. Add Entry uses
  secondary emphasis because queue composition, rather than source creation, is
  the primary surface.
- Inline quantity and parameter updates persist without emitting the route-level
  `updated` refresh event. The editor retains its local rows while the PUT
  completes, so typing a cassette parameter does not remount the generated
  detail page.
- Queue job item relation rows read `item.entityType` to distinguish
  `cassette_design` from `cassette` template ids. When a process role can read
  the queue but not the related design/template directly, `QueueEntryCard`
  renders a typed id chip with a localized source type and skips protected
  relation fetches instead of calling the wrong endpoint. Explicit legacy
  `entityType: cassette` queue items hydrate from readable cassette templates
  and remain labeled as cassette-template entries; ids without an explicit
  entity type are not reinterpreted as templates.
- Queue editor cassette rows do not use the arbitrary baked
  `cassette_design.identity.name` as their default header. The compact header
  renders the canonical source cassette template from
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
- Queue card summary labels describe `data.job.items` as "Items to Nest"
  (`Позиции раскроя`), meaning cassette/design quantities entering the nesting
  job, not commercial order lines.
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
