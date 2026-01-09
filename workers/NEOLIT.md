# CONTAINER: Workers

Workers are independent processing units that handle long-running or computationally intensive tasks. They communicate with the main application primarily through MongoDB job queues.

## Worker List
- **[nesting](./nesting/):** The primary worker responsible for 2D bin packing. It uses the `jagua-rs` library (via Python) to generate optimal layouts.
- **[fileprocessing](./fileprocessing/):** Legacy worker for converting uploaded DXF files into SVG previews.
- **[cassette-processing](./cassette-processing/):** Specialized processing for parametric cassette templates.

## Communication Pattern
1. Main App creates a job document (e.g., in `nesting_jobs` collection).
2. Worker polls for `pending` status.
3. Worker updates status to `processing`.
4. Worker fetches required files from GridFS.
5. Worker performs task and saves results back to GridFS.
6. Worker updates job document to `complete` or `failed`.

## Deployment
Workers are typically deployed as separate containers using Docker Stack:
```bash
docker stack deploy -c docker-stack-external.yml nest2d
```
