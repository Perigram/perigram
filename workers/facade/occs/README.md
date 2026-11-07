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
  entities. Template dimensions keep expression
  text (`A`, `B`, `R`); evaluated design annotations store measured
  numeric values. A sketch face's dimensions are its sketch dimensions;
  the cassette dimension layer carries no rows for it.
- **`parameters.js`** — template parameter extraction from both legacy
  cassette definitions and OCCS documents, one parameter path for queues
  and fixture scenarios.
- **`expressions.js`** — the lightweight arithmetic/trig expression
  subset used by cassette templates.
- **`hardware.js`** — the OCCS hardware catalog for Cassette Designer v2:
  bolts, nuts, washers, rivets, screws, spacers, standoffs, and hanger
  clips, kept declarative with parameters, interfaces, preview metadata,
  hanger production modes (`sheetPart`, `integralCut`, `castSolid`), and
  copy bounds for face-array padding. Resolution rules:
  - Integral-cut hanger clips resolve through curve boolean difference:
    the parent face becomes the resulting polygon. Cutouts landing as
    holes ride `cut.inner`; operands breaking the region boundary
    dispatch through the modified `cut.outer` contour.
    Bolt/rivet/screw/spacer/standoff placements resolve to exact
    `cut.hole` circles.
  - The plugin's `hardware` library type (listing) holds reusable tuned
    presets (family, mode, parameters) authored from the designer's
    hardware dialog.
