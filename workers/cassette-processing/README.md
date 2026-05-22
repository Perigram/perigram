# CONTAINER: Cassette Processing Worker

Polls MongoDB for cassette template documents pending DXF baking. Given a parametric cassette template definition (JSON with named dimensions), renders the concrete DXF geometry file and stores it in GridFS. The resulting DXF is then referenced by nesting runs.

## Source Layout

| Path | Responsibility |
|---|---|
| `main.py` | Entry point — MongoDB polling loop, graceful shutdown on SIGTERM |
| `core/process.py` | `process_cassette()` — reads template params, renders geometry |
| `dxf_utils.py` | DXF construction utilities (imports from `../fileprocessing/` where shared) |
| `utils/logger.py` | Structured logging |
| `utils/mongo.py` | MongoDB + GridFS connection |

## Communication

**Inbound:** None (no HTTP server). Purely a MongoDB consumer.

**MongoDB collection polled:** `cassettes`

When a cassette document includes `processRunId`, `main.py` keeps the legacy
polling lifecycle on the cassette document and reports the declared
`cassette.bakeTemplate` process lifecycle through the app process API.

**Job lifecycle:**

| `processingStatus` | Meaning |
|---|---|
| `pending` | Template ready to be baked |
| `processing` | Locked by worker (heartbeat every 10 s) |
| `completed` | DXF written to GridFS, `data.dxfId` populated |
| `error` | Baking failed; error stored in document |

## Code Sharing

This worker imports DXF utilities from the sibling `fileprocessing/` package. Both workers are therefore **built from the project root** as build context — the Dockerfile uses root-relative `COPY` paths:

```dockerfile
COPY workers/fileprocessing ./fileprocessing
COPY workers/cassette-processing .
```

## Deployment

| Env var | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `CUTKIT_API_URL` | App base URL for `/api/processes/*` callbacks |
| `WORKER_TOKEN` | Optional shared worker token sent as `x-worker-token` |

Deployed as part of the `file-processing-worker` Docker image (shared image, different entrypoint/command).

## Related
- [workers/README.md](../README.md) — Worker overview
- [workers/fileprocessing/README.md](../fileprocessing/README.md) — Shared DXF utilities source
