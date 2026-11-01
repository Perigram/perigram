# CODE: OCCS Engine

The OCCS (Open Cassette Component Standard) engine, single-homed in the
facade plugin: the executor's construction services
(`workers/facade/services.js`) and the editor surface modules
(`../surfaces/`) both import it, and the executor serves it statically so
the browser-side editor evaluates live geometry from the same files. Pure
modules — no platform imports. This README owns the domain's geometry
contracts: the shape model, the layer vocabulary, evaluation, and export
naming. The designer's editor and render contracts live with the surface
modules in `../surfaces/` (their geometry passes in `surfaces/lib/`).

## Responsibilities

- **`layers.js` / `layerStandards.js`** — semantic OCCS layer ids:
  production contours, fold/cut routes, dimensions, and
  `code.cassette_mark` annotation marks. `layerStandards.js` ships the
  cassette layer standards as one runtime table (code, group, kind,
  purpose, production, pen) with each layer's production export name from
  the spec registry (parametric where the registry names them so: the cut
  layers' `{diameter}`, the fold route's `{angle}`); `occsLayerExportName(code, overrides)`
  resolves it — the sheet-DXF export names every layer through it and
  bakes each layer's pen into the layer table (truecolor, lineweight, and
  the dash pattern as a DASHED/DOT linetype definition), alongside mm
  units, extents, and a Standard text style. Every
  renderer, editor, and preview bakes these pens through the
  layerStandards entry points (`applyOccsLayerPens` for whole drawings,
  `penForLayer` for single layers). The spec registry
  ([spec/layers.json](./spec/layers.json)) is the vocabulary of record,
  pinned in sync by `shared/facade-layer-standards.spec.js`.
- **`dimensions.js`** — canonical `dimension.cassette` annotation
  entities and drawing primitives. Template dimensions keep expression
  text (`A`, `B`, `R`); evaluated design annotations store measured
  numeric values.
- **`parameters.js`** — template parameter extraction from both legacy
  cassette definitions and OCCS documents, one parameter path for queues
  and fixture scenarios.
- **`expressions.js`** — the lightweight arithmetic/trig expression
  subset used by cassette templates.
- **`hardware.js`** — the OCCS hardware catalog for Cassette Designer v2:
  bolts, nuts, washers, rivets, screws, spacers, standoffs, and hanger
  clips, kept declarative with parameters, interfaces, preview metadata,
  hanger production modes (`sheetPart`, `integralCut`, `castSolid`), and
  edge-array expansion helpers. Resolution rules:
  - Integral-cut hanger clips resolve through curve boolean difference:
    the parent face becomes the resulting polygon. Cutouts landing as
    holes ride `cut.inner`; operands breaking the region boundary
    dispatch through the modified `cut.outer` contour.
    Bolt/rivet/screw/spacer/standoff placements resolve to exact
    `cut.hole` circles.
  - Edge arrays: attachment X is the margin from both edge ends,
    attachment Y the face-normal offset, the target snap
    (`start`/`end`/`center`) the array binding, then either a `count`
    or a `spacing` rule. `spacing` is the gap between adjacent copies
    (zero butts them together) and places the copies that fit;
    point-like hardware copies carry no length of their own, so there
    spacing is the pitch between placements.
  - The plugin's `hardware` library type (listing) holds reusable tuned
    presets (family, mode, parameters) authored from the designer's
    hardware dialog.
