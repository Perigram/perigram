# CONTAINER: Facade Plugin Executor

The facade fabrication domain as a third-party plugin (SPEC §20): `listing.json` is the whole declaration surface (types,
services, editor bindings, preview bindings,
service-backed construction bindings, exports), and this
process is the executor that owns the domain's compute and its UI. The
platform carries zero facade code — it reaches this executor per
configured service endpoint (endpoint mode), sending referenced
instances and payloads as base64 values and receiving computed fields
and files. The executor never calls back.

Runs from the repo mount (compose `facade-executor`, port 8790) or as
its own deployment — nothing here imports platform code. The OCCS
engine (`occs/`) is the domain's single copy: the executor's
construction services and the browser-side surfaces both use it, the
executor serves it statically, and
[`occs/layerStandards.js`](./occs/README.md) ships the cassette layer
standards every renderer, editor, and preview bakes
(the layer law lives in the OCCS README).

The types' glyphs are the hand-drawn `ck-entity-icons` font classes
(`ck-entity-icon ck-entity-icon-cassette-template` &c. — consumed like
any `pi pi-*` string); the font builds from the owner-authored SVG
sources in `public/icons/data-model/cnc-domain/`
([build contract](../../scripts/README.md)).

## Editor surfaces

The plugin's editor modules live in `surfaces/` and are served by this
executor as static GETs beside the services (the install-resolved module
URL `http://<origin>/surfaces/<module>.mjs`; CORS-open,
path-traversal-refused — the URL is the only credential the browser
gets). Each module targets a surface mount contract
([plugin-surfaces](../../shared/plugin-surfaces.js)):

| Surface | Kind | Contract | Serves |
|---|---|---|---|
| `sheet-design-editor` | editor | 5 | The sheet-design type's multi-sheet canvas: one panel per sheet-design record (the opened record beside its siblings), placements grab/add/rotate/drag gated on sheet containment and non-overlap, cross-panel drops move a placement between records (the source item travels with it, the target sheet's free sweep re-clamps it, both records commit on save); new sheets construct blank records and removal deletes them through the mount's construct/remove transports; OCCS pen-base layer styling; saves patch each dirty record's geometry and its typed `parts` relation (one cassette-design ref per placement) together; layout compute in `surfaces/lib/`. |
| `cassette-designer` | editor | 2 | The cassette-template type's designer: parametric face graph, workpieces/attachments, profile sketch, folded 3D preview; saves also evaluate the document into the record's declared geometry fields (`fields.polygonParts`, `fields.layerData` — the DXF import's contract). Engine and render family in [`occs/`](./occs/README.md) and `surfaces/lib/`; the surface graph imports vendored modules only (`perigram-plugin surfaces` refuses npm imports). |
| `cassette-preview` | preview | 1 | Read-only cassette-template/cassette-design preview: baked geometry rows when the record carries them, else the payload OCCS document through the plugin renderer; the preview layer set follows the OCCS README's [preview layer law](./occs/README.md). |
| `profile-preview` | preview | 1 | The profile library type's preview: the stored sketch through the boolean fold (`resolveOccsProfileSketchLayerData`) and the shared drawing-preview normalizer; blank when the sketch does not resolve. |

## Services

Service compute is value→value (SPEC §8): payload values in, computed
values and files out, free of service imports, persistence, and auth.

| Service | Construction/flow | Contract |
|---|---|---|
| `extract-geometry` | cassette-design `upload`/`convertDxf` | DXF payload (base64) in → `{ data: { geometry } }` out |
| `bake` | cassette-design `render` | template ref (payload = OCCS document, base64) + parameters in → evaluated geometry out |
| `nesting-solve` | the `plugin.facade.nesting-solve` value service | SPEC §8 signature (`sheetWidth`/`sheetHeight` default 1220×2440 mm — the prompted run parameters; each item carries its `designId` — the cassette-design it projects from — as a required key); calls the nesting worker at `NESTING_WORKER_URL` ([full `/nest` endpoint](../nesting/README.md)); every output layout ships self-contained (`sourceItems` resolve its placements, each carrying its workpiece layers and `design_id` provenance, and `sheetPolygon` carries its bin shape), and layouts cutting the same design multiset join into one entry carrying the group's `count` |
| `nesting-parts` | the cassette-design `nesting-polygons` projection | the instance's stored geometry in → nesting polygon parts out, each riding its workpiece layers (joined by `workpieceId`) so solved layouts compose sheet layers under the placement transform |
| `generate-sheet-dxf` | the sheet-design `dxf` export binding | the record's stored values (`fields`) in → DXF `payload` out (executor payload contract) |
| `construct-sheet` | sheet-design `fromLayout` | a solved layout value (or a blank) plus the resolved `designs` refs in → `{ data: { geometry }, relations: { parts } }` out (one pinned cassette-design ref per placement; the parts edge is the sheet-design type's declared relation) |

## Vendored engines

- `vendor/dxf-extractor.js`, `vendor/dxf-writer.js` — the DXF engine
  behind `extract-geometry` and `generate-sheet-dxf`.
- `assets/vendor/clipper2/` — the wasm Clipper behind the boolean/fold
  geometry passes (`surfaces/lib/cassetteV2Clipper.js`).
- `assets/vendor/three/` — the folded 3D preview runtime
  ([rewrite rule](./assets/vendor/three/README.md)).
- the MLightCAD CAD runtime —
  [tech-drawing's vendored copy](../tech-drawing/assets/vendor/cad-viewer/README.md),
  consumed through the declared `cad-viewer` dependency (the
  cross-plugin vendor seam).

## Publish, install, migrate

- Listing: `workers/facade/listing.json` (validated by
  [@perigram/plugin-sdk](../../packages/plugin-sdk/README.md) —
  `npx perigram-plugin validate workers/facade/listing.json`).
- Publish + install: the publish API (`POST /api/plugins/catalog`) and
  the org install route, or the CLI (`perigram-plugin publish`,
  `install`).
- Upgrades apply through the
  [plugins feature](../../server/features/plugins/README.md)
  (diff preview plus migration steps).
- Existing orgs: `server/scripts/migrate-facade-pack-to-plugin.js`
  (type ids unchanged) and
  `server/scripts/migrate-profile-sketches-to-shapes.js` (one-shot,
  dry-run by default) — see the
  [scripts README](../../server/scripts/README.md).

Parent: [workers README](../README.md). Domain law: [SPEC.md](./SPEC.md).
Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
