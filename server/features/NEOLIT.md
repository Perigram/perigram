# COMPONENT: Server Features

This directory contains the core business logic modules of the application. Each module follows the Service-Repository pattern to ensure clean separation of concerns.

## Module Structure
Each feature is organized into a directory containing:
- `repository.js`: Direct database interactions (MongoDB).
- `service.js`: Business logic, validation, and ownership checks.
- `index.js`: Public API for the module.

## Key Modules
- **[cassettes](./cassettes/):** Manages parametric cassette templates and DXF layer mappings.
- **[batches](./batches/):** Orchestrates production runs, entry management, and nesting status.
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

### Batches & Production
- `POST /api/project/:slug/batches` - Create production run
- `GET /api/project/:slug/batches` - List for project
- `POST /api/batch/:id/nest` - Trigger nesting worker job
- `GET /api/batch/:id/artifacts` - List generated files

## Conventions
- **User IDs:** Authenticated user IDs are strings (OAuth provider IDs), not MongoDB ObjectIds.
- **Ownership:** Every service must verify that the requesting user owns the resource before performing updates or deletions.
- **Data Access:** Never access the database directly from API handlers; always use the service layer.