- **`patterns.js`** — the attachment array definition and geometry
  shared by the renderer, the folded preview, and the profile embedding.
  - One definition (`version`, `space`, `kind`, binding, frame, axes,
    stagger, polar, item, suppression, clip) drives every array. Edge
    arrays are `space: edge`, `kind: linear`; face arrays are
    `space: face`, `kind: grid` or `radial`.
  - Each axis carries a rule — `count`, `step`, `gap`, or `span` — plus
    count, pitch, clearance, authored span, and start/end offsets.
    `count` distributes whole copies across the available span; `step`
    packs at an anchor pitch; `gap` packs at an edge-to-edge clearance;
    `span` places the count across an authored span. An unfitting rule
    refuses.
  - Edge arrays use the X axis along the edge, two end margins, a normal
    offset, and the copy footprint in the span. A single count anchors on
    the binding so an authored tab may straddle the edge. Point-like
    hardware carries no extent, so a gap is its pitch.
  - Face arrays use X/Y rules with padding from the face outline to each
    copy footprint, an optional stagger on alternating rows or columns,
    frame rotation and mirrors, and `clip: face` or `none`. A copy
    resting flush on the outline is inside it, so a count or span fills
    the padded bounds without dropping its last row or column. Radial arrays
    carry center offsets, ring count, copies per ring, base radius, ring
    spacing, start angle, and sweep. Item orientation is `fixed`,
    `grid`, `radial`, or `tangent`.
  - Copy keys are stable (`row:column`, `ring:index`, or linear index);
    `suppress` names copies directly. Flat stored patterns normalize into
    the definition on read.
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
  - Shape identity is the tag: a seeded entity carries its shape's id,
    and `occProfileSketchFromEntities` rebuilds a tagged group as exactly
    one shape of the authored kind — a circle from its CIRCLE, a rect
    from its corner lines (the crossings of the two parallel side pairs)
    and its fillet arcs, a chain from its connected segments. A group the
    extraction cannot read holds the authored shape whole. Geometry
    classification (`chainAsRect`, the chord flattening) serves untagged
    geometry alone — drawn pieces and imports.
  - Endpoint identity across seed and extraction works at the drawing
    scale (`DRAWING_EPSILON_MM`, 0.05 mm): a filleted corner's line end
    and its arc end are one point, so a loop chains whole.
  - `mergeOccsProfileSketchGeometry` merges extraction back under the
    one-way truth rule. A tagged shape keeps its authored id, so identity
    never rests on geometry: a rect when its four corners match the
    authored evaluation's corners as a set (ring start is draw-direction
    noise), a circle by center plus diameter, a chain per point. A
    matched shape keeps the authored id, op, expressions, and fillets
    whole; the op rides the authored shape and extraction defaults apply
    only to genuinely new shapes. Kept
    shapes ride their authored sequence slots and fresh shapes append,
    so the CSG order survives every extraction roundtrip. Authored
    expressions and numbers survive every pass: a bare parameter absorbs
    an intentional move through its own value, and extraction rounding
    never rewrites a value inside the merge epsilon. Authored shapes with
    an erased extracted counterpart drop. Fresh ids
    renumber against every kept id by object identity.
  - An authored sketch whose expressions do not resolve keeps the
    authored model whole (the drawing-is-sacred law): canvas geometry
    merges on the next pass once the text resolves, and the editor
    renders from the last good evaluation in between. The merge's
    surrounding scope is evaluation-only — a refused merge returns the
    authored table untouched.
  - Geometric identity spans the rect family: a rect and a closed
    four-corner chain describe one polygon, so extraction's classification
    never changes an authored shape's kind — the authored kind, points,
    ids, and expressions survive the merge. Fillets come from the
    extraction (an erased arc clears its radius); a kept fillet keeps the
    authored radius expression while the value matches.
  - The sketch model owns the author's history: the profile editor's
    undo/redo (toolbar and Ctrl+Z/Ctrl+Y over the canvas) step through
    sketch snapshots and reseed the canvas. A model-driven reseed writes
    entities only — extraction reads the author's canvas gestures. The engine's undo stack
    covers its database projection, which every model step reseeds, so
    the canvas drops the engine's `UNDO`/`REDO` commands. The engine's
    destructive geometry edits (`FILLET`, `CHAMFER`, `TRIM`, `EXTEND`,
    `BREAK`) leave the canvas for the same reason: fillets are authored
    as shape modifiers, never as geometry.
  - A sketch's parameter rows are its own. A scope-named row lives in
    the surrounding scope; it is stale copy in a profile table and drops
    from the editor's draft unless an authored shape or another kept row
    explicitly references it (`pruneScopeBoundParameters`).
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
  - Two parameter tables per profile workpiece: the authored table is the
    sketch's own (`profileSnapshot.sketch.parameters`, edited in the
    profile dialog), the instance table is the placement's overrides
    (`profileSnapshot.instance`, edited through the workpiece row's
    chips), and the derived table — authored rows with the instance
    values on top — is the single evaluation scope (`deriveOccsProfileSketch`).
    `normalizeCassetteV2Profile` returns all three (`sketch.parameters`,
    `instance`, `parameters`) and drops scope-named override rows;
    nothing folds one table into the other.
    A chip shows the stored expression and carries the derived value as
    its hint. The profile editor never receives the instance table: it
    edits and evaluates the authored sketch alone, and saving preserves
    the workpiece's overrides. A dimension typed on a field bound to a
    bare authored identifier commits that authored row; a
    surrounding-scope identifier stays in its own table. Typing a value
    into a field bound to it makes that field local; the global never
    becomes a profile or override row. An override row whose name the
    sketch does not author is pruned from the instance table; an authored
    row may shadow a same-named global and keeps its override.
  - An instance value may be a cassette expression. It resolves in the
    cassette scope first: a cassette name wins over a same-named authored
    row, a field naming its own key reads that outer value, and the raw
    expression stays stored. Authored shape expressions keep the inner
    rows over the cassette scope. The stored section is a last-good cache
    held through a transient invalid parameter. Parameter names rename in
    place
    (`renameOccsProfileSketchParameter` moves the authored key and
    rewrites every reference as whole identifiers;
    `renameOccsProfileTableParameter` moves the instance row with it).
  - Profiles ride the cassette template's own document as profile
    workpieces; their `profileSnapshot` is the renderer's geometry
    source. A workpiece-level `sketch` resolves through
    `cassetteV2ProfileSketch`; a write stores the sketch in
    `profileSnapshot.sketch` and drops the workpiece-level copies. The
    plugin's `profile` library type (listing, class `item`)
    holds reusable profiles as org records: saving writes the authored
    truth (kind, process, prepared sketch) through the records host
    capability, and picking a record copies it into the draft as a
    snapshot. Library records are authored from the designer dialog; the
    type carries no editor surface of its own and its write access
    inherits the cassette grant (`access.inherits` in the listing). A
    library save gates on the authored table alone, and a record whose
    sketch carries no participating shape refuses to place — the hanger
    fallback serves sketch-less workpieces only. Placed
    workpieces carry their library origin (`profileTemplateId`): edits
    stay local, an explicit update rewrites the origin record, and
    already-placed workpieces keep their copy.
- **Face sketches** — a face may carry the same parametric shape model
  as a profile on its `sketch` (add/subtract/construction shapes,
  expressions, fillets). The face is its adds minus its subtracts on the
  child's side of the datum; a set with no add stays at zero geometry.
  The parent cut is the union of the subtracts. Holes ride `cut.inner`. The child
  face keeps the material on its side of the datum; the parent-side part
  belongs to the parent cut. Every participating shape cuts the parent
  where it lands — the cut footprint is the union of the adds and
  subtracts — placed in the face's shard frame and folded into the
  parent's production geometry like a closed profile section. The OCCS
  face shape is the evaluated region (`polygon`), and the
  authored sketch rides `face.extensions.perigram.sketch`. The outer
  ring rotates so its datum edge (y = 0) starts the ring, keeping E0 the
  attachment edge and fold routes stable. The trapezoid face remains the
  quick path; converting seeds the sketch from the current outline. A
  sketch face with no shapes has zero geometry: it renders nothing,
  holds its shard, and the designer's workpiece tree marks it. The
  face editor's datum is the parent edge line in shard coordinates (the
  shard start is zero); the parent face renders as a ghost outline in
  those same coordinates, and the editor's hatch evaluates through
  `resolveCassetteV2FaceSketchGeometry` — the one fold and datum clip
  behind both the editor's preview and the rendered face. A face sketch
  carries the profile workpiece's two parameter tables:
  `node.sketch.parameters` is the authored table
  and `node.instance` the placement's overrides. `normalizeCassetteV2Face`
  returns the authored sketch, the instance table and the derived table;
  the renderer evaluates the derived table in the cassette's scope.
  Scope-named rows stay in the cassette's table. The face editor folds
  the placed values into its view, saving keeps overrides whose rows the
  sketch does not author, and a global rename rewrites both tables. The
  sketch commits to the node live whatever its table resolves to; a face
  whose sketch does not evaluate renders its base host until the table
  resolves, and the evaluation error rides the editor's message.
