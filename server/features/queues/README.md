# COMPONENT: Queues (Production Jobs)

Defines a specific nesting job, bridging the digital production intent with physical material requirements.

## v24 Architecture
- **Job Definition**: Combines `items` (designs to cut) with a `materialPool` (available piles/sheets).
- **Inheritance**: Inherits lineage from the parent `Project`.
- **Status**: Governed by `QueueMachine` (`DRAFT -> NESTING -> READY -> CLOSED`).

## Key Workflows
1. **Job Initialization**: Selecting baked or parametric designs and specifying quantities.
2. **Material Allocation**: Defining which warehouse piles, sheets, or remnants are allowed for the run.
   Queue edits persist these selections as `data.job.materialPool` with source
   ids, labels, dimensions, and available counts.
3. **Transition to Nesting**: Handing off the job to the Nesting Worker moves a
   draft queue to `NESTING`. When the async solver task completes it moves the
   queue to `READY`; final solver failure returns a `NESTING` queue to `DRAFT`.
   A hidden system-only `DRAFT -> READY` recovery transition exists only for
   older completed runs created before queue status synchronization was fixed.
   In
   warehouse mode, selected stock dimensions/counts define the worker sheet
   size and sheet count; mixed sheet sizes are rejected for the current
   one-bin worker contract.
4. **Run Acceptance / Production Output**: When a completed nesting run is
   chosen for production, the parent queue must be `READY` and have assigned
   warehouse material. Selected `PILE` sources are consumed in order up to the
   chosen run's sheet count, and the current pile stock is preflighted before
   any allocation is written so insufficient stock fails without partial
   consumption or changing the run state. Choosing the run also creates
   physical outputs: one milled sheet per consumed stock sheet, remnants when
   the run reports remnant area, and cassette instances from the matching
   generated sheet design cassette counts. Output ids are recorded on
   `data.physicalOutputs`. The queue stays `READY`; there is no queue-level
   `CUT` state.

## Notes
- Nesting runs are stored in `nesting_runs` collection (linked by `lineage.queueId`), not embedded in the queue.
## Data Structure
```typescript
{
  identity: { name, queueNumber },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, projectId },
  job: {
    items: Array<{ designId, quantity, parameters }>,
    materialPool: Array<{ type, id, label, specs, dimensions, available }>
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
