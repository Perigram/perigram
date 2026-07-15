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
  `_key`-based row deletion. These rows keep natural panel height inside the
  center lane grid; the workspace lane owns scrolling.
- The generated/process queue composer exposes Add in the cassette panel header
  beside the view controls. The header action opens a source menu whose entries
  stay separated by producer: existing readable `cassette_design` records use
  the existing-design source, and each process/generated action that currently
  outputs `cassette_design` appears as its own source. The grid contains queue
  entries only; it must not add a fake in-grid Add tile.
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
- Queue editor cassette rows render the hydrated `cassette_design` identity in
  the panel header, or a typed id chip when the design cannot be read. They do
  not nest `EntityInlineRef` popovers or full relation cards inside the row
  header. Missing design hydration only probes rows that may be
  `cassette_design`; explicit legacy `entityType: cassette` rows must not be
  fetched from `/api/cassette-designs/:id`.
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
  when the active source is explicitly "from library".
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
