# COMPONENT: Cassette Templates (v24 Standardized)

Manages cassette templates (Standard and Parametric) using standardized v24 architecture. Templates represent the digital logic/source for creating designs.

## Core Files
- `repository.js`: Database operations on `cassettes` collection.
- `service.js`: Template management and permission handling.

## Data Structure (v24)
Aligned with `@PROPOSED_DATA_MODEL.md` Section 10:

- **`identity`**: `{ slug, name, serial, reference }`
- **`status`**: Current snapshot [StatusBlock].
- **`origin`**: Creation snapshot [StatusBlock].
- **`lineage`**: `{ organizationId }`
- **`definition`**:
    - `type`: `PARAMETRIC` | `STANDARD`
    - `data`: The JSON Graph or Logic.
    - `parameters`: Array<String> (Configurable variable names).

## Key Workflows

### Digital Intent vs. Baked Geometry
Templates in the `cassettes` collection do NOT store DXF files or physical tracking data. They serve as the source for `cassette_designs`.
- **Parametric**: The `definition.data` contains the Nodi3D graph logic.
- **Standard**: The `definition.data` contains the static definition which is baked into a `cassette_design` for production.

### Update Operations
- **`updateLayerMapping`**: Updates the mapping between DXF layers and production tools/standards.
- **`updateParameters`**: Updates the list of configurable parameters for the template.

### Permission Model
Access is governed by `lineage.organizationId`. Multi-tenant isolation is enforced at the service layer using `hasLineagePermission`.

## Related
- [cassette-designs](../cassette-designs/NEOLIT.md) - Stores baked geometry and DXF references.
- [parametric-cassettes](../parametric-cassettes/NEOLIT.md) - Engine for evaluating parametric logic.