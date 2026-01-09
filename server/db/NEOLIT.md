# COMPONENT: Database Layer

This directory manages the connection to MongoDB and handles schema indexing.

## Core Files
- `mongo.js`: Singleton connection manager using the native MongoDB driver.
- `indexes.js`: Script for creating and listing collection indexes.

## Storage
- **Collections:** Standard documents (users, projects, etc.).
- **GridFS:** Large files (DXF, SVG, PDF) are stored in buckets:
  - `cassettes`: Cassette DXF files.
  - `userDxf`: Legacy DXF storage for workers.
  - `artifacts`: Generated nesting results.

## Index Management
Indexes are defined in `indexes.js` and can be managed via CLI:
```bash
node server/db/indexes.js create
```
Key indexes include unique constraints on slugs and compound indexes for project-based queries.