- **`profiles.js`** — the OCCS profile shape model used by Cassette
  Designer v2.
  - A sketch is a list of parametric shapes evaluated on the zero axis.
    Shape kinds: `rect` (center, width, height, rotation, per-corner
    fillet radii), `circle` (center, diameter), and `chain`
    (point-by-point polyline with its own closure, per-vertex fillet
    modifiers, extracted chord tags).
  - Every authoring field carries a number or an expression string
    evaluated against the parameter table through `expressions.js`. A
    single unknown identifier authored into a field adopts that
    parameter at the field's current value
    (`adoptOccsProfileBindingParameter`); adopt-on-bind mints only
    identifiers free in the surrounding scope.
  - Each shape carries a boolean op applied to the FACE: `add` unites
    the footprint into the face, `subtract` cuts from it,
    `construction` is excluded (a DXF import lands every shape at
    construction through `occProfileSketchFromEntities`' `reference`
    option).
  - The fold is an ordered CSG sequence: each participating shape
    applies to the face in authored list order — a later add refills an
    earlier cut (`resolveOccsProfileSectionOperations` returns the
    authored steps in list order). The fold pass consumes the full
    region — outer polygons plus hole rings together — so a hole
    survives every later op. Its outer and hole rings are the only
    geometry the outputs carry: the drawing's `cut.inner` layer, the
    evaluated layerData, the folded cutouts, and the OCCS document's
    face shapes all read the result rings; overlapping operands dissolve
    into one merged ring, each ring attributing to the relation of the
    operand it swallows. Every result hole ring rides the inner-cut
    layer — the material it punches, authored face or added tab alike —
    and an added tab's outline rides the outer contour.
  - The operand entities stay on the OCCS wire as authored truth
    (`booleanOperation` steps: an add reshapes the contour only, a
    subtract landing as a hole ships its operand ring, one breaking the
    region boundary dispatches through the modified contour).
  - `evaluateOccsProfileSketch` resolves the whole sketch (parameters
    may reference each other; cycles and unknown identifiers throw). The
    savable gate (`isOccsProfileSketchSavable`) turns those throws into
    authoring feedback and requires at least one closed shape carrying
    a boolean op.
  - Fillets are non-destructive modifiers on their shape (per-corner on
    rects, per-vertex on chains), editable after application. A radius
    larger than the corner's adjacent segments allow resolves as the
    largest tangent fillet that fits; the emitted arc derives from the
    trimmed tangent points, so it round-trips back through extraction. A
    chain's fillet modifier resolves by its point id (ids are identity);
    `occProfileSectionChainedVertices` is the walk that resolves fillet
    corners to arc points on polyline sections (the `vertexIndex`
    convention lives there only).
  - Primitives are atomic: a partial engine erase removes the whole
    shape (the reseed clears leftover entities); chains keep their
    per-segment nature.
  - A single open chain free of boolean shapes keeps the `polyline`
    section: its first and last vertices are the break points where the
    composite chain splices into the host face's contour; boolean shapes
    are excluded from it.
  - Extraction keeps every drawn piece as its own shape. A DXF polyline
    carries its arc segments as bulges on the vertex that starts the
    segment, and extraction reads them (`polylineRecordSegments`), so a
    rounded polyline round-trips as lines plus arcs instead of straight
    chords. A closed
    four-vertex right-angle chain detects as a `rect` primitive in
    canonical order — counter-clockwise from the leftmost corner, so the
    draw direction leaves the stored settings and corner labels
    unchanged; rotation normalizes into [−45°, 45°) with width and
    height swapping past the quarter-turn; every extracted numeric (rect
    center, width, height, rotation; circle center and diameter) rounds
    to 1e-3 mm; circles land as `subtract` shapes on a draw.
  - `mergeOccsProfileSketchGeometry` merges extraction back under the
    one-way truth rule: shapes match by geometry identity — a rect when
    its four corners match the authored evaluation's corners as a set
    (ring start is draw-direction noise), a circle by center plus
    diameter, a chain per point. A matched shape keeps the authored id,
    op, expressions, and fillets whole; the op rides the authored shape
    and extraction defaults apply only to genuinely new shapes. Kept
    shapes ride their authored sequence slots and fresh shapes append,
    so the CSG order survives every extraction roundtrip. A moved field
    keeps its authored expression when it names a parameter (the edit
    lands on that parameter); compound expressions and numerics carry
    the extracted value. Authored shapes with an erased extracted
    counterpart drop; a fourth argument offers the drops back as
    adoption candidates, so an engine undo/redo that restores erased
    canvas geometry revives the shape with its expressions. Fresh ids
    renumber against every kept id by object identity.
  - An authored sketch whose expressions do not resolve keeps the
    authored model whole (the drawing-is-sacred law): canvas geometry
    merges on the next pass once the text resolves, and the editor
    renders from the last good evaluation in between. The merge's
    surrounding scope is evaluation-only — a refused merge returns the
    authored table untouched.
  - The sketch model owns the author's history: the profile editor's
    undo/redo (toolbar and Ctrl+Z/Ctrl+Y over the canvas) step through
    sketch snapshots and reseed the canvas. The engine's undo stack
    covers its database projection, which every model step reseeds, so
    the canvas drops the engine's `UNDO`/`REDO` commands. The engine's
    destructive geometry edits (`FILLET`, `CHAMFER`, `TRIM`, `EXTEND`,
    `BREAK`) leave the canvas for the same reason: fillets are authored
    as shape modifiers, never as geometry.
  - A sketch's parameter rows are its own. A row named by the
    surrounding scope belongs to the sketch while a shape field
    references it; an unreferenced scope-named row is stale copy and
    drops from the editor's draft (`pruneScopeBoundParameters`).
  - The default hanger template is parametric — a rect (W/H the
    rectangle, R the four corner fillets) plus a subtract circle (D the
    hole), L resolving the sweep at evaluation. `normalizeOccsProfileSketch`
    fills a sketch-less read with it, and it is the renderer's fallback
    for sketch-less workpieces; a cassette's instance parameters drive it
    on attach.
  - Legacy chain sketches (points/edges/holes/closed/anchors) upgrade
    into the shape model at `normalizeOccsProfileSketch`: the chain
    becomes one chain shape, holes become subtract circles, a closed
    sketch's basis anchor becomes the axis (the chain translates so the
    anchor vertex sits on X=0, coordinates numeric).
    `upgradeLegacyOccsProfileSketch` is the same upgrade for the
    one-shot migration script.
  - Parametric instantiation: a profile workpiece's instance parameters
    override the profile's authored table; the workpiece's table is the
    derived table with the instance values on top, and the stored
    snapshot re-derives from the authored sketch (the stored section is
    a last-good cache held through a transient invalid parameter).
    Instance values may be cassette expressions resolved in the joined
    scope — the profile's own table shadows the cassette's globals
    (inner over outer) — while the raw expression stays stored.
    Parameter names rename in place (`renameOccsProfileSketchParameter`
    moves the key, order preserved, and rewrites every reference as
    whole identifiers).
  - Profiles ride the cassette template's own document as profile
    workpieces; their `profileSnapshot` is the renderer's geometry
    source. The plugin's `profile` library type (listing, class `item`)
    holds reusable profiles as org records: saving writes the authored
    truth (kind, process, prepared sketch) through the records host
    capability, and picking a record copies it into the draft as a
    snapshot. Library records are authored from the designer dialog; the
    type carries no editor surface of its own and its write access
    inherits the cassette grant (`access.inherits` in the listing). A
    record whose sketch carries no participating shape refuses to place
    — the hanger fallback serves sketch-less workpieces only. Placed
    workpieces carry their library origin (`profileTemplateId`): edits
    stay local, an explicit update rewrites the origin record, and
    already-placed workpieces keep their copy.
