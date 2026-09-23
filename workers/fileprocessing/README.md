# CONTAINER: File Processing Worker

Claims `dxf.parseUpload` task runs, loads the referenced `user_dxf_files`
payload, extracts DXF metadata/geometry, writes SVG/metadata outputs, and
completes or fails the task through `/api/tasks/*`.

## Source

- `main.py` - task claim loop and worker API callbacks.
- `core/main.py` - DXF parsing and SVG generation orchestration.
- `utils/mongo.py` - MongoDB/GridFS connection.

## Environment

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string. |
| `PERIGRAM_API_URL` | App base URL for `/api/tasks/*`. |
| `WORKER_TOKEN` | Shared worker token sent as `x-worker-token`. |
| `WORKER_ID` | Worker identity recorded in `task_runs`. |
| `WORKER_TAG` | Routing tag for normal vs high-entity-count processing. |
| `MAX_ENTITY_LIMIT` | Entity-count threshold before routing to the high-capacity worker. |

## Related

- [workers](../README.md)
- [task runtime](../../server/core/tasks/README.md)
