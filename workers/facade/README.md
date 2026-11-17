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
| `sheet-design-editor` | editor | 4 | One canvas over the opened record's lineage family: the sheets sharing its parents under the declared containment's lineage keys join beside it; the sheet picker adds any org sheet explicitly (family members first) and add-all covers the family alone (the facade SPEC's family law). The family sits on a wrapped rack; a sheet moves by its label band and rotates a quarter turn about its center, placements riding in sheet-local frames. Navigation follows the DrawingCanvas law — wheel zoom at the cursor, shift-drag pan, dock zoom/fit. Placements grab/add/rotate/drag magnetically (containment and non-overlap gates); a drop on another sheet moves the placement between records (the source item travels, the target's free sweep re-clamps, both records commit on save). The inspector panel carries the working set and the record behind a selection as instance tiles (`InstanceInlineRef` `variant="tile"`; the working-set tile activates its sheet on click, marks the active sheet, and carries its remove × at the row's trailing end); the active sheet's placed cassette-designs render as the actual instance tiles beside the sheet tile, placement geometry reads on the canvas; each working-set sheet tile carries its own chain above it (the opened record's tile excepted — the record header and the workspace page host state it); the sheet picker adds any org sheet explicitly (family members first) and add-all covers the family alone; the palette carries margin and layer visibility. The design picker picks-to-add (a picked design places on the active sheet) and passes `entity`+`typeId` and no label: InstanceSelect renders the §22.13 option rows and derives the label and filter text host-side. Layer pens resolve the org `defaultPen` relation over the OCCS base ([pen law](./SPEC.md)); saves patch every dirty record's geometry and its typed `parts` relation together; a sheet behind more than one cut plan carries the split action, which creates another sheet design with the same geometry and moves one cut plan onto it. Layout compute in `surfaces/lib/`. |
| `cassette-designer` | editor | 2 | The cassette-template type's designer: parametric faces (trapezoid or the profile shape model), workpieces/attachments, profile sketch, folded 3D preview. Attachment placement offers point, edge array, and face array through one versioned array definition; each axis carries count, step, gap, or span rules with start/end offsets, and face arrays add grid padding, stagger, frame rotation/mirror, radial rings, copy orientation, suppression, and clipping, while open profiles keep edge placement. The placement editor shows the single-copy anchor only when one copy is placed, reports a refused array in place, and derives every field from the stored definition. Child faces allocate free shards on a shared host edge through expression spans while open profiles place by their array settings across the whole edge and share it with each other; a closed profile footprint leaves the edge intervals free and may cut across a child's fold interval while an open profile on a fold edge refuses, folds and contours use the owned interval, face fills stay per face so adjacent faces read separately, the canvas draws one + per free shard, and a child face's span stays authored node parameters. Face and profile editing keep the assembly canvas and camera; the designer's one canvas session carries the selection through the edit, so the target stays at its screen position; the sketch canvas places the authored sketch on the cassette at the target's placement — the face's shard frame composed with its assembly transform, a closed profile's axis and point placement, or an open profile's edge embedding — over the assembly on its own locked layers (their colors, weights and dash patterns), and mirrors the app's light/dark tokens and UI font into the CadCraft frame; a placed profile's parent face is its hatch base, so the boolean preview sits on the real face; the zero axis spans that face, the editor's parameter table edits the authored rows while placement overrides stay on the workpiece, sketch edits commit to the cassette live, and a library save writes concrete parameter values; a face sketch carries the same authored and instance tables, its selected details carry the parameter fields beside the placement controls, and a placed face's overrides evaluate with the cassette's scope; profile and face edit modes share the designer inspector, palette and CadCraft navigation with the assembly canvas — wheel zoom at the cursor, trackpad scroll pan, middle or right drag pan, and middle double-click refit; the designer's own canvas paints its geometry through the same CadCraft renderer behind the SVG interaction layer (the SVG keeps the camera, chips, hit areas and popups; the host follows the camera with every assembly layer locked), draws the cassette dimensions as native CadCraft dims on the dimension layer in the assembly context too, with continuous lines in the canvas ink and readable labels (a label edits its authored field in place; the palette lists the drawing's native layers and each row toggles its native layer in the assembly and the edit, dimensions included), and drives profile and face editing through that same host in place (the edit controls fill the right inspector panel, the drawing tools fill the left palette, the designer dock carries undo/redo and zoom in every mode, and the canvas keeps the dimension editor and corner popup), so the host face and surrounding cassette stay around the section in their coordinates; the native host is the one view: it paints every layer, filled face layers as solid hatches, and the dimension labels, and the SVG overlay keeps hit areas, chips and hover/selection highlights. The inspector lists the assembly as an expanding PrimeVue Tree (workpiece → face → placed profile; every other relation under its source workpiece): the rows carry identity alone — selecting a face, profile, relation or hardware workpiece opens its settings in one full-width panel under the tree whose field grid auto-fits the host width (the face's role, shape actions, pulse-glyph Add profile and parameter fields; a relation's placement fields; a hardware workpiece's family and parameter fields), and new nodes open expanded while a collapsed node keeps its state. The profile sketch identity packs name, kind and process into one compact block; a profile created from a face lands on that face's first arrangeable edge and the sketch canvas tracks the cassette around the edit — every committed sketch edit refreshes the assembly context layers in place through the host's annotation channel (the sketch entities, the selection, and running commands keep their identity), and a placement change reseeds the canvas; the free-shard + carries a two-choice dial — add a face on the shard (born a sketch face carrying the conversion seeding; zero geometry renders nothing, holds the shard, and the tree marks it) or start a profile mounted on that edge; the face-sketch mode is the profile editor in face mode, with the parent edge as its dashed mount line and the parent face ghosted around it; rect and circle boundary grips resize the authored shape by drag; its adds author the face and its subtracts cut them, a set with no add stays at zero geometry, and the parent cut is the union of the subtracts, and the hatch is the face region on the child's side of the datum; the sketch commits live whatever its table resolves to — a mid-error table keeps the face on its base host while the editor states the error. A placed profile's section geometry is its canvas hit area, and its tree row expands the placement grid, name-and-value parameter fields, edit, and delete (the facade SPEC's canvas profile law). With a profile selected, a face click selects that face and leaves the profile placement untouched; every canvas click selects — faces, folds, and profiles of any workpiece, the selection following into the clicked workpiece (an attachment edit keeps its two-workpiece pick scope); in a sketch edit, Escape sheds the open field, then the corner, then the shape, a bare Escape returns to the cassette, and Delete removes the selected shape; the selected profile's placement dimensions chain the parent edge ends and its basis point, array copies included, and the selected face or profile draws its inner shape dimensions on the dimension layer in the sketch's own CAD dimension style, with a label editing its authored shape field in place. Canvas chips and hit areas keep their screen size across zoom; face corner geometry is authored in the face shape editor. The profile sketch mode's library pick rides the host pack's `InstanceSelect` (instance option rows, SPEC §22.13), and its edit panel saves the draft to the origin library record, saves it as a new record, or deletes the origin record (the facade SPEC's library workflow); saves also evaluate the document into the record's declared geometry fields (`fields.polygonParts`, `fields.layerData` — the DXF import's contract). Engine and render family in [`occs/`](./occs/README.md) and `surfaces/lib/`; `surfaces/lib/profileAnnotations.js` builds the canvas dimensions, face hatch and outline, axis and origin as native CadCraft entities on derived layers (locked decorations, editable dimensions), and a dimension label opens its authored field in place. Under mount `mode: 'read'` (SPEC §4) the cassette renders view-only: canvas selection, the workpiece tree, layer toggles, and the folded preview stay; the document dock, undo/redo, the parameter palette, add controls, and the designer edit targets stay hidden. The surface graph imports vendored modules only (`perigram-plugin surfaces` refuses npm imports). |
| `cassette-preview` | preview | 1 | Read-only cassette-template/cassette-design preview as in-place SVG on the shared drawing canvas: the record's OCCS payload through the plugin tree renderer — the same render the designer's template-picker thumbnails use — with baked geometry rows when the payload is absent; the preview layer law (`CASSETTE_PREVIEW_LAYERS` in [`surfaces/lib/drawingPreview.js`](./surfaces/lib/drawingPreview.js) — outline and folds) gates the visible layers. A record whose payload reference names an OCCS document shows the loader until the host hands the parsed document. The band is inert; card and record clicks stay with the host layout. |
| `profile-preview` | preview | 1 | The profile library type's preview: the stored sketch through the boolean fold (`resolveOccsProfileSketchLayerData`) and the shared drawing-preview normalizer; blank when the sketch does not resolve. |

## Graph operation palette

The graph palette exposes user-invokable operations by workflow rather than
by executor implementation. The declared groups are:

- **Nesting** — solve a job's cassette parts onto sheet stock
- **Sheet planning** — reuse a matching sheet design or create one from a
  solved layout
- **Production export** — generate a production-layer DXF from a sheet design

The extract-geometry, bake, and nesting-parts services remain construction or
projection helpers, not generic graph operations. The listing's operation
labels and descriptions are the user-facing palette copy.

## Services

Service compute is value→value (SPEC §8): payload values in, computed
values and files out, free of service imports, persistence, and auth.

| Service | Construction/flow | Contract |
|---|---|---|
| `extract-geometry` | cassette-design `upload`/`convertDxf` | DXF payload (base64) plus `draft.data.mapping` (`{ sourceLayer: occsLayerCode }`) in → `{ data: { name, geometry, mapping } }` out; the upload create's declared `mapping` input renders the layer-mapping control over the uploaded file, `cut.outer` needs one mapped closed-polygon layer, and the record takes its name from the uploaded file |
| `bake` | cassette-design `render` | template ref (payload = OCCS document, base64) + parameters in → `{ data: { name, geometry } }` out, named from the template and the parameter values; the render create's `parameters` input carries the `cassette-parameters` control, which reads the picked template's OCCS parameter table through the served designer module |
| `nesting-solve` | the `plugin.facade.nesting-solve` value service | SPEC §8 signature (`sheetWidth`/`sheetHeight` default 1220×2440 mm, `space`; the run has no sheet-count prompt — sheet stock is the item count as the worst case, and the solver uses only the sheets it needs). Items are job geometry: explicit `{designId, designKey, polygonParts, count}` records, the `nesting-polygons` projection items, or the elements themselves — a part's own `designId`, an element's `_id`, or the item's `designId` keys it; `count` is the physical cassette quantity; `designKey` names the cassette-design composition; an element's own `fields.geometry` supplies its parts; a single part object and a part list both nest. Id-less geometry nests under the anonymous key (its layouts carry no design provenance; `construct-sheet` needs keyed items). Normalizes item counts into fresh records without mutating graph inputs, rejects non-finite dimensions/counts, and rejects aggregate sheet-stock arithmetic outside JavaScript's safe-integer range before dispatch. Calls the nesting worker at `NESTING_WORKER_URL` ([full `/nest` endpoint](../nesting/README.md)); every output layout ships self-contained (`sourceItems` resolve its placements, each carrying its workpiece layers and `design_id` provenance, and `sheetPolygon` carries its bin shape), and layouts with the same composition — sheet shape and the placement design-key multiset — join into one entry carrying the group's `count` and its `compositionKey` |
| `nesting-parts` | the cassette-design `nesting-polygons` projection | one baked design in → one nesting item out: its `designId` and every workpiece's polygon parts, each part riding its workpiece layers (joined by `workpieceId`) so solved layouts compose sheet layers under the placement transform and sheet construction pins the placement's cassette-design ref |
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
