# COMPONENT: Cassette Templates (v24 Standardized)

Manages cassette templates (Standard and Parametric) using standardized v24 architecture. Templates represent the digital logic/source for creating designs.

## Core Files
- `repository.js`: Database operations on `cassettes` collection.
- `service.js`: Template management and permission handling.
- `operations.js`: Domain operation handler for `saveCassetteTemplate`.

## Data Structure (v24)

- **`identity`**: `{ slug, name, serial, reference }`
- **`status`**: Current snapshot [StatusBlock].
- **`origin`**: Creation snapshot [StatusBlock].
- **`lineage`**: `{ organizationId }`
- **`data.type`**: `PARAMETRIC` | `STANDARD`
- **`data.definition`**:
    - Parametric templates store either the legacy designer graph
      `{ params, extrusions }` or an OCCS v2 template document with
      `extensions.cutkit.graphTree`.
    - Standard uploaded templates store layer mapping data such as `{ mapping }`.
- **`data.parameters`**: Array<String> of configurable variable names.
- **`data.revisions.geometry`**: Current immutable geometry revision pointer
  `{ currentId, number, contentHash }` maintained by the service after template
  create/update/upload.

`Cassette.toJSON()` hoists `type`, `definition`, and `parameters` for frontend compatibility. Frontend cards, thumbnails, and queue editors should read those hoisted fields first. Older records may also carry `data.params` / `data.extrusions` directly; the model normalizes that legacy graph into `definition`.

## Key Workflows

### Digital Intent vs. Baked Geometry
Templates in the `cassettes` collection do NOT store DXF files or physical tracking data. They serve as the source for `cassette_designs`.
- **Parametric**: `data.definition` contains the editable legacy designer graph
  or an OCCS v2 template document.
- **Standard**: `data.definition.mapping` contains DXF-to-OCCS semantic layer
  mapping; uploaded DXF bytes and extracted baked geometry live in
  `cassette_designs`.

Every template save resolves an `entity_revision` with `scope: "geometry"` from
`data.type`, `data.definition`, and `data.parameters`. The template stores only
the current pointer under `data.revisions.geometry`; the immutable source
snapshot lives in `entity_revisions`.

### Template-to-Design Creation
`POST /api/cassettes/:id/designs` calls `createDesignFromTemplate()` and creates
or returns a `cassette_design` for the selected template.
- Parametric templates are evaluated with the supplied concrete parameter map,
  generate a layer-aware DXF into the `cassettes` GridFS bucket, and create a
  design with `data.polygonParts`, `data.layerData`, `data.geometry.dxfId`, and
  `data.derivedFrom` pointing to the source geometry revision.
- Standard uploaded templates already create their initial base design during
  upload. The route returns that existing design when available instead of
  duplicating the uploaded DXF.

The same constructor is used by process `createEntity` actions whose
construction mode is `bakeCassetteDesignFromTemplate`. Process execution passes
the prompted template id, parameter object, and optional design name into
`createDesignFromTemplate()` so a process-created `cassette_design` has the
same baked geometry, `data.derivedFrom`, DXF/gridfs references, and editor
contract as a design created from the cassette UI. Process runtime status is
applied after construction by the process-definition service. Parametric
templates must be construction-ready before this path runs: OCCS templates need
`data.definition.extensions.cutkit.graphTree`, and legacy parametric templates
need the required `A` and `B` graph parameters. Incomplete draft templates are
rejected before WASM evaluation so the renderer never receives a graph with
null string fields.

`GET /api/cassettes/:id/export` remains a template-level DXF export. Parametric
exports use evaluated `layerData` when available, so folds, marks, dimensions,
and cut layers are preserved instead of emitting only the nestable contour. For
saved design assets, use the cassette-design export endpoint.

### DXF Upload
`upload()` requires one mapped DXF layer to resolve to `cut.outer`. The service
extracts closed polygons from that layer into the created cassette design
`data.polygonParts` / `data.geometry.data.polygonParts` so nesting can consume
the design directly. Other mapped DXF layers are extracted as open or closed
curve `layerData` so nested sheet-design previews can carry folds, marks,
dimensions, and other semantic layers forward. The endpoint returns both the
created template and its initial design; queue uploads should add the design id,
not the template id.

### Update Operations
- **`saveCassetteTemplate`**: Domain operation used by `CassetteDesigner` and
  `CassetteDesignerV2`. Creates a new template or updates the selected template
  through the service layer while preserving OCCS documents under
  `data.definition`. Callers should pass `entities.cassette` only for templates
  already loaded from the database; generated fixture/demo ids should be saved
  without an entity ref so the operation creates a real cassette row. App
  surfaces use `CassetteDesignerV2`; the legacy designer is kept for dev/test
  fixture flows.
- **`updateLayerMapping`**: Updates the mapping between DXF layers and production tools/standards.
- **`updateParameters`**: Updates the list of configurable parameters for the template.
- **`ensureCurrentGeometryRevision`**: Creates or reuses the current geometry
  revision and refreshes `data.revisions.geometry`. Migration scripts use this
  helper to backfill old templates.

### Permission Model
Access is governed by `lineage.organizationId`. Multi-tenant isolation is enforced at the service layer using `hasLineagePermission`.

## Related
- [cassette-designs](../cassette-designs/README.md) - Stores baked geometry and DXF references.
- [entity-revisions](../entity-revisions/README.md) - Immutable source revision snapshots.
- [parametric-cassettes](../parametric-cassettes/README.md) - Engine for evaluating parametric logic.
