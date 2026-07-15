# COMPONENT: Sheet Designs

A `sheet_design` is canonical digital layout geometry. Nesting creates it as a
revision-owned queue child; manual placement edits create/reuse a separate
immutable geometry revision.

## Data Contract

```js
{
  identity,
  origin,
  status,
  lineage: {
    organization: { entityType: 'organization', entityId },
    project?: { entityType: 'project', entityId },
    queue: { entityType: 'queue', entityId, revisionId }
  },
  specs,
  data: {
    geometry: { data, preview, summary },
    cassetteDesigns: [{ cassetteDesignId, count }],
    materialPool,
    nestingParams,
    layoutHash,
    revisions: { geometry: { currentId, number, contentHash } }
  },
  summary
}
```

`createFromQueueRevision()` requires the terminal queue revision id and uses a
deterministic design id supplied by the nesting task. `list()` accepts
`queueId`, `projectId`, and `revisionId` aliases and maps them to structured
lineage. Queue UI always supplies the selected queue revision id; it never
shows a union of layouts from multiple attempts.

## Layout Editing

`PUT /api/sheet-designs/:id` persists source items and placements, rebuilds
preview/summary data, and creates or reuses the `geometry` revision. The editor
uses the selected tool diameter as clearance. Dragging snaps cassette bounds to
neighbor bounds with that exact gap; the visual grid is not a placement snap
source. Rotation is an explicit 90-degree operation followed by neighbor snap
and full-shape sheet-boundary clamping.

Preview projection joins worker placements to source geometry, restores OCCS
semantic source layers, and emits the shared DrawingCanvas contract. Equivalent
layout hashing excludes transient bin identity and includes physical settings
that change manufacturability.

## Export

`GET /api/sheet-designs/:id/export` generates DXF from stored semantic layers.
The `generateAttachment` command stores that DXF and creates a ready artifact
whose non-owning `relations.source` points to this design and optional geometry
revision.

## Related

- [Nesting](../nesting/README.md)
- [Sheet instances](../sheet-instances/README.md)
- [Entity revisions](../entity-revisions/README.md)
