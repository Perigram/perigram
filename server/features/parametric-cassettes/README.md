# COMPONENT: Parametric Cassettes

Handles the evaluation and "baking" of parametric cassette templates into static DXF files. This allows parametric designs to be used by the generic nesting engine and provides instant downloads for users. Legacy templates use Nodi; OCCS v2 templates with CutKit graph-tree extensions use the canonical OCCS helpers.

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
  nestingPolygons?: Array<{
    coordinates: Array<[number, number]>,
    workpieceId?: string,
    workpieceDefinitionId?: string,
    occurrenceId?: string
  }>,
  layerData?: Array<{
    layer: string,
    coordinates?: Array<[number, number]>,
    geometry?: Object
  }>,
  dimensions: { [key: string]: number },
  annotations?: {
    dimensions: Array<{
      layer: "dimension.cassette",
      geometry: Object,
      value: { mode: "measured", value: number, unit: "mm" }
    }>
  }
}
```

### Baked Cassette (DB)
Baked instances are stored in the `cassettes` collection with `type: "BAKED_PARAMETRIC"` and `isTemporary: true`.
Template inputs use flexible ID handling (`toFlexibleId`) to support both
string UIDs and ObjectIds; persisted lineage uses structured entity references.
Generated DXF data uses layer standard codes by default. OCCS graph-tree baking
uses the semantic `cut.outer` boundary layer from evaluated production data;
legacy Nodi fallback output keeps `contour.flat_pattern.face_and_returns` for
the nesting/boundary layer and `contour.cassette_face` for internal face
geometry. Export aliases and drawing pens are resolved by the layer-standard
catalogue rather than hardcoded here.
OCCS v2 baked instances also store evaluated dimension annotations under
`data.annotations.dimensions`; these use the semantic `dimension.cassette`
layer and numeric measured values, while the source template keeps expression
labels in its OCCS entities. Baked OCCS layer data also includes
`code.cassette_mark` text entries generated from the template identity and
workpiece number so nested sheets can show production cassette marks.

## Workflows

### 1. Baking for Nesting
Triggered during `POST /api/queue/:id/nest`:
1. System identifies entries using `PARAMETRIC` templates.
2. For each unique set of dimensions, `bakeTemplateInstance` is called.
3. Legacy templates are evaluated through Nodi; OCCS v2 templates are evaluated
   through `utils/occs/evaluate.js` into `cut.outer` nesting polygons. OCCS
   `sheet` workpieces are baked independently in local workpiece space, so one
   source template can create multiple `polygonParts`.
4. A DXF is generated and stored in GridFS.
5. A temporary cassette document is created in the database.
6. The nesting job is created using the ID of the baked cassette. Each baked
   sheet workpiece is a separate polygon part, while lineage keeps the original
   template reference on the single baked cassette.
7. The worker processes the baked cassette as a standard DXF-based cassette.

Existing baked instances are reused only when they match the current template
contract. OCCS bakes must contain workpiece metadata on `polygonParts` and a
`cut.outer` entry in `layerData`; older baked records without those fields are
ignored so changed template/workpiece structure is re-evaluated.

### 2. Instant Export
Triggered by `GET /api/cassettes/:id/export?A=...&B=...`:
1. Template is fetched and validated.
2. Geometry is evaluated on-the-fly using query parameters.
3. A DXF string is generated and returned directly to the client.

## Algorithmic Consistency
Legacy templates use the same `nodi-modular` WASM engine and
`cassetteGraphBuilder` utility as the legacy frontend designer. OCCS v2
templates use the same graph-tree, trapezoid, Clipper, and layer helpers as
Cassette Designer v2 previews, so saved workbench templates feed nesting
without re-entering Nodi.
Runtime requires `nodi-modular/index_bg.wasm` to be present in the production image (copied from node_modules or bundled in the Nuxt output).
Runtime also requires `public/Cassette.json` to be present in the production image.
The engine instance is stateful and not concurrency-safe for parallel `loadGraph`/`evaluate`.
`service.js` enforces this with a process-wide evaluation lock and per-call deep cloning of the template graph before `loadGraph`.

## Shared Utilities
- `server/utils/cassetteGraphBuilder.js`: Shared by both frontend components and backend services to construct the geometry evaluation graph.
- `utils/occs/evaluate.js`: Evaluates OCCS v2 graph-tree templates into
  production cut polygons and fold layer data, split by `sheet` workpiece for
  nesting.
