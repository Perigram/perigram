# COMPONENT: Queues (Production Jobs)

A queue owns editable production input and a Status-controlled nesting
lifecycle. It does not embed solver attempts or generated sheet output.

## Entity Contract

```js
{
  identity,
  origin,
  status: {
    state: {
      primary: 'DRAFT',
      active: { main: 'DRAFT', nesting: 'IDLE' },
      regions: { nesting: { state: 'IDLE', path: ['IDLE'] } }
    },
    lifecycle: {
      data: {
        activeTaskRunId: null,
        latestRevisionId: null,
        selectedRevisionId: null,
        settings: null
      }
    }
  },
  lineage: {
    organization: { entityType: 'organization', entityId },
    project?: { entityType: 'project', entityId, revisionId? }
  },
  data: {
    queueNumber,
    job: {
      items: [{ id, entityType, type, quantity, parameters }],
      materialPool: [{ type, id, dimensions, available, sheetPolygon? }]
    },
    nestingSettings: {
      materialMode,
      virtualWidth,
      virtualLength,
      sheetThickness,
      warehouseId,
      inventoryItems,
      toolProfileId,
      machineId,
      materialId
    }
  },
  summary
}
```

`data.nestingSettings` is editable input. Active task ids, attempt history,
selection, and nesting state belong to Status or immutable revisions and must
not be duplicated under `data`.

## Nesting Attempts And Selection

The queue workflow has a parallel `nesting` region:

`IDLE -> RUNNING -> REVIEW -> SELECTED`, with `RUNNING -> ERROR` and retry
transitions back through `RUNNING`. `requestNesting`,
`nestingSolveCompleted`, `nestingSolveFailed`, and
`selectNestingRevision` are workflow intents applied by the Status service.

The command creates a live `task_run`. A terminal task creates exactly one
immutable queue `entity_revision` with `data.scope: "nesting"`, success or
failure outcome, settings snapshot, results, layout data, and output refs.
Successful revisions may be selected explicitly through
`POST /api/queue/:id/choose-revision`. Only a successful revision owned by that
queue is selectable. `status.lifecycle.data.selectedRevisionId` is the sole
current-output pointer, and queue UI fetches sheet designs using both queue id
and that revision id.

## Generated Cassette-Design Producers

Queue input creation is process-driven. A manual action becomes an “add
cassette design” option only when:

1. it declares a `cassette_design` entity output; and
2. that exact action id is placed in the active user's compiled queue-detail
   region.

The server revalidates the screen, region, and action placement before binding
declared output refs into `data.job.items`. This supports DXF import, baking
from a cassette template, copying from a library, or future facade-derived
producers without hardcoded queue buttons or action names.

## Containment And Read Models

Project-owned queues persist `lineage.project`; organization-root queues omit
it. Generated top-level queue lists use the domain containment contract and
exclude project children. Project detail screens load them with the same
relation filter.

`listPreviewByProjects()` returns queue identity/status/revision summaries for
project cards. It deliberately does not aggregate sheet output from every
attempt; selected sheet layouts are shown only in the queue revision panel.

## Related

- [Nesting](../nesting/README.md)
- [Entity revisions](../entity-revisions/README.md)
- [Sheet designs](../sheet-designs/README.md)
- [Process definitions](../process-definitions/README.md)
