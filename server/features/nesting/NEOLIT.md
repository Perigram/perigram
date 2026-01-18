# COMPONENT: Nesting Feature

Handles the orchestration of nesting jobs, including job creation, worker communication, and result file generation.

## Core Files
- `server/api/batch/[id]/nest.post.js`: Endpoint to trigger nesting.
- `server/plugins/nesting-processor.js`: Background processor that polls for pending jobs.
- `server/scripts/generate_nest_dxf.py`: Python script for generating result DXF files.

## Workflow
1.  **Job Creation**: `nest.post.js` creates a `nesting_job` in MongoDB with status `pending`. It prepares the list of cassettes (standard or baked).
2.  **Polling**: `nesting-processor.js` (Nitro plugin) polls for `pending` jobs.
3.  **Preparation**: The processor fetches cassette geometries (polygons) from the `cassettes` collection.
4.  **Nesting**: The processor sends the geometry to the **Nesting Worker** (HTTP service).
5.  **File Generation**:
    *   Processor receives transformations from the worker.
    *   It executes `server/scripts/generate_nest_dxf.py` as a subprocess.
    *   The script reads source DXFs from GridFS, applies transformations, and generates new DXF files for each layout.
    *   The script ensures ALL layers from the source cassettes are included.
6.  **Completion**: Generated files are uploaded to GridFS, and the job status is updated to `done`.

## Data Flow
- **Node -> Worker**: JSON (Polygons + Params)
- **Worker -> Node**: JSON (Transforms)
- **Node -> Script**: JSON file (Transforms)
- **Script -> Node**: JSON stdout (List of generated files)

## Dependencies
- **Nesting Worker**: Separate service running `lbf`.
- **Python Environment**: The Node container includes Python 3 and `ezdxf` to run the generation script.
