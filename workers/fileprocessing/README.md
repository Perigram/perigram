# CONTAINER: File Processing Worker

Polls MongoDB for pending DXF upload jobs, extracts geometry and metadata, generates SVG previews, and writes results back to GridFS. Deployed in two instances differentiated by `WORKER_TAG` to handle files of different complexity.

## Source Layout

| Path | Responsibility |
|---|---|
| `main.py` | Entry point — MongoDB polling loop, graceful shutdown on SIGTERM |
| `core/main.py` | `process_file()` — orchestrates extraction, entity count check, and tag routing |
| `core/geometry/` | DXF geometry parsing and polygon extraction |
| `core/svg_generator.py` | SVG preview generation from DXF data |
| `utils/logger.py` | Structured logging |
| `utils/mongo.py` | MongoDB + GridFS connection |

## Communication

**Inbound:** None (no HTTP server). Purely a MongoDB consumer.

**MongoDB collection polled:** `user_dxf_files`

**Job lifecycle:**

| `processingStatus` | Meaning |
|---|---|
| `pending` | Ready to be picked up |
| `processing` | Locked by a worker (kept alive with heartbeat every 10 s) |
| `completed` | SVG and metadata written to GridFS |
| `error` | Processing failed; error stored in document |

**Routing logic for large files:**
1. Normal worker picks up any `pending` job with no `worker_tag`.
2. On first pass, `core/main.py` calls `_set_valid_entity_count()` which reads `len(modelspace())`.
3. If entity count exceeds `max_entity_limit`, the job is re-tagged: `processingStatus → pending`, `worker_tag → "1k_entity_count"`.
4. The `1k_entity_count` worker instance (`WORKER_TAG=1k_entity_count` env) picks it up.

## Deployment

| Env var | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `WORKER_TAG` | `""` (normal) or `"1k_entity_count"` (large files) |

Both instances run from the same Docker image (`file-processing-worker`). Two replicas are deployed per mode via Docker Stack.

## Related
- [workers/README.md](../README.md) — Worker overview
- [workers/cassette-processing/README.md](../cassette-processing/README.md) — Shares DXF utilities from this module
