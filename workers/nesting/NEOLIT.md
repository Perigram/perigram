# COMPONENT: Nesting Worker

The Nesting Worker is a Python-based service responsible for executing the 2D bin packing algorithm to optimize material usage.

## Core Files
- `main.py`: Entry point that polls MongoDB for pending nesting jobs.
- `core/nesting_input_builder.py`: Prepares geometry and parameters for the nesting engine.
- `core/svg_generator.py`: Generates SVG previews of the nesting results.
- `utils/mongo.py`: Helper for database and GridFS interactions.

## Nesting Engine
The worker integrates with **[jagua-rs](./jagua-rs/)**, a high-performance nesting library written in Rust.
- Communication with Rust is handled via CLI calls or FFI (depending on the specific implementation in `core/`).
- The engine supports parametric part generation and complex polygon handling.

## Nesting Workflow (v2)
1. **Trigger:** `POST /api/batch/:id/nest` creates a `nesting_job` entry.
2. **Polling:** Worker picks up `pending` jobs from the `nesting_jobs` collection.
3. **Execution:** Worker downloads DXFs from GridFS, applies parametric values, and runs `jagua-rs`.
4. **Artifacts:** Worker generates SVG layouts, DXF files, G-code, and PDF reports.
5. **Storage:** Results are uploaded to the `artifacts` GridFS bucket.
6. **Completion:** Worker updates job status to `complete` and sets `fileId` references in the Batch's artifacts.

## Job Document Schema
```javascript
{
  slug: string,        // Unique job identifier
  projectSlug: string,
  batchId: ObjectId,
  files: [
    { slug: string, simpleName: string, count: number }
  ],
  params: {
    height: number,
    width: number,
    space: number,
    sheetCount: number
  },
  status: "pending" | "processing" | "complete" | "failed",
  ownerId: string      // Auth provider ID
}
```

## Setup
Requires a Python 3.12 environment and compiled Rust binaries for `jagua-rs`.
Managed via `requirements.txt` and `Cargo.toml`.
