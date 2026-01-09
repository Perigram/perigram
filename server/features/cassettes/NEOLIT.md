# COMPONENT: Cassettes Feature

This module manages the lifecycle of cassette templates, which are the primary building blocks for nesting.

## Core Files
- `repository.js`: Database operations on `cassettes` and `user_dxf_files` collections.
- `service.js`: Logic for uploading DXF, extracting polygons, and managing layer mappings.

## Data Structure
Cassettes are stored in the `cassettes` collection. Key fields:
- `slug`: Unique identifier used for file references.
- `userId`: String ID of the owner.
- `dxfId`: GridFS ID of the original DXF.
- `layerMapping`: Map of DXF layer names to system standard codes.
- `polygonParts`: Extracted geometry for the nesting algorithm.

## Key Workflows
### Upload & Extraction
When a DXF is uploaded, the service:
1. Saves the DXF to GridFS (`cassettes` bucket).
2. Extracts polygons from the layer mapped to the `nesting` standard.
3. Syncs the metadata and file to the legacy `user_dxf_files` collection for worker compatibility.

## Dependencies
- `system-settings`: Used to get the standard nesting layer code.
- `dxf-extractor`: Utility for parsing DXF geometry.
