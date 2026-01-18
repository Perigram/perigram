# COMPONENT: Artifacts Feature

This module manages generated output files (layouts, G-code, PDFs) stored in GridFS and referenced from MongoDB.

## Core Files
- `repository.js`: Direct database and GridFS operations for artifacts.
- `service.js`: Validation, status transitions, and artifact lifecycle helpers.

## Data Structure
Artifacts are stored in the `artifacts` collection.
- `batchId`: Parent batch reference.
- `runId`: Optional nesting run reference (for run-specific outputs).
- `type`: `LAYOUT_SVG` | `LAYOUT_DXF` | `GCODE` | `PDF_PASSPORT` | `NESTING_REPORT`.
- `status`: `GENERATING` | `READY` | `FAILED`.
- `generatedBy`: Nesting slug (used by worker to update file IDs).
- `fileId`, `mimeType`, `fileSize`, `metadata`.

## Key Workflows
1. **Creation**: Nesting endpoints create placeholder artifacts with `GENERATING` status.
2. **Worker update**: Nesting worker uploads files to GridFS and updates artifacts by `generatedBy`.
3. **Retrieval**: Batch artifacts can be filtered by `runId` (chosen run by default).
