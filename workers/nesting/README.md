# PLUGIN: Nesting

Nesting is an independently installable plugin exposing a generic polygon-nesting graph operation. Its managed server runtime owns input validation, quantity handling, source-metadata preservation, layout grouping, and result summaries. The Rust/Python solver is an implementation detail behind the platform-owned `nesting.solve` capability; the plugin contract has no Facade types or Facade executor dependency.

The isolated HTTP worker entry point is `worker_service.py` (`POST /nest`); its live import path touches only `worker_service.py`, `core/nesting_input_builder.py`, and `core/geometry_utils.py` (pure algorithm, no DB access). The installable contract is [`listing.json`](./listing.json), and its managed runtime is [`runtime/server.mjs`](./runtime/server.mjs).

Parent: [workers README](../README.md).

## Nesting Engine
The worker integrates with **[jagua-rs](./jagua-rs/README.md)**, a high-performance nesting library written in Rust.
- The `lbf` binary is executed to perform the nesting. The image builds it
  from the submodule; a local run needs `cargo build --release` in
  `jagua-rs` with the release binary at `lbf-bin` (the `lbf` symlink
  resolves it).

## Architecture & Workflow
1.  **Input**: Receives POST request with items (polygons) and parameters.
2.  **Processing**:
    *   Buffers input polygons by the specified spacing.
    *   Constructs input JSON for `lbf`.
    *   Executes `lbf` binary.
3.  **Output**: Returns nesting solution (layouts and transformations) as JSON.

## API
The platform-owned capability adapter reaches `NESTING_WORKER_URL` — the full endpoint including `/nest` (default `http://nesting-worker:8000/nest`; a base URL 404s). Plugin runtimes never call this URL directly.

### POST /nest
**Request:**
```json
{
  "items": [
    {
      "id": 1,
      "source_id": "...",
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

When no item passes geometry validation, the service still returns
HTTP 200 with `{ "status": "error", "message": "No valid items to nest
(all items failed geometry validation)", "solution": { "layouts": [] } }`;
the Nesting managed runtime converts `status === "error"` into a 502 operation failure.

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

# With host network (dev shell)
docker run --network host -it -v "$(pwd):/app" -w /app nesting-worker:local bash
```

The Dockerfile expects the project root as build context so it can copy
`workers/nesting/requirements.txt`, the worker source, and the
`workers/nesting/jagua-rs` submodule into the image.
