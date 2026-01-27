# CONTAINER: Workers

Workers are independent units handling CPU-intensive tasks via MongoDB job queues.

## Worker List
- **[nesting](./nesting/):** The primary 2D bin packing worker using `jagua-rs`.
- **[fileprocessing](./fileprocessing/):** Processes uploaded DXF files into metadata and previews.
- **[cassette-processing](./cassette-processing/):** Specialized processing for parametric templates.

## Communication Pattern
1.  **App** creates a job document in `nesting_jobs` or similar collection.
2.  **Worker** polls for `pending` jobs.
    *   Updates status to `processing`.
    *   Fetches files from GridFS.
    *   Saves results (SVG, DXF, PDF) back to GridFS.
    *   Updates status to `complete` or `failed`.

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
Workers are deployed via Docker Stack:
```bash
docker stack deploy -c docker-stack-external.yml cutkit
```