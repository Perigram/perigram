# COMPONENT: Cassette Designs (v24 Standardized)

Manages baked geometry and DXF references for production-ready cassettes.

## Core Files
- `repository.js`: Database operations on `cassette_designs` collection.
- `service.js`: Geometry management and design instantiation.

## Data Structure (v24)
Aligned with `@PROPOSED_DATA_MODEL.md` Section 5:

- **`_id`**: ObjectId
- **`identity`**: `{ name, slug, serial, reference }`
- **`origin`**: Creation snapshot [StatusBlock].
- **`status`**: Current snapshot [StatusBlock] (Used for design approval lifecycle).
- **`lineage`**: `{ organizationId, projectId, queueId, templateId? }`
- **`geometry`**: 
    - `data`: Object (Baked SVG/Polygons)
    - `dxfId`: ObjectId (Reference to GridFS `cassettes` bucket)
- **`parameters`**: Object (Concrete values used for baking)
- **`data.derivedFrom`**: Immutable provenance for the source template revision
  used to create this exact design:
  `{ entityType, entityId, scope, revisionId, revisionNumber, contentHash,
  sourceStatus, parameters }`.
- **`data.polygonParts` / `geometry.data.polygonParts`**: Nestable closed
  `cut.outer` polygons for static/imported designs.
- **`data.layerData` / `geometry.data.layerData`**: Semantic OCCS layer curves
  copied from baking or DXF upload so placed sheet designs can redraw source
  cut, fold, mark, and dimension layers.

## Key Workflows

### API Surface
- `GET /api/cassette-designs` lists accessible designs and supports lineage
  filters such as `queueId` and `templateId`.
- `GET /api/cassette-designs/:id` returns one `cassette_design` DTO by
  ObjectId/string id. Entity UI uses this canonical endpoint through
  `useEntity('cassetteDesign')`; cards must not fetch cassette designs through
  template or cassette fallback routes.
- `GET /api/cassette-designs/:id/export` downloads the design DXF. The service
  regenerates a layer-aware DXF from stored `layerData` / `polygonParts` before
  using `data.geometry.dxfId` from the `cassettes` GridFS bucket. This keeps
  exported designs aligned with the stored semantic OCCS layers even when an
  older baked file contains only contour geometry. If a template id is passed,
  the service resolves the first design with `lineage.templateId` for standard
  upload/base-design flows.
- `GET /api/cassette-designs/by-template/:id` remains a convenience lookup for
  standard templates that need their initial design.

### Baking Process
Designs are created by "baking" a `cassette_template` with concrete parameters. This process:
1. Evaluates the template logic.
2. Generates a static DXF file and stores it in GridFS.
3. Creates a `cassette_design` document referencing the DXF, storing the
   parameter snapshot, and recording `data.derivedFrom` for the template
   geometry revision used.
The stored semantic layers are the export source of truth; the GridFS file is a
download fallback when semantic geometry is not present on older records.

Standard DXF uploads also create an initial design. The upload service extracts
the mapped `cut.outer` layer as `polygonParts`; queues should nest this design
entity directly instead of nesting the source template row.
`createFromTemplateUpload()` is the service-layer helper for that initial design
creation path and assigns a generated `cassette-design-*` uid so the persisted
entity id is stable and distinct from the human-readable design name.

### Relationship to Templates
Every design optionally references its parent `templateId` via lineage. This
allows tracing a production design back to its parametric or standard source.
`lineage.templateId` remains the ancestry/access link. `data.derivedFrom` is
the reproducible source revision link and must be used when exact geometry
provenance matters.
`CassetteDesignCard` resolves that template and renders a compact embedded
template identity row plus the immutable source revision when present.

Cassette designs are cassette assets, so service read/update/delete permission
checks accept `cassettes` grants and retain `projects` grants as compatibility
for queue-derived designs with project lineage.

## Related
- [cassettes](../cassettes/README.md) - The source templates.
- [entity-revisions](../entity-revisions/README.md) - Immutable revision snapshots.
- [artifacts](../artifacts/README.md) - Production output management.