- **`production-layout.js`** — wraps the Clipper-backed face
  union/fold-route pass and returns semantic `cut.outer` / `fold.route`
  layer intent.
- **`evaluate.js`** — resolves OCCS graph-tree templates into production
  data: each `sheet` workpiece evaluates in local workpiece space, the
  Clipper-backed cut/fold pass runs per sheet, and the result is one
  `cut.outer` nesting polygon set per sheet workpiece with
  `workpieceId`, definition id, and occurrence id metadata. The same
  evaluated `layerData` travels through the nesting request as source
  layers, so generated sheet designs redraw placed cut, fold,
  dimension, and annotation layers after the worker returns placements.
  - Open profiles embed through `profileEmbedding.js`: array settings
    alone place the copies (anchors on the bound edge, zero
    perpendicular offset), the whole edge is replaced by the composite
    chain — host start, straight runs, copy chains, host end — riding
    `contour.cassette_face`, and the production cut/nesting contour
    follows the stitched boundary. The margin holds from both edge ends
    for the whole copy; count mode spreads the requested copies over the
    span the chord leaves (a count the span cannot hold refuses);
    spacing mode packs copies from the binding at the requested gap
    between them, placing the copies that fit. The array binding
    (`start`/`center`/`end` snap) places the array; copies always run
    edge-start to edge-end. A placement that cannot fit, or a margin
    that leaves no span, is an evaluation error; refusals ride
    `profileEmbeddingErrors`
    (`{relationId, reason}`). Authored array values are expressions read
    nullishly (`??`): an empty string or a zero is the author's text
    mid-edit, and a default substituted there rewrites the field under
    the caret. A relation patch carrying any array field updates the
    pattern.
  - Closed profiles produce their production effect through the same
    pass. Profiles are terminal: an edge carrying an arranged profile is
    the end of the face — the designer's face-grow action refuses it
    (`addFaceAtEdge`, a local closure in
    `../surfaces/cassette-designer.mjs`). The boolean result's rings
    place by the axis law — the zero axis lands on the attachment edge
    (snap plus offsets, +X toward the host face, authored distances
    riding along as drawn; a point placement rotates by the relation's
    rotation alone) — and each copy cuts the host face where it
    intersects, every ring a cut operand (the boolean difference the
    integral-cut hanger clips ride), with the cut paths named on
    `cut.inner` in the evaluated layerData (a dedicated registry row
    awaits an owner-named production name).
  - A fold edge carries no profile: both profile passes refuse the
    arrangement, and the designer's edge chooser offers the arrangeable
    edges only — authored edges less folds and the edges consumed by
    other profiles (the asking relation's own edge stays listed;
    hardware arrays may bind an edge a profile already occupies),
    snapping a stale illegal default to the first arrangeable edge on
    the write path.
  - Snap points and array bindings compute from the raw authored face
    (`originalBoundaryVertices`/`referenceVertices`, ahead of any
    profile cut merging into the boundary), so placement anchors hold
    still under profile cuts.
