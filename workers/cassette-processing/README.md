# CONTAINER: Cassette Processing Worker

Claims `cassette.bakeTemplate` task runs, loads the referenced cassette
template, bakes concrete geometry/DXF data, and completes or fails the task
through `/api/tasks/*`.

## Source

- `main.py` - task claim loop and worker API callbacks.
- `core/process.py` - cassette geometry baking.
- `dxf_utils.py` - DXF utility functions shared with file processing.

This worker must be built with the project root as Docker context because it
imports files from `workers/fileprocessing`.

## Environment

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string. |
| `PERIGRAM_API_URL` | App base URL for `/api/tasks/*`. |
| `WORKER_TOKEN` | Shared worker token sent as `x-worker-token`. |
| `WORKER_ID` | Worker identity recorded in `task_runs`. |

## Related

- [workers](../README.md)
- [fileprocessing](../fileprocessing/README.md)
