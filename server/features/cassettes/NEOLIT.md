# COMPONENT: Cassettes Feature

This module manages the lifecycle of cassette templates, which are the primary building blocks for nesting.

## Core Files
- `repository.js`: Database operations on `cassettes` and `user_dxf_files` collections.
- `service.js`: Logic for uploading DXF, extracting polygons, managing layer mappings, and renaming.

## Data Structure
Cassettes are stored in the `cassettes` collection. Key fields:
- `name`: Human-readable name (editable).
- `slug`: Unique identifier used for file references.
- `userId`: String ID of the owner.
- `type`: `STANDARD` (DXF-based) or `PARAMETRIC`.
- `data`: (For parametric) The high-level tree/parameters for nodi-modular.
- `dxfId`: GridFS ID of the original DXF (for standard cassettes).
- `layerMapping`: Map of DXF layer names to system standard codes.
- `polygonParts`: Extracted geometry for the nesting algorithm.

## Key Workflows
### Upload & Extraction (Standard)
When a DXF is uploaded, the service:
1. Saves the DXF to GridFS (`cassettes` bucket).
2. Extracts polygons from the layer mapped to the `nesting` standard.
3. Syncs the metadata and file to the legacy `user_dxf_files` collection for worker compatibility.

### Parametric Design
Parametric cassettes are created and managed via the `CassetteDesigner`. They store their geometry logic in the `data` field and are evaluated on the fly by the worker or frontend.

### Management
Users can rename cassettes in the Designer or Cassette Manager. Updates are handled via the `service.update()` which ensures metadata consistency.

## Dependencies
- `system-settings`: Used to get the standard nesting layer code.
- `dxf-extractor`: Utility for parsing DXF geometry.
