# COMPONENT: Queues (Production Jobs)

Defines a specific nesting job, bridging the digital production intent with physical material requirements.

## v24 Architecture
- **Job Definition**: Combines `items` (designs to cut) with a `materialPool` (available piles/sheets).
- **Nesting Settings**: Stores queue-local nesting configuration in
  `data.nestingSettings`; each `nesting_run` stores the immutable execution
  snapshot under `data.params`.
- **Inheritance**: Queues may be organization-root or inherit lineage from a
  parent `Project` when a project id is provided.
- **Status**: Governed by `QueueMachine` (`DRAFT -> NESTING -> READY -> CLOSED`,
  with `ARCHIVED` available from any queue state).

## Key Workflows
1. **Job Initialization**: Selecting baked or parametric designs and specifying quantities.
2. **Material Allocation**: Defining which warehouse piles, sheets, or remnants are allowed for the run.
   Queue edits persist these selections as `data.job.materialPool` with source
   ids, labels, dimensions, and available counts.
3. **Transition to Nesting**: Handing off the job to the Nesting Worker now
   uses the `requestNesting` intent to move a domain draft queue to `NESTING`
   when the active queue workflow exposes that intent. Process-authored queue
   workflows may keep the queue in a custom status while the generated
   `nesting_run`, task run, and compatibility `nesting_job` represent solver
   progress. When the async solver task completes, the generated `nesting_run`
   becomes `COMPLETE`; domain queues that entered `NESTING` stay there until an
   operator chooses a completed run for production. Final solver failure
   transitions the nesting run through declared effects, and only transitions
   the queue when the active queue workflow has the matching effect path. In
   warehouse mode, selected stock
   dimensions/counts define the worker sheet size and sheet count; mixed sheet
   sizes are rejected for the current one-bin worker contract.
   The queue nesting API derives command parameters from saved
   `data.nestingSettings` plus `data.job.materialPool`; callers only send
   optional setting updates or attachment requests. Generated process queue
   details may also start nesting through a manual `solveNesting` process
   action, but only when the generated screen resolver finds that action in the
   current user's compiled action manifest for the opened queue. In that path,
   transient material/tool parameters are sent directly to the command action
   while queue job/settings persistence remains guarded by `queues:write`.
4. **Run Acceptance / Production Output**: When a completed nesting run is
   transitioned to `CHOSEN`, the parent queue must be awaiting selection
   (`NESTING`) or already `READY` for an idempotent same-run response, and it
   must have assigned warehouse material. Selected `PILE` sources are consumed
   in order up to the chosen run's sheet count, and the current pile stock is
   preflighted before any allocation is written so insufficient stock fails
   without partial consumption or changing the run state. Choosing the run also
   creates physical outputs: one milled sheet per consumed stock sheet, remnants
   when the run reports remnant area, and cassette instances from the matching
   generated sheet design cassette counts. Output ids are recorded on
   `data.physicalOutputs`, and the queue transitions to `READY` only after that
   run is chosen. The queue choose-run API delegates to the generic status
   transition so status controls and API callers share the same side effects,
   while the status hook emits the queue-production effect instead of mutating
   the queue directly.
   There is no queue-level `CUT` state.
5. **Archiving / Removal**: Queue status controls can transition any queue state
   to `ARCHIVED`; destructive deletion remains an entity removal action guarded
   by queue delete/admin access through `DELETE /api/queue/:id`.

## Read Model Helpers

- `list(filters, ...)` backs the canonical organization-level queue collection
  endpoint `GET /api/queue`. It applies organization lineage filtering and then
  per-queue `queues:read` access before field redaction, so generated process
  screens can load queue collections without calling missing plural routes.
  `primaryStatus` filters one queue state and comma-separated
  `primaryStatuses` filters several role-local status windows for generated
  process screens.
- `create(data, ...)` accepts an optional `projectId`. When present, the queue
  inherits project lineage and updates project queue summaries. When absent,
  the queue is created under organization lineage only, which lets
  process-authored organizations use queues without introducing a project
  entity into the process graph.
- `create(data, ...)` and `update(id, { job })` normalize
  `data.job.items[]` at the service boundary. Each persisted queue item keeps
  `id` as the source entity id, `entityType` as `cassette_design` or
  `cassette`, `type` as the nesting behavior (`STATIC`/`PARAMETRIC`),
  `quantity`, and `parameters`. Producers must submit the canonical
  `id + entityType` pair; ambiguous cassette/design aliases belong only in
  one-time data migrations.
  A queue is a consumer of baked cassette designs, not the parent/source for
  creating them. Process graphs should first create a `cassette_design` from a
  cassette template, then add that design id to `data.job.items[]` through a
  queue update/action.
- `listPreviewByProjects(projectIds, ..., { limit })` returns access-redacted,
  summary-oriented queue previews keyed by parent project id. `/api/project`
  uses this to attach `summary.queuePreview` for the `/projects` route without
  requiring the frontend to issue one queue request per project card.

## Notes
- Nesting runs are stored in `nesting_runs` collection (linked by `lineage.queueId`), not embedded in the queue.
## Data Structure
```typescript
{
  identity: { name, queueNumber },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, projectId? },
  job: {
    items: Array<{ id, entityType: 'cassette_design' | 'cassette', type, quantity, parameters }>,
    materialPool: Array<{ type, id, label, specs, dimensions, available, sheetPolygon? }>
  },
  nestingSettings: {
    materialMode: 'VIRTUAL' | 'WAREHOUSE',
    virtualWidth: number,
    virtualLength: number,
    spacing: number,
    warehouseId?: string,
    inventoryItems: string[],
    toolProfileId?: string,
    requestedArtifacts: string[]
  },
  materialConsumption?: {
    runId,
    requiredSheets,
    consumedAt,
    sources: Array<{ type: 'PILE', id, count }>
  },
  physicalOutputs?: {
    runId,
    sheetIds: string[],
    remnantIds: string[],
    cassetteInstanceIds: string[]
  }
}
```
