# CONTAINER: Facade Plugin Executor

The facade fabrication domain as a third-party plugin (SPEC §Plugin
marketplace, owner decision 2026-10-10): `listing.json` is the whole
declaration surface (types, services, editor bindings, preview bindings,
attachment kinds, conversions, service-backed construction bindings,
exports), and this process is the executor that owns the domain's compute
and its UI. The platform carries zero facade code — it reaches this
executor per configured service endpoint (endpoint mode), sending
referenced instances and payloads as base64 values and receiving computed
fields and files. The executor never calls back.

Runs from the repo mount (compose `facade-executor`, port 8790) or as
its own deployment — nothing here imports platform code. The OCCS engine
(`occs/`) is the domain's single copy: the executor's construction
services and the browser-side surfaces both use it, the executor serves
it statically, and `occs/layerStandards.js` ships the cassette layer
standards with their pens (the pre-extraction system seeds) that every
renderer, editor, and preview bakes through `applyOccsLayerPens`.

The types' glyphs are the hand-drawn `ck-entity-icons` font classes
(`ck-entity-icon ck-entity-icon-cassette-template` &c. — consumed like
any `pi pi-*` string); the font builds from the owner-authored SVG
sources in `public/icons/data-model/cnc-domain/`
([build contract](../../scripts/README.md)).

## Editor surfaces

The plugin's editor modules live in `surfaces/` and are served by this
executor as static GETs beside the services (the install-resolved module
URL `http://<origin>/surfaces/<module>.mjs`; CORS-open, path-traversal
refused — the URL is the only credential the browser gets). Each module
targets a surface mount contract
([plugin-surfaces](../../shared/plugin-surfaces.js)):

| Surface | Kind | Contract | Serves |
|---|---|---|---|
| `sheet-design-editor` | editor | 2 | The sheet-design type's editor: layout drag/rotate/snap, layer-pen styling (the OCCS pen base from [`occs/layerStandards`](./occs/README.md); an org `layer-standard` row with the same code overrides), save through the mount's patch transport. Drag and rotate gate against the stored layout's own contract — sheet containment plus non-overlap; kerf spacing is the nesting solve's, applied to compensated shapes. Pure layout compute in `surfaces/lib/`. |
| `cassette-designer` | editor | 2 | The cassette type's designer: parametric face graph, workpieces/attachments, profile sketch and folded 3D preview. Engine and render family in [`occs/`](./occs/README.md) and `surfaces/lib/`; the three.js preview runtime is vendored under `assets/vendor/three/`, the profile sketch canvas runs the vendored MLightCAD CAD engine under `assets/vendor/cad-viewer/` (DXF drawing/import; the open-source DWG parser is GPL and stays out) — the surface graph never imports an npm package (`perigram-plugin surfaces` walks and refuses it). |
| `cassette-preview` | preview | 1 | The cassette and cassette-design types' read-only preview (M7): baked geometry rows when the record carries them, else the payload OCCS document through the plugin renderer; mounts in the platform's card and detail preview slots over `{ record, payload }`. Preview layer set (owner direction 2026-10-17): outline (`cut.outer`) and folds (`fold.route`) only, matched by layer `standardCode` (layer names are localized export names) — resolved by `cassettePreviewLayerSelection` in `surfaces/lib/drawingPreview.js`, the single home the designer's load-picker thumbnails reuse; a drawing outside the set renders all layers. |
| `profile-preview` | preview | 1 | The profile library type's read-only preview: the record's stored sketch through the boolean fold (`resolveOccsProfileSketchLayerData`) and the shared drawing-preview normalizer; quiet blank when the sketch does not resolve. |

## Services

| Service | Construction/flow | Contract |
|---|---|---|
| `extract-geometry` | cassette-design `upload`/`convertDxf` | DXF payload (base64) in → `{ data: { geometry } }` out |
| `bake` | cassette-design `bake` | template ref (payload = OCCS document, base64) + parameters in → evaluated geometry out |
| `nesting-solve` | the `plugin.facade.nesting-solve` value service | SPEC §8 signature (`sheetWidth`/`sheetHeight` default 1220×2440 mm — the prompted run parameters); calls the nesting worker (`NESTING_WORKER_URL`); every output layout ships self-contained (`sourceItems` resolve its placements, each carrying its workpiece layers, and `sheetPolygon` carries its bin shape) |
| `nesting-parts` | the cassette-design `nesting-polygons` projection | the instance's stored geometry in → nesting polygon parts out, each riding its workpiece layers (joined by `workpieceId`) so solved layouts compose sheet layers under the placement transform |
| `import-cassette` | the `dxfSourceToCassette` conversion | artifact buffer + layer mapping in → cassette payload + extracted fields out |
| `generate-sheet-dxf` | the sheet-design `LAYOUT_DXF` export binding | stored geometry values in → DXF text out |
| `construct-sheet` | sheet-design `fromLayout` | one solved layout value in → `{ data: { geometry, parts } }` out (the editor's stored geometry shape; one cassette ref per placement) |

## Publish, install, migrate

- Listing: `workers/facade/listing.json` (validated by
  [@perigram/plugin-sdk](../../packages/plugin-sdk/README.md) —
  `npx perigram-plugin validate workers/facade/listing.json`).
- Publish + install: the publish API (`POST /api/plugins/catalog`) and the
  org install route, or the CLI (`perigram-plugin publish`, `install`).
  Deploys bump `version` and re-publish — installed organizations then see
  the available-version tag and upgrade through the Plugins page (the §11
  diff preview with declared migration steps).
- Existing orgs: `server/scripts/migrate-facade-pack-to-plugin.js`
  swapped the mounted pack for the install (an install
  snapshot + service-node rewrites `nesting.solve` →
  `plugin.facade.nesting-solve`); type ids are unchanged, so instances
  and process bindings resolve continuously. Stored profile sketches
  cross into the shape model through
  `server/scripts/migrate-profile-sketches-to-shapes.js` (one-shot,
  dry-run by default — see
  [scripts README](../../server/scripts/README.md)).

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
