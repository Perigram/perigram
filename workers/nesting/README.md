# COMPONENT: Nesting Worker

The Nesting Worker is a Python-based HTTP service responsible for executing the 2D bin packing algorithm. It is a "pure algorithm" service that processes geometry and returns transformations, without accessing the database.

## Core Files
- `worker_service.py`: FastAPI application entry point.
- `core/nesting_input_builder.py`: Prepares geometry and parameters for the nesting engine.
- `worker_service.py` is the only runtime entry point. The old polling entry
  point was removed; task/job orchestration belongs to the app.

## Nesting Engine
The worker integrates with **[jagua-rs](./jagua-rs/)**, a high-performance nesting library written in Rust.
- The `lbf` binary is executed to perform the nesting.

## Architecture & Workflow
1.  **Input**: Receives POST request with items (polygons) and parameters.
2.  **Processing**:
    *   Buffers input polygons by the specified spacing.
    *   Constructs input JSON for `lbf`.
    *   Executes `lbf` binary.
3.  **Output**: Returns nesting solution (layouts and transformations) as JSON.

## API
### POST /nest
**Request:**
```json
{
  "items": [
    {
      "id": 1,
      "cassette_id": "...",
      "coords": [[x,y], ...],
      "handles": ["..."],
      "count": 5
    }
  ],
  "params": {
    "width": 1220,
    "height": 2440,
    "space": 5,
    "sheetCount": 10,
    "sheet_polygon": {
      "outer": [[0, 0], [1220, 0], [1220, 2440], [0, 2440], [0, 0]],
      "inner": [[[300, 300], [500, 300], [500, 500], [300, 500], [300, 300]]]
    }
  }
}
```

**Response:**
Standard `lbf` JSON output containing layouts and placed items with transformations.

`sheet_polygon` is optional. It may be omitted for rectangular stock, provided
as a legacy outer ring list, or provided as `{ outer, inner }`. Inner rings are
passed to jagua-rs as container holes, which are fixed non-placeable zones used
for remnant material with already-cut openings.

## Building & Running Locally

```sh
# Build image (from project root — Dockerfile uses root-relative paths)
docker build -t nesting-worker:local -f workers/nesting/Dockerfile .

# Run container
docker run --rm -it nesting-worker:local

# With host network (for local MongoDB)
docker run --network host -it -v "$(pwd):/app" -w /app nesting-worker:local bash
```

The Dockerfile expects the project root as build context so it can copy
`workers/nesting/requirements.txt`, the worker source, and the
`workers/nesting/jagua-rs` submodule into the image.
