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
    - Parametric templates store the designer graph `{ params, extrusions }`.
    - Standard uploaded templates store layer mapping data such as `{ mapping }`.
- **`data.parameters`**: Array<String> of configurable variable names.

`Cassette.toJSON()` hoists `type`, `definition`, and `parameters` for frontend compatibility. Frontend cards, thumbnails, and queue editors should read those hoisted fields first. Older records may also carry `data.params` / `data.extrusions` directly; the model normalizes that legacy graph into `definition`.

## Key Workflows

### Digital Intent vs. Baked Geometry
Templates in the `cassettes` collection do NOT store DXF files or physical tracking data. They serve as the source for `cassette_designs`.
- **Parametric**: `data.definition` contains the editable designer graph.
- **Standard**: `data.definition.mapping` contains layer mapping; baked geometry lives in `cassette_designs`.

### Update Operations
- **`saveCassetteTemplate`**: Domain operation used by `CassetteDesigner`.
  Creates a new template or updates the selected template through the service
  layer.
- **`updateLayerMapping`**: Updates the mapping between DXF layers and production tools/standards.
- **`updateParameters`**: Updates the list of configurable parameters for the template.

### Permission Model
Access is governed by `lineage.organizationId`. Multi-tenant isolation is enforced at the service layer using `hasLineagePermission`.

## Related
- [cassette-designs](../cassette-designs/README.md) - Stores baked geometry and DXF references.
- [parametric-cassettes](../parametric-cassettes/README.md) - Engine for evaluating parametric logic.
