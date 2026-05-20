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
1. **Generation Request**: `operations.js` registers `generateArtifact`, which creates an artifact request from a source entity such as `sheet_design` or `nesting_run`.
2. **Persistence**: Linked to GridFS via `attachments.primary.fileId`. Status must be transitioned to `READY` for retrieval.
3. **Traceability**: Indexed by any ID in the lineage (e.g., `lineage.runId`).

## Data Structure
```typescript
{
  identity: { name },
  lineage: { organizationId, projectId, queueId, runId, sheetId, instanceId },
  status: StatusBlock,
  attachments: {
    primary: {
      type: Enum(LAYOUT_DXF, LAYOUT_SVG, PDF_PASSPORT, REPORT),
      fileId: ObjectId,
      name: string,
      metadata: { mimeType: string, bucketName: string }
    }
  },
  data: {
    type: Enum(LAYOUT_DXF, LAYOUT_SVG, PDF_PASSPORT, REPORT),
    metadata: Object
  }
}
```

`data.type` identifies the artifact kind for querying and UI display. `attachments.primary` is the standard file block for the generated binary in GridFS.

## APIs
- `GET /api/artifacts/:id` - Streams content from type-specific bucket. Requires `READY` status.
- `DELETE /api/artifacts/:id` - Removes metadata and linked GridFS file.
