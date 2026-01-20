# COMPONENT: Server Features

This directory contains the core business logic modules of the application. Each module follows the Service-Repository pattern to ensure clean separation of concerns.

## Module Structure
Each feature is organized into a directory containing:
- `repository.js`: Direct database interactions (MongoDB).
- `service.js`: Business logic, validation, and ownership checks.
- `index.js`: Public API for the module.

## Key Modules
- **[cassettes](./cassettes/):** Manages parametric cassette templates and DXF layer mappings.
- **[parametric-cassettes](./parametric-cassettes/):** Evaluates and bakes parametric templates into static DXFs.
- **[queues](./queues/):** Orchestrates production runs, entry management, and nesting status.
- **[cassette-instances](./cassette-instances/):** Tracks physical cassette lifecycle from production to installation.
- **[artifacts](./artifacts/):** Handles generated files (SVG, DXF, PDF, G-code) stored in GridFS.
- **[nesting](./nesting/):** Orchestrator for nesting jobs and worker communication.
- **[layer-standards](./layer-standards/):** System-wide layer catalogue for DXF interpretation.
- **[tool-profiles](./tool-profiles/):** CNC tool library management.

## Module Creation
New modules should be created using the template at `server/features/_template/`:
```bash
cp -r server/features/_template/ server/features/your-module/
```
Update `COLLECTION` in `repository.js`, validation in `service.js`, and exports in `index.js`.

## API Endpoint Index
### Projects
- `POST /api/project` - Create project
- `GET /api/project/:slug` - Get details
- `DELETE /api/project/:slug` - Delete project
- `GET /api/project/me` - List user projects

### Cassettes
- `POST /api/cassettes/upload` - Client-side DXF parse + upload
- `GET /api/cassettes` - List user cassettes
- `PUT /api/cassettes/:id` - Update mappings/parameters

### Queues & Production
- `POST /api/project/:slug/queues` - Create production run
- `GET /api/project/:slug/queues` - List for project
- `POST /api/queue/:id/nest` - Trigger nesting worker job
- `GET /api/queue/:id/artifacts` - List generated files
- `POST /api/queue/:id/choose-run` - Mark completed run as chosen
- `POST /api/queue/:id/mark-cut` - Mark queue as cut (requires chosen run)
- `POST /api/queue/:id/reset-status` - Reset to draft status
- `GET /api/queue/:id/instances` - List cassette instances for queue

## Conventions
- **User IDs:** Authenticated user IDs are strings (OAuth provider IDs), not MongoDB ObjectIds.
- **Ownership:** Every service must verify that the requesting user owns the resource before performing updates or deletions.
- **Data Access:** Never access the database directly from API handlers; always use the service layer.
