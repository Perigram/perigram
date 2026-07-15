# COMPONENT: Nesting

Nesting is a command/task capability, not an entity module. `operations.js`
implements the `solveNesting` command and the registered `nesting.solve` task
executor.

## Execution Contract

1. `solveNesting()` validates the queue and resolves saved job/settings input.
2. It loads the selected machine or the immutable public system default, plus
   the selected tool and material.
3. It resolves stock dimensions/count or virtual sheet dimensions, uses tool
   diameter as item gap, clips usable material to machine offsets, and rejects
   sheets outside the machine work area.
4. It snapshots machine, tool, material, gap, sheet polygon/dimensions/count,
   and material thickness into the task input.
5. It creates a `task_run` and applies the queue `requestNesting` intent with
   `activeTaskRunId` in Status lifecycle data.
6. The task calls the HTTP nesting worker, enriches the returned layout with
   request geometry/layers, persists terminal outputs, and returns declared
   queue transition effects.

There is no `nesting_run` entity, collection, API, compatibility job, or
notification callback. A retry remains the same task execution boundary.
Every terminal task id maps deterministically to one immutable queue nesting
revision, making task completion idempotent.

## Terminal Revision And Outputs

On success, the task canonicalizes each layout before hashing. Equivalent
layouts differ neither by worker bin id nor source ordering, so one
`sheet_design` is created per distinct physical layout. Its output record is:

```js
{
  sheetDesignId,
  layoutHash,
  quantity,
  sheetInstanceIds
}
```

One deterministic `sheet_instance` is created for every required copy. The
sheet design and instances inherit `lineage.queue` with the terminal queue
revision id; instances also have revision-qualified `lineage.sheetDesign`.
The terminal `entity_revision` stores settings, results, layout data, and those
outputs. The queue moves to `REVIEW`; selection is a separate explicit intent.

On final failure, the task creates a failure revision containing the immutable
settings/error snapshot and moves the queue nesting region to `ERROR`. Earlier
retryable failures do not create competing terminal records.

## OCCS And Material Thickness

Queue items are resolved to cassette templates or baked cassette designs.
Selected sheet thickness is injected into OCCS parameter `T` before parametric
baking. A pre-baked design with a conflicting `T` is rejected rather than sent
to the worker with physically inconsistent settings. Source semantic layers
are restored after the geometry-only worker response so sheet previews and DXF
export preserve production meaning.

## Worker Boundary

The algorithm service lives in
[workers/nesting](../../../workers/nesting/README.md). It receives strict
geometry and numeric parameters; persistence, access, Status transitions,
revision creation, and output entity creation remain in the app task executor.

## Related

- [Queues](../queues/README.md)
- [Tasks](../../core/tasks/README.md)
- [Sheet designs](../sheet-designs/README.md)
- [Machines](../machines/README.md)
