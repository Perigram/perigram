# COMPONENT: Queues (Production Jobs)

Defines a specific nesting job, bridging the digital production intent with physical material requirements.

## v24 Architecture
- **Job Definition**: Combines `items` (baked cassette designs to cut) with a
  `materialPool` (available piles/sheets/remnants).
- **Nesting Settings**: Stores queue-local nesting configuration in
  `data.nestingSettings`; each `nesting_run` stores the immutable execution
  snapshot under `data.params`. Settings include material mode, selected
  machine id, selected tool profile id, virtual sheet dimensions/thickness, and
  selected inventory sources.
- **Inheritance**: Queues may be organization-root or inherit lineage from a
  parent `Project` when a project id is provided.
- **Status**: Governed by `QueueMachine` (`DRAFT -> NESTING -> READY -> CLOSED`,
  with `ARCHIVED` available from any queue state).

## Key Workflows
1. **Job Initialization**: Baked cassette designs are selected with quantities.
   Parametric templates must be baked into a concrete
   `cassette_design` before they enter a queue.
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
4. **Run Acceptance / Production Output**: When a readable completed nesting
   run is chosen, the queue must expose the `completeNestingProduction` intent
   in its active workflow and must not already have production output for a
   different run. The preflight checks assigned warehouse material, selected
   pile availability, and run-owned sheet twins before any allocation or status
   write happens. Selected `PILE` sources are consumed in order up to the
   chosen run's sheet count. Choosing the run also creates physical outputs:
   one milled sheet per consumed stock sheet, remnants when the run reports
   remnant area, and cassette instances from the matching generated sheet
   design cassette counts. Output ids are recorded on `data.physicalOutputs`.
   The queue choose-run API delegates to the generic status transition so
   status controls and API callers share the same side effects, while the
   status hook emits the queue-production effect instead of mutating the queue
   directly.
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
- Queue composition is the declared many-valued `relations.cassettes`
  relationship. Every reference targets a real `cassette_design`; adding an
  entry creates or imports that design first and then links it. Design
  parameters and editable OCCS provenance stay on the design. The matching
  `data.job.items` association stores only queue-local production quantity;
  relation creation defaults it to one and copy-on-write design replacement
  preserves it. Nesting reads the related designs and their queue quantities,
  then applies selected material thickness as a request-local parameter overlay
  without mutating either entity.
- `listPreviewByProjects(projectIds, ..., { limit })` returns access-redacted,
  summary-oriented queue previews keyed by parent project id. `/api/project`
  uses this to attach `summary.queuePreview` for the `/projects` route without
  requiring the frontend to issue one queue request per project card.

## Notes
- Nesting runs are stored in `nesting_runs` collection (linked by `lineage.queueId`), not embedded in the queue.
- Queue production output points to one current run through
  `data.materialConsumption.runId` and `data.physicalOutputs.runId`. UI
  workspaces should treat that run as the queue's accepted output revision; if
  no run has been accepted yet, the latest readable run is the active proposal.
  Full run history remains queryable through `nesting_runs` APIs instead of
  being rendered as the queue's primary production state.
## Data Structure
```typescript
{
  identity: { name, queueNumber },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, projectId? },
  job: {
    items: Array<{ id, entityType: 'cassette_design', type, quantity, parameters }>,
    materialPool: Array<{ type, id, label, specs, dimensions, available, sheetPolygon? }>
  },
  nestingSettings: {
    materialMode: 'VIRTUAL' | 'WAREHOUSE',
    virtualWidth: number,
    virtualLength: number,
    spacing: number,
    warehouseId?: string,
    inventoryItems: string[],
    machineId?: string,
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
