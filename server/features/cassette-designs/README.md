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
- **`status`**: Current snapshot [StatusBlock].
- **`lineage`**: `{ organizationId, projectId?, queueId? }`
- **`geometry`**: 
    - `data`: Object (Baked SVG/Polygons)
    - `dxfId`: ObjectId (Reference to GridFS `cassettes` bucket)
- **`parameters`**: Object (Concrete values used for baking)
- **`provenance.derivedFrom`**: Immutable provenance for the source template
  revision used to create this exact design. The canonical source is an
  EntityRef `{ type: "cassette", id, revisionId }`, with scope, revision
  number, content hash, source status, and concrete parameter facts stored
  beside it.
- **`data.polygonParts` / `geometry.data.polygonParts`**: Nestable closed
  `cut.outer` polygons for static/imported designs.
- **`data.layerData` / `geometry.data.layerData`**: Semantic OCCS layer curves
  copied from baking or DXF upload so placed sheet designs can redraw source
  cut, fold, mark, and dimension layers.

## Key Workflows

### API Surface
- `GET /api/cassette-designs` lists accessible designs and supports lineage
  filters such as `queueId`, a provenance-backed `templateId` convenience
  filter, and generated-screen lifecycle filters `primaryStatus` /
  `primaryStatuses`.
- `GET /api/cassette-designs/:id` returns one `cassette_design` DTO by
  ObjectId/string id. Entity UI uses this canonical endpoint through
  `useEntity('cassetteDesign')`; cards must not fetch cassette designs through
  template or cassette fallback routes.
- `DELETE /api/cassette-designs/:id` removes a design through the
  cassette-design feature service and requires admin/delete access for that
  exact design. Generated process screens call this route through the shared
  entity delete control when the active process grants it.
- `GET /api/cassette-designs/:id/export` downloads the design DXF. The service
  regenerates a layer-aware DXF from stored preview layers, `layerData`, or
  `polygonParts` before using `data.geometry.dxfId` from the `cassettes` GridFS
  bucket. This keeps exported designs aligned with stored semantic OCCS layers
  and lets older preview-only records export a DXF. If a template id is passed,
  the service resolves the first design whose `provenance.derivedFrom.source`
  references that cassette template for standard upload/base-design flows.
- `GET /api/cassette-designs/by-template/:id` remains a convenience lookup for
  standard templates that need their initial design.

### Baking Process
Designs are created by "baking" a `cassette_template` with concrete parameters. This process:
1. Evaluates the template logic.
2. Generates a static DXF file and stores it in GridFS.
3. Creates a `cassette_design` document referencing the DXF, storing the
   parameter snapshot, and recording `provenance.derivedFrom` for the template
   geometry revision used.
The stored semantic layers are the export source of truth; the GridFS file is a
download fallback when semantic geometry is not present on older records.
Generated entity surfaces display this concrete parameter snapshot as exact
named values such as `A=1200, B=400`. Source cassette/template cards do not
show parameter counts because they represent symbolic constructors, not one
materialized design.
Changing those concrete parameters is another bake, not an in-place patch of
the existing design. Owning contexts such as queues use their authorized
relation creator to create the replacement design and swap the typed reference;
the original design and its provenance remain unchanged for every other owner.

Standard DXF uploads also create an initial design. The upload service extracts
the mapped `cut.outer` layer as `polygonParts`; queues should nest this design
entity directly instead of nesting the source template row.
`createFromTemplateUpload()` is the service-layer helper for that initial design
creation path and assigns a generated `cassette-design-*` uid so the persisted
entity id is stable and distinct from the human-readable design name.

### Relationship to Templates
Designs are derived from cassette templates through
`provenance.derivedFrom.source`, not through containment lineage. This keeps
template derivation as revision provenance rather than pretending the design is
owned by the template. Use the `templateId` query parameter only as a
convenience filter; the service rewrites it to the canonical provenance path.
`CassetteDesignCard` resolves that template and renders a compact embedded
template identity row plus the immutable source revision when present.

Cassette designs use the concrete `cassette_designs` feature for
read/update/delete permission checks. Services pass the full design DTO/model to
the access evaluator, not only `lineage`, so status-scoped process grants such
as `primaryStatus = RECEIVED` authorize both list and detail reads. Collection
responses are filtered with the same evaluator used by the detail endpoint; a
generated list must not show a design whose detail endpoint would deny.

## Related
- [cassettes](../cassettes/README.md) - The source templates.
- [instance-revisions](../instance-revisions/README.md) - Immutable revision snapshots.
- [artifacts](../artifacts/README.md) - Production output management.
