# CONTAINER: Workers

Three independent processing services. Two use MongoDB polling; one is a stateless HTTP service.

## Worker List

| Worker | Type | Source | Purpose |
|---|---|---|---|
| **[nesting](./nesting/)** | HTTP service (FastAPI) | `workers/nesting/` | 2D bin packing via jagua-rs; called directly by the app via `POST /nest` |
| **[fileprocessing](./fileprocessing/)** | MongoDB polling | `workers/fileprocessing/` | DXF → metadata + SVG; two instances by entity count |
| **[cassette-processing](./cassette-processing/)** | MongoDB polling | `workers/cassette-processing/` | Parametric cassette template → DXF geometry |

## Communication Patterns

### Nesting Worker (HTTP)
- Stateless FastAPI service, **no database access**.
- `cutkit-app` sends geometry via `POST /nest` and waits for the JSON placement result.
- The app then writes the nesting result to MongoDB itself.

### File & Cassette Processing Workers (MongoDB polling)
1. **App** creates/updates a document in `user_dxf_files` or `cassettes` with `processingStatus: "pending"`.
2. **Worker** finds a pending document (atomic findAndModify), locks it to `"processing"`.
3. Worker fetches binary files from GridFS, processes, and writes outputs back to GridFS.
4. Worker sets `processingStatus` to `"completed"` or `"error"`.

## Local Development & Troubleshooting
### Run Workers Locally (Compose)
```bash
# 1. Stop Swarm services if running
docker service scale cutkit_nesting-worker=0

# 2. Start via compose
docker-compose -f docker-compose.local.yml up -d
```

### Viewing Logs
```bash
docker logs -f nesting-worker
docker logs -f user-file-processing-worker
```

### Checking DB Status
```bash
docker exec cutkit_mongo mongosh cutkit --eval "db.nesting_jobs.find().sort({createdAt:-1}).limit(1)"
```

## Deployment
Workers are deployed via Docker Stack or as separate services in Railway.

### Build Context Requirement (IMPORTANT)
All workers MUST be built from the **project root** context. This is required because some workers (like `cassette-processing`) depend on sibling directories (like `fileprocessing`) for code sharing.

### Railway Configuration
When deploying on Railway:
1.  **Build Context:** Set to `/` (repository root).
2.  **Dockerfile Path:** Point to the specific worker Dockerfile (e.g., `workers/nesting/Dockerfile`).
3.  **Submodules:** Ensure your GitHub configuration allows Railway to clone submodules (required for `jagua-rs` in the nesting worker).
4.  **DO NOT** set build context to `workers/nesting` (the Dockerfile uses root-relative paths).
