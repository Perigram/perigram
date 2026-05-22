# COMPONENT: Nesting Worker

The Nesting Worker is a Python-based HTTP service responsible for executing the 2D bin packing algorithm. It is a "pure algorithm" service that processes geometry and returns transformations, without accessing the database.

## Core Files
- `worker_service.py`: FastAPI application entry point.
- `core/nesting_input_builder.py`: Prepares geometry and parameters for the nesting engine.
- `main.py`: Compatibility polling entry point for `nesting_jobs`; reports
  linked process lifecycle through `/api/processes/*` when `processRunId` is
  present.

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
    "sheetCount": 10
  }
}
```

**Response:**
Standard `lbf` JSON output containing layouts and placed items with transformations.

## Building & Running Locally

```sh
# Build image (from project root — Dockerfile uses root-relative paths)
docker build -t nesting-worker:local -f workers/nesting/Dockerfile .

# Run container
docker run --rm -it nesting-worker:local

# With host network (for local MongoDB)
docker run --network host -it -v "$(pwd):/app" -w /app nesting-worker:local bash
```