- **Edge spans** — a host edge is an interval. Child faces carry
  `edgeStart` plus their `defaultLength`; free shards exclude child
  faces, and a face placement that overlaps or overflows refuses.
  Profiles reserve no interval: an open profile places by its array
  settings across the whole host edge and several open profiles may
  share it, while a closed profile footprint leaves the edge intervals
  free. Folds and contour splices use the owned interval only. The
  designer draws one + handle per free shard; a face's own base edge
  carries none, and the clicked shard is the interval the new face
  takes. A child face's span stays its authored `edgeStart` and
  `defaultLength` parameters. A closed profile may cross a child face's fold interval and
  cut the host; the fold route keeps the authored edge. An open profile
  arranges only on an edge without a fold.
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
    follows the stitched boundary. The margins hold from both edge ends
    for the whole copy; a count spreads whole copies over the span the
    chord leaves (a count the span cannot hold refuses); step packs at a
    fixed pitch and gap packs at a fixed clearance from the binding. A
    single count anchors on the binding, so an authored tab may straddle
    the edge. The array binding
    (`start`/`center`/`end` snap) places the array; copies always run
    edge-start to edge-end. The embedding reports the copy frame (origin,
    anchor, rotation, mirror) the sketch canvas uses to place the authored
    sketch on the assembly. A placement that cannot fit, or a margin
    that leaves no span, is an evaluation error; refusals ride
    `profileEmbeddingErrors`
    (`{relationId, reason}`). Authored array values are expressions read
    nullishly (`??`): an empty string or a zero is the author's text
    mid-edit, and a default substituted there rewrites the field under
    the caret. An array patch merges into the definition; a flat array key
    maps to the same field.
  - Closed profiles produce their production effect through the same
    pass. They do not consume edge space: several may share an edge with
    faces and open profiles, and their overlapping operands merge through
    the boolean fold. The boolean result's rings
    place by the axis law — the zero axis lands on the attachment edge
    (snap plus offsets, +X toward the host face, authored distances
    riding along as drawn; a point placement rotates by the relation's
    rotation alone) — and each copy cuts the host face where it
    intersects, every ring a cut operand (the boolean difference the
    integral-cut hanger clips ride), with the cut paths named on
    `cut.inner` in the evaluated layerData (a dedicated registry row
    awaits an owner-named production name). A closed profile places by
    point, edge array, or face array; the face array grid carries each
    copy's boolean steps to its own anchor. Hardware uses the same three
    placement modes. An invalid array refuses the evaluation; the
    designer reports it through `attachmentErrors`.
  - A fold edge carries no open profile: both profile passes refuse the
    arrangement, and the designer's edge chooser offers the arrangeable
    edges only — authored edges less folds. Profiles and hardware may
    share an edge; the write path snaps a stale illegal default to the
    first arrangeable edge.
  - A placement's binding is one chain: the joint's source occurrence,
    target occurrence and face, and the array pattern's edge; the driver
    joint's placement mirrors onto the source workpiece's `placement`
    for production. An unresolved target or face keeps the relation
    unplaced — it lists under its source workpiece until rebound, and
    the read path never substitutes another workpiece's face.
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
  Face fills stay per face so adjacent faces keep their own fill and the
  fold route separates them; `cut.outer` carries the production union.
  The native assembly renders fill-only paths as solid hatches: each
  subpath becomes one loop with outer and hole rings wound opposite, and
  the path's opacity rides the entity transparency. Outline paths stay
  polylines. Hollow faces keep their holes open in every preview mode.
  Dimension annotations travel as structured entities on the drawing and
  seed the native dims directly. The load-picker thumbnail layer set —
  outline (`cut.outer`) and folds (`fold.route`) matched by `standardCode`
  (layer names are localized export names); all layers for a drawing outside
  the set — resolves through `cassettePreviewLayerSelection`
  (`surfaces/lib/drawingPreview.js`), the single home the designer's
  load-picker thumbnails reuse. The cassette-preview surface mounts the
  native host with every drawing layer and its own layer control.
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
