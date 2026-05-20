# COMPONENT: Nesting Feature

Handles nesting solve orchestration, including job creation and worker communication.

## Core Files
- `server/api/queue/[id]/nest.post.js`: Endpoint that composes `solveNesting` with artifact generation requests.
- `operations.js`: Registers the `solveNesting` operation handler.
- `jobs.js`: Mongo helper for `nesting_jobs`.
- `server/plugins/nesting-processor.js`: Background processor that polls for pending jobs.
- `server/scripts/generate_nest_dxf.py`: Python script for generating result DXF files.

## Workflow
1.  **Operation Execution**: The endpoint calls `executeServerOperation('solveNesting')`. The operation runtime loads the queue, verifies declared access, and then invokes the nesting handler.
2.  **Job Creation**: The handler creates a `nesting_job` in MongoDB with status `pending`. It prepares the list of cassettes (standard or baked). The handler also guards against duplicate submissions with an in-process per-queue lock plus DB-level active-job checks.
3.  **Polling**: `nesting-processor.js` (Nitro plugin) polls for `pending` jobs.
4.  **Preparation**: The processor fetches cassette geometries (polygons) from the `cassettes` collection.
5.  **Nesting**: The processor sends the geometry to the **Nesting Worker** (HTTP service).
6.  **Sheet Designs**: Worker layouts are persisted as `sheet_design` entities linked to the nesting run.
7.  **File Generation**:
    *   Processor receives transformations from the worker.
    *   It executes `server/scripts/generate_nest_dxf.py` as a subprocess.
    *   The script reads source DXFs from GridFS, applies transformations, and generates new DXF files for each layout.
    *   The script ensures ALL layers from the source cassettes are included.
8.  **Completion**: Generated files are uploaded to GridFS, artifact requests are marked ready, and the job status is updated to `done`.

## Data Flow
- **Node -> Worker**: JSON (Polygons + Params)
- **Worker -> Node**: JSON (Transforms)
- **Node -> Script**: JSON file (Transforms)
- **Script -> Node**: JSON stdout (List of generated files)

## Dependencies
- **Nesting Worker**: Separate service running `lbf`.
- **Python Environment**: The Node container includes Python 3 and `ezdxf` to run the generation script.

## Runtime Notes
- DXF generation requires `MONGO_DB_NAME` when the Mongo URI has no default database.
