# COMPONENT: Artifacts (Universal Outputs)

Unified file storage and metadata registry for all generated system outputs (G-Code, SVG Layouts, PDF Reports).

## v24 Architecture
- **Polymorphic Linkage**: Artifacts point to any ancestor via the `lineage` object.
- **Lineage Inheritance**: Automatically inherits ancestry from the parent that triggered the generation.
- **Status**: Governed by `ArtifactMachine` (GENERATING -> READY -> FAILED).

## Key Workflows
1. **Generation**: Created by background workers (Nesting, G-Code) with an initial state of `GENERATING`.
2. **Persistence**: Linked to GridFS via `fileId`.
3. **Traceability**: Indexed by any ID in the lineage (e.g., "Find all G-Code for this project").

## Data Structure
```typescript
{
  identity: { name },
  type: Enum(GCODE, LAYOUT_SVG, PDF_REPORT),
  fileId: ObjectId,
  lineage: { organizationId, projectId, queueId, runId, sheetId, instanceId },
  status: StatusBlock,
  metadata: Object
}
```