# Cassette Designer Migration To OCCS

This note maps the current CutKit cassette designer/runtime format to the new
OCCS v0.4 draft package in [Cassette spec](<./Cassette spec/SPEC.md>) and
describes how to move without breaking existing templates.

## Target Format

OCCS makes the cassette definition a canonical JSON document instead of a small
designer graph:

- top level: `occs`, `documentType`, `id`, `units`, `parameters`,
  `definitions`, and `cassette`
- templates: `documentType: "template"` with symbolic parameters and semantic
  layers
- designs: `documentType: "design"` with exact parameters and optional
  `derivedFrom` metadata
- workpieces: reusable physical parts in `definitions.workpieces[]`
- sheet workpieces: `faces[]`, `folds[]`, and `entities[]`
- geometry: face-local `trapezoid` or `polygon` shapes
- layer intent: semantic IDs such as `cut.outer`, `cut.inner`,
  `cut.hole`, and `fold.route`

The current recursive schema in [cassette-schema.md](./cassette-schema.md) is
legacy. The OCCS package already includes a direct v0.1-to-v0.4 mapping in
[MIGRATION_FROM_V0_1.md](<./Cassette spec/MIGRATION_FROM_V0_1.md>), but the
live app currently uses a different compact designer graph.

## Current Live Format

The live designer persists this shape under `cassette.data.definition`:

```json
{
  "params": { "A": 600, "B": 600 },
  "extrusions": [
    { "edge": 2, "param": "R1", "type": "flange" }
  ],
  "layers": {}
}
```

Current owners:

| File | Current responsibility |
|---|---|
| [components/CassetteDesigner.vue](../../components/CassetteDesigner.vue) | Owns editor state as `{ params, extrusions, layers }`, renders parameters with `InputNumber`, adds extrusions by clicked boundary edge index, saves through `saveCassetteTemplate`. |
| [components/shared/DrawingCanvas.vue](../../components/shared/DrawingCanvas.vue) | For `source-type="parametric-cassette"`, calls `renderCassetteToSVG()`, normalizes the result into `{ viewBox, layers }`, and emits edge-index designer actions. |
| [utils/cassetteRenderer.js](../../utils/cassetteRenderer.js) | Browser-side Nodi WASM renderer. Loads `/Cassette.json`, builds a Nodi graph, and returns the largest evaluated curve as boundary. |
| [server/utils/cassetteGraphBuilder.js](../../server/utils/cassetteGraphBuilder.js) | Converts `{ params, extrusions }` into Nodi nodes: parameter numbers, one root rectangle from `A/B`, then a linear chain of grow operations by numeric edge index. |
| [server/features/cassettes/operations.js](../../server/features/cassettes/operations.js) | Converts command input into cassette service data. `definition` is opaque, so it can carry OCCS after validation is added. |
| [server/features/cassettes/service.js](../../server/features/cassettes/service.js) | Stores `data.type`, `data.definition`, and `data.parameters`; updates legacy direct `params/extrusions` into `definition`. |
| [server/features/parametric-cassettes/service.js](../../server/features/parametric-cassettes/service.js) | Backend Nodi evaluation, DXF generation, and baked cassette creation. Assumes `definition.params` and `definition.extrusions`. |
| [components/CassetteThumbnail.vue](../../components/CassetteThumbnail.vue) | Reads old graph fields to render thumbnails through `parametric-cassette`. |

Important consequences:

- `extrusions[].type` affects the designer UI only; the Nodi graph builder does
  not use it.
- `extrusions[].edge` is a boundary edge index at the moment the extrusion was
  added, not a stable `face.edge` reference.
- expressions are not supported in the UI because parameters are edited with
  `InputNumber`.
- current backend export/bake emits only evaluated polygons and uses hardcoded
  DXF layer names, not the OCCS semantic layer registry.

## Storage Contract

Do not create a new collection or route for OCCS. Keep cassette templates in the
existing v24 DTO shape:

```json
{
  "data": {
    "type": "PARAMETRIC",
    "definition": { "occs": "0.4-draft" },
    "parameters": ["A", "B", "R_TOP"]
  }
}
```

Use `definition.occs` plus `definition.documentType` as the discriminator:

- old graph: `definition.params || definition.extrusions`
- OCCS template/design: `definition.occs && definition.documentType`

`data.parameters` remains the quick UI/search list and should be derived from
`Object.keys(definition.parameters || {})` for OCCS definitions.

## Migration Roadmap

### 1. Add OCCS Runtime Utilities

Create runtime modules outside `docs/` using the package toolkit as reference,
not as an import target:

- expression parsing and evaluation for numbers, identifiers, `+ - * /`, unary
  minus, and parentheses
- schema/structural validation for the fields the app will use first
- sheet resolver for trapezoid faces, inherited base length, fold placement,
  and flat-pattern coordinates
- drawing normalizer that emits the shared canvas contract:
  `{ viewBox, layers: [{ name, standardCode, paths }] }`

The utility should preserve the OCCS document unchanged and return derived
render/evaluation output separately. Do not replace expressions with resolved
numbers in template documents.

