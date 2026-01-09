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

## Job Lifecycle
1. **Polling:** Checks `nesting_jobs` collection for documents with `status: "pending"`.
2. **Setup:** Fetches required DXF files from GridFS and prepares the input JSON for `jagua-rs`.
3. **Execution:** Runs the nesting algorithm.
4. **Results:**
   - Parses the output.
   - Generates SVG and DXF result files.
   - Uploads result files to GridFS (`artifacts` bucket).
   - Updates the job status to `complete` and batch status to `COMPLETE`.

## Setup
Requires a Python 3.12 environment and compiled Rust binaries for `jagua-rs`.
Managed via `requirements.txt` and `Cargo.toml`.
