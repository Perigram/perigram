# COMPONENT: Database Layer

This directory manages the connection to MongoDB and handles schema indexing.

## Core Files
- `mongo.js`: Singleton connection manager using the native MongoDB driver.
- `indexes.js`: Script for creating and listing collection indexes.

## Storage
- **Collections:** Standard documents (users, projects, etc.).
- **GridFS:** MongoDB file storage system with buckets:
  - `avatars`: User profile images.
  - `cassettes`: DXF files for cassette templates.
  - `userDxf`: Legacy DXF storage for workers.
  - `artifacts`: Generated nesting results (SVG, DXF, G-code, PDF).

## Index Management
Indexes are defined in `indexes.js` and can be managed via CLI:
- `node server/db/indexes.js create` - Apply all defined indexes.
- `node server/db/indexes.js list [collection]` - View current indexes.

Key indexes include unique constraints on natural keys (`slug`, `code`), foreign keys (`ownerId`), and compound indexes for common query patterns.