### 2. Add Dual-Format Rendering

Extend the existing drawing path before changing the editor:

- teach `CassetteThumbnail` and `DrawingCanvas` to detect OCCS definitions
- add an `occs-cassette` source type, or branch inside `parametric-cassette`
  when `source.occs` exists
- render sheet faces into `contour.flat_pattern.face_and_returns`
- render fold lines into `fold.route`
- render `entities[]` by their own semantic `entity.layer`
- build designer edge handles from resolved `faceId.edgeId`, not from boundary
  array index

Keep the old Nodi path for old graph definitions during this phase.

### 3. Convert Designer State To OCCS

Replace `cassetteData = { params, extrusions, layers }` with an OCCS document:

- default document:
  - `documentType: "template"`
  - `units: "mm"`
  - `parameters: { A, B, T, BR }`
  - one `sheet` workpiece with a `main` trapezoid face
  - one cassette occurrence referencing the sheet workpiece
- parameter editor:
  - use expression-capable text inputs for template parameters
  - optionally keep a resolved numeric preview value beside the expression
- edge action:
  - receive `{ workpieceId, faceId, edge: "E2" }`
  - create a new face with `shape.baseLength: "inherit"`
  - create a fold from the clicked edge to the new face `E0`
  - assign semantic role from the UI choice, for example `return_flange`,
    `mounting_flange`, or `visible`
- save:
  - send the full OCCS document as `parameters.definition`
  - send `Object.keys(definition.parameters)` as `parameters.parameters`

This makes user edits stable because future changes target explicit faces and
folds instead of mutable boundary edge indexes.

### 4. Update Backend Bake And Export

`saveCassetteTemplate` can keep the same command shape, but the service should
validate OCCS before persisting.

For `server/features/parametric-cassettes/service.js`, split evaluation by
definition format:

- old graph: keep current Nodi path temporarily
- OCCS template: materialize template + exact parameters into an OCCS design
- emit:
  - flat-pattern polygons by semantic layer
  - `cassette_design.data.geometry.preview` for UI
  - `cassette_design.data.geometry.occs` or equivalent design snapshot
  - `cassette_design.data.parameters` as the exact parameter set
  - `derivedFrom` inside the OCCS design

DXF export should map semantic layers through layer standards and pen templates.
The nesting polygon should be selected by the configured nesting layer standard,
not by a hardcoded layer string. Non-nesting layers must be preserved with
transform data so artifact generation can place them back onto nested cassettes.

### 5. Convert Existing Templates

Provide a one-way converter for old graph records:

1. Create an OCCS `template` document.
2. Map `params` to top-level `parameters`.
3. Create one sheet workpiece `tray_def`.
4. Convert `A/B` to `main.shape.baseLength` and `main.shape.height`.
5. Replay old `extrusions` in order with the same resolver used by the current
   preview, because `edge` is not a stable face reference.
6. For each replayed extrusion, create:
   - a new face with `baseLength: "inherit"` and `height: ext.param`
   - a fold from the matched source face edge to the new face `E0`
   - a role derived from `ext.type`, defaulting to `return_flange`
7. Preserve the original graph under `definition.extensions.cutkitLegacyGraph`
   until converted templates have been verified.

Because old records only store edge indexes, conversion should be treated as
best-effort for complex historical templates. For production-critical records,
materialize and compare the old Nodi preview with the OCCS flat pattern before
removing the legacy graph.

### 6. Remove Legacy Path After Verification

Only remove the Nodi graph path when these are true:

- old graph fixture templates convert to valid OCCS documents
- OCCS thumbnails and designer previews match the expected examples
- bake/export returns semantic layer data, not just one boundary polygon
- queue nesting consumes only the configured nesting layer
- artifacts can reconstruct non-nesting layers using nesting transforms
- existing `PARAMETRIC` templates still load through compatibility conversion

## Verification Targets

Minimum checks for the migration implementation:

- OCCS examples in [Cassette spec/examples](<./Cassette spec/examples>) pass
  validation.
- unit tests cover expression evaluation, trapezoid resolution, inherited fold
  lengths, and layer normalization.
- a converted `{ A, B, extrusions: [] }` graph produces one OCCS `main` face.
- a converted one-extrusion graph produces one additional face and one fold.
- `CassetteDesigner` saves OCCS and reopens the same OCCS without changing IDs.
- `CassetteThumbnail` renders both old graph and OCCS definitions during the
  compatibility window.
- `server/features/parametric-cassettes` can export a DXF from an OCCS template
  without hardcoded production layer names.
- `node scripts/check-arch.js` passes after backend code changes.

## Recommended First Implementation Slice

The smallest useful slice is:

1. add OCCS detection, validation, and flat-pattern rendering utilities;
2. render `simple-tray.occs.json` through `DrawingCanvas`;
3. save new designer templates as OCCS while keeping old graph rendering;
4. update backend export for OCCS templates;
5. add the old-graph converter and migrate existing records.

This keeps persistence stable while moving the high-risk geometry and layer
logic behind testable utilities.
