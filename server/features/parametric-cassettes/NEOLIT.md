# COMPONENT: Parametric Cassettes

Handles the evaluation and "baking" of parametric cassette templates into static DXF files. This allows parametric designs to be used by the generic nesting engine and provides instant downloads for users.

## Core Files
- `service.js`: Business logic for geometry evaluation and baking.
- `repository.js`: Database operations for template lookup and baked instance storage.

## Data Structures

### EvaluationResult
```typescript
{
  polygons: Array<{
    coordinates: Array<[number, number]>
  }>,
  dimensions: { [key: string]: number }
}
```

### Baked Cassette (DB)
Baked instances are stored in the `cassettes` collection with `type: "BAKED_PARAMETRIC"` and `isTemporary: true`.

## Workflows

### 1. Baking for Nesting
Triggered during `POST /api/batch/:id/nest`:
1. System identifies entries using `PARAMETRIC` templates.
2. For each unique set of dimensions, `bakeTemplateInstance` is called.
3. A DXF is generated and stored in GridFS.
4. A temporary cassette document is created in the database.
5. The nesting job is created using the ID of the baked cassette.
6. The worker processes the baked cassette as a standard DXF-based cassette.

### 2. Instant Export
Triggered by `GET /api/cassettes/:id/export?A=...&B=...`:
1. Template is fetched and validated.
2. Geometry is evaluated on-the-fly using query parameters.
3. A DXF string is generated and returned directly to the client.

## Algorithmic Consistency
The module uses the same `nodi-modular` WASM engine and `cassetteGraphBuilder` utility as the frontend designer. This ensures 100% parity between the visual designer and the generated nesting/export DXF files.

## Shared Utilities
- `server/utils/cassetteGraphBuilder.js`: Shared by both frontend components and backend services to construct the geometry evaluation graph.
