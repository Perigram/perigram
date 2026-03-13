# COMPONENT: Artifacts (Universal Outputs)

Unified file storage and metadata registry for all generated system outputs (G-Code, SVG Layouts, PDF Reports).

## v24 Architecture
- **Polymorphic Linkage**: Artifacts point to any ancestor via the `lineage` object.
- **Lineage Inheritance**: Automatically inherits ancestry from the parent that triggered the generation.
- **Status**: Governed by `ArtifactMachine` (GENERATING -> READY -> FAILED).
- **Storage**: GridFS buckets mapped by type:
  - `LAYOUT_DXF` -> `nestDxf`
  - `LAYOUT_SVG` -> `nestSvg`
  - `PDF_PASSPORT` -> `artifacts` (General bucket)

## Key Workflows
1. **Generation**: Created by background workers (Nesting, G-Code) with an initial state of `GENERATING`.
2. **Persistence**: Linked to GridFS via `fileId`. Status must be transitioned to `READY` for retrieval.
3. **Traceability**: Indexed by any ID in the lineage (e.g., `lineage.runId`).

## Data Structure
```typescript
{
  identity: { name },
  type: Enum(LAYOUT_DXF, LAYOUT_SVG, PDF_PASSPORT, REPORT),
  fileId: ObjectId,
  lineage: { organizationId, projectId, queueId, runId, sheetId, instanceId },
  status: StatusBlock,
  metadata: Object
}
```

## APIs
- `GET /api/artifacts/:id` - Streams content from type-specific bucket. Requires `READY` status.
- `DELETE /api/artifacts/:id` - Removes metadata and linked GridFS file.
