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
| `sheet-design-editor` | editor | 4 | One canvas over the opened record's lineage family: the sheets sharing its parents under the declared containment's lineage keys join beside it; the sheet picker adds any org sheet explicitly (family members first) and add-all covers the family alone (the facade SPEC's family law). The family sits on a wrapped rack; a sheet moves by its label band and rotates a quarter turn about its center, placements riding in sheet-local frames. Navigation follows the DrawingCanvas law — wheel zoom at the cursor, shift-drag pan, dock zoom/fit. Placements grab/add/rotate/drag magnetically (containment and non-overlap gates); a drop on another sheet moves the placement between records (the source item travels, the target's free sweep re-clamps, both records commit on save). The inspector panel carries the working set and the record behind a selection as instance tiles (`InstanceInlineRef` `variant="tile"`; the working-set tile activates its sheet on click, marks the active sheet, and carries its remove × at the row's trailing end); the active sheet's placed cassette-designs render as the actual instance tiles beside the sheet tile, placement geometry reads on the canvas; the working set groups by parent map — each distinct lineage heads its own group with its chain over its sheets, the opened record's group first; the sheet picker adds any org sheet explicitly (family members first) and add-all covers the family alone; the palette carries margin and layer visibility. The design picker picks-to-add (a picked design places on the active sheet) and passes `entity`+`typeId` and no label: InstanceSelect renders the §22.13 option rows and derives the label and filter text host-side. Layer pens resolve the org `defaultPen` relation over the OCCS base ([pen law](./SPEC.md)); saves patch every dirty record's geometry and its typed `parts` relation together; a sheet behind more than one cut plan carries the split action, which creates another sheet design with the same geometry and moves one cut plan onto it. Layout compute in `surfaces/lib/`. |
| `cassette-designer` | editor | 2 | The cassette-template type's designer: parametric faces (trapezoid or the profile shape model), workpieces/attachments, profile sketch, folded 3D preview. Faces and open profiles allocate free shards on a shared host edge through expression spans; folds and contours use the owned interval, and the canvas draws one + per free shard. The face-shape dialog is the profile editor in face mode, with the parent edge as its datum line. A placed profile's section geometry is its canvas hit area, and one compact popup carries its placement grid, name-and-value parameter fields, edit, and delete (the facade SPEC's canvas profile law); the canvas toolbar carries Add profile. The profile dialog's library pick rides the host pack's `InstanceSelect` (instance option rows, SPEC §22.13), and its compact row saves the draft to the origin library record, saves it as a new record, or deletes the origin record (the facade SPEC's library workflow); saves also evaluate the document into the record's declared geometry fields (`fields.polygonParts`, `fields.layerData` — the DXF import's contract). Engine and render family in [`occs/`](./occs/README.md) and `surfaces/lib/`; `surfaces/lib/profileAnnotations.js` builds the canvas dimensions, face hatch and outline, axis and origin as native CadCraft entities on derived layers (locked decorations, editable dimensions), and a dimension label opens its authored field in place. The surface graph imports vendored modules only (`perigram-plugin surfaces` refuses npm imports). |
| `cassette-preview` | preview | 1 | Read-only cassette-template/cassette-design preview: baked geometry rows when the record carries them, else the payload OCCS document through the plugin renderer; the preview layer set follows the OCCS README's [preview layer law](./occs/README.md). |
| `profile-preview` | preview | 1 | The profile library type's preview: the stored sketch through the boolean fold (`resolveOccsProfileSketchLayerData`) and the shared drawing-preview normalizer; blank when the sketch does not resolve. |

## Services

Service compute is value→value (SPEC §8): payload values in, computed
values and files out, free of service imports, persistence, and auth.

| Service | Construction/flow | Contract |
|---|---|---|
| `extract-geometry` | cassette-design `upload`/`convertDxf` | DXF payload (base64) plus `draft.data.mapping` (`{ sourceLayer: occsLayerCode }`) in → `{ data: { geometry, mapping } }` out; the upload create's declared `mapping` input renders the layer-mapping control over the uploaded file, and `cut.outer` needs one mapped closed-polygon layer |
| `bake` | cassette-design `render` | template ref (payload = OCCS document, base64) + parameters in → evaluated geometry out; the render create's `parameters` input carries the `cassette-parameters` control, which reads the picked template's OCCS parameter table through the served designer module |
| `nesting-solve` | the `plugin.facade.nesting-solve` value service | SPEC §8 signature (`sheetWidth`/`sheetHeight` default 1220×2440 mm — the prompted run parameters). Items are job geometry: explicit `{designId, designKey, polygonParts, count}` records, projection parts, or the elements themselves — a part's own `designId`, an element's `_id`, or the item's `designId` keys it; `count` is the physical cassette quantity; `designKey` names the cassette-design composition; an element's own `fields.geometry` supplies its parts; a single part object and a part list both nest. Id-less geometry nests under the anonymous key (its layouts carry no design provenance; `construct-sheet` needs keyed items). Calls the nesting worker at `NESTING_WORKER_URL` ([full `/nest` endpoint](../nesting/README.md)); every output layout ships self-contained (`sourceItems` resolve its placements, each carrying its workpiece layers and `design_id` provenance, and `sheetPolygon` carries its bin shape), and layouts with the same composition — sheet shape and the placement design-key multiset — join into one entry carrying the group's `count` and its `compositionKey` |
| `nesting-parts` | the cassette-design `nesting-polygons` projection | the instance's stored geometry in → nesting polygon parts out, each riding its workpiece layers (joined by `workpieceId`) so solved layouts compose sheet layers under the placement transform, and its source design's `designId` (the projection call carries the instance id) so sheet construction pins the placement's cassette-design ref |
| `generate-sheet-dxf` | the `sheet-dxf` `fromSheet` construction and the sheet-design `dxf` export binding | the sheet's stored values in — the construction's `sheet` ref value or the export's `fields` — → the layered DXF `payload` out (executor payload contract): production layer names with each layer's standard pen (truecolor, lineweight, DASHED/DOT linetype), mm units, extents, and a Standard text style; the construct stores it as the sheet-dxf record's payload, named after the sheet |
| `construct-sheet` | sheet-design `fromLayout` | a solved layout value (or a blank) plus the resolved `designs` refs in → `{ data: { compositionKey, geometry }, relations: { parts } }` out (one pinned cassette-design ref per placement; the parts edge is the sheet-design type's declared relation) |
| `match-sheet` | the `plugin.facade.match-sheet` value service | a layout's composition key plus the org's sheet designs in → `{ found, design }` out; the flow reuses the matched design and constructs only when `found` is false |

## Vendored engines

- `vendor/dxf-extractor.js`, `vendor/dxf-writer.js` — the DXF engine
  behind `extract-geometry` and `generate-sheet-dxf`.
- `assets/vendor/clipper2/` — the wasm Clipper behind the boolean/fold
  geometry passes (`surfaces/lib/cassetteV2Clipper.js`).
- `assets/vendor/three/` — the folded 3D preview runtime
  ([rewrite rule](./assets/vendor/three/README.md)).
- the CadCraft browser edition —
  [tech-drawing's vendored copy](../tech-drawing/assets/vendor/cadcraft/README.md),
  consumed through the declared `cadcraft` dependency (the cross-plugin
  vendor seam).

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
  (type ids unchanged), `server/scripts/migrate-profile-sketches-to-shapes.js`,
  and `server/scripts/migrate-profile-parameter-tables.js` (both one-shot,
  dry-run by default) — see the
  [scripts README](../../server/scripts/README.md).

Parent: [workers README](../README.md). Domain law: [SPEC.md](./SPEC.md).
Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
