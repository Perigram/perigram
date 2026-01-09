# COMPONENT: Nesting Worker

The Nesting Worker is a Python-based service responsible for executing the 2D bin packing algorithm to optimize material usage.

## Core Files
- `main.py`: Entry point that polls MongoDB for pending nesting jobs.
- `core/main.py`: Main processing logic for geometry transformation and DXF generation.
- `core/nesting_input_builder.py`: Prepares geometry and parameters for the nesting engine.
- `core/svg_generator.py`: Generates SVG previews of the nesting results.
- `utils/mongo.py`: Helper for database and GridFS interactions.

## Nesting Engine
The worker integrates with **[jagua-rs](./jagua-rs/)**, a high-performance nesting library written in Rust.
- Communication with Rust is handled via CLI calls or FFI.
- The engine supports parametric part generation and complex polygon handling.

## Nesting Workflow
1.  **Cassette Upload**: User uploads DXF. `server/features/cassettes/service.js` extracts entities from the mapped nesting layer (default: `1_3_UNFOLD_BOUNDARY`) into `polygonParts`.
2.  **Trigger**: `POST /api/batch/:id/nest` creates a `nesting_jobs` entry.
3.  **Polling**: Worker picks up `pending` jobs.
4.  **Processing**:
    *   Reads `polygonParts` from MongoDB.
    *   Runs nesting algorithm via `jagua-rs`.
    *   Returns transformations: `{ cassetteId, handles, x, y, angle }`.
5.  **Result Generation**:
    *   Opens cassette DXF.
    *   Extracts entities by `handles` (nesting layer only).
    *   Applies transformations and generates result DXF/SVG.
6.  **Storage**: Results are uploaded to GridFS artifacts.
7.  **Completion**: Updates job status to `complete`.

## Troubleshooting
- **No polygons?**: Check if the DXF layer is correctly mapped to `1_3_UNFOLD_BOUNDARY` during upload.
- **Fallback to rectangles?**: Occurs when `polygonParts` is empty; worker uses batch dimensions instead.
- **Wrong entities?**: Verify `layerMapping` points to the correct boundary layer in the original DXF.

## Job Document Schema
```javascript
{
  slug: string,        // Unique job identifier
  projectSlug: string,
  batchId: ObjectId,
  files: [
    { cassetteId: string, count: number, dimensions: object }
  ],
  params: {
    height: number,
    width: number,
    space: number,
    sheetCount: number
  },
  status: "pending" | "processing" | "complete" | "failed",
  ownerId: string
}
```