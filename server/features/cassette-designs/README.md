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

## Key Workflows

### Baking Process
Designs are created by "baking" a `cassette_template` with concrete parameters. This process:
1. Evaluates the template logic.
2. Generates a static DXF file and stores it in GridFS.
3. Creates a `cassette_design` document referencing the DXF and storing the parameter snapshot.

### Relationship to Templates
Every design optionally references its parent `templateId` via lineage. This allows tracing a production design back to its parametric or standard source.

## Related
- [cassettes](../cassettes/README.md) - The source templates.
- [artifacts](../artifacts/README.md) - Production output management.