- **`drawing.js`** — converts resolved OCCS face curves into the shared
  `DrawingCanvas` `{ viewBox, layers }` contract with explicit
  layer-standard codes, generated dimension annotation layers, and
  caller-provided annotation/mark layers. Every standard layer's display
  name is its registry production export name (`occsLayerExportName`)
  with `standardCode` carrying the matching key — bare codes never
  surface in any drawing mode. Profile geometry rides the face layers:
  the open-profile composite splices into the drawn face boundary
  exactly as production embeds it, closed sections cut the face on
  `cut.inner`, and the section layer carries section views only.
  Whole-workpiece assembly previews dispatch `contour.cassette_face`,
  `cut.outer`, and `fold.route` from unioned workpiece geometry. The
  preview layer set — outline (`cut.outer`) and folds (`fold.route`)
  matched by `standardCode` (layer names are localized export names);
  all layers for a drawing outside the set — resolves through
  `cassettePreviewLayerSelection` (`surfaces/lib/drawingPreview.js`),
  the single home the designer's load-picker thumbnails reuse.
- Cassette Designer v2 emits a `code.cassette_mark` text entity at the
  bottom-left of each sheet workpiece's main/root face: the cassette
  template name, template id, and one-based workpiece number; the same
  layer data carries through baking and nesting.
- **`folded-3d.js`** — canonical folded preview payloads for the
  vendored Three.js preview component, including optional non-sheet
  hardware body descriptors. Profile workpieces carry no geometry of
  their own — they modify face geometry, never ride the body channel,
  and stay out of the face-joint diagnostics (no source face by design):
  the folded-preview curve set runs the same profile pass as the 2D
  drawing (open-profile chains splice into the local boundary, closed
  sections and hardware cuts subtract), with the authored boundary kept
  as the fold reference so edge indexes stay stable.
- **`templates.js`** — the default OCCS cassette fixture template.

## Conventions

These modules are pure: they do not call stores, `$fetch`, or Vue
component APIs. Cassette Designer v2 may adapt its graph-tree editor
state into OCCS, but geometry/layer/export decisions should live here.

Parent: [facade README](../README.md).
