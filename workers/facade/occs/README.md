# CODE: OCCS Engine

The OCCS (Open Cassette Component Standard) engine, single-homed in the
facade plugin: the executor's construction services
(`workers/facade/services.js`) and the editor surface modules
(`../surfaces/`) both import it, and the executor serves it statically so
the browser-side editor evaluates live geometry from the same files. Pure
modules — no platform imports.

## Responsibilities

- `layers.js` exports semantic OCCS layer ids, including production contours,
  fold/cut routes, dimensions, and `code.cassette_mark` annotation marks.
  `layerStandards.js` also carries each layer's production export name from
  the spec registry (parametric where the registry names them so: the cut
  layers' `{diameter}`, the fold route's `{angle}`), and
  `occsLayerExportName(code, overrides)` resolves it — the sheet-DXF export
  names every layer through it, never through bare codes.
- `layerStandards.js` ships the cassette layer standards (owner direction
  2026-10-11): the OCCS layer vocabulary and its pens as one runtime table
  (code, group, kind, purpose, production, pen), replacing the pre-extraction
  system-seeded layer-standard instances. The renderer and every editor or
  preview surface bake these pens through `applyOccsLayerPens`; the spec
  registry (docs/specs/Cassette spec/layers.json in the platform repo) stays
  the vocabulary of record, pinned in sync by
  `shared/facade-layer-standards.spec.js`.
- `dimensions.js` builds canonical `dimension.cassette` annotation entities
  and drawing primitives. Template dimensions keep expression text such as
  `A`, `B`, or `R`; evaluated design annotations store measured numeric values.
- `parameters.js` extracts template parameters from both legacy cassette
  definitions and OCCS documents so queues and fixture scenarios share one
  parameter path.
- `expressions.js` evaluates the lightweight arithmetic/trig expression subset
  used by cassette templates.
- `hardware.js` declares the OCCS hardware catalog used by Cassette Designer v2:
  bolts, nuts, washers, rivets, screws, spacers, standoffs, and hanger clips.
  It keeps hardware declarative with parameters, interfaces, preview metadata,
  hanger production modes (`sheetPart`, `integralCut`, `castSolid`), and
  edge-array expansion helpers instead of storing constructive solid operation
  history. The plugin's `hardware` library type (listing) holds reusable
  tuned presets (family, mode, parameters) authored from the designer's
  hardware dialog — a parameter form over this catalog, never a canvas —
  and placed hardware workpieces edit their parameters on the nested row. Integral-cut hanger clips resolve through curve boolean difference:
  the parent face becomes the resulting polygon. Fully internal cutouts remain
  on `cut.inner`; edge-breaking hanger operands are boolean-only and dispatch
  only through the modified `cut.outer` contour. Bolt/rivet/screw/spacer/standoff
  placements resolve to exact `cut.hole` circles. Edge arrays use attachment X
  as a margin from both edge ends, attachment Y as the face-normal offset, and
  the target snap (`start`, `end`, or `center`) as the array binding before
  applying either a `count` or `spacing` rule. `spacing` is the gap between
  adjacent copies — zero butts them together — and a spacing rule places the
  copies that fit, never stretching them over the edge; point-like hardware
  copies carry no length of their own, so there spacing is the pitch between
  placements. Cassette Designer v2 exposes that
  same contract as edge margin, normal offset, edge, count/spacing value, and
  profile mirror controls on the attachment relation; hanger width/height is
  not duplicated in the workpiece row when a saved profile supplies geometry.
- `profiles.js` declares the OCCS profile shape model used by Cassette
  Designer v2 (owner decision 2026-10-18, pathfinder-ops amendment
  2026-10-19): a sketch is a list of parametric shapes evaluated on the
  zero axis. Shape kinds: `rect` (center, width, height, rotation,
  per-corner fillet radii), `circle` (center, diameter), and `chain`
  (point-by-point polyline with its own closure, per-vertex fillet
  modifiers, extracted chord tags). Every authoring field carries a
  number or an expression string evaluated against the parameter table
  through `expressions.js`; a single unknown identifier authored into a
  field adopts that parameter at the field's current value
  (`adoptOccsProfileBindingParameter`). Each shape carries its boolean
  op applied to the FACE — `add` (the footprint unites into the face),
  `subtract` (cuts from it), `construction` (excluded; a DXF import
  lands every shape at construction through
  `occProfileSketchFromEntities`' `reference` option). The fold is an
  ordered CSG sequence (owner direction 2026-10-19, ordered sequence):
  each participating shape applies to the face in authored list
  order — a later add refills an earlier cut.
  `resolveOccsProfileSectionOperations` returns the authored steps in
  list order;
  `foldCassetteV2Region` (the vendored Clipper pass) is the one fold
  every consumer rides, over a full region — outer polygons plus hole
  rings — so a hole survives every later op. The editor hatches the
  FACE: the material half (`material` flips its side) folded through
  the profile's ops — adds extend the hatch past the axis, subtracts
  punch it empty — while the drawn primitives stay bare engine lines
  beneath it: hatch and strong outline are what goes to the cassette,
  bare lines are what is authored. Production folds the placed steps
  against the host face with its holes, the face being the largest
  ring of the fold so material islanded off the face stays off its
  contour. The folded region's outer and hole rings are the only
  geometry the outputs carry — the drawing's `cut.inner` layer, the
  evaluated layerData, the folded cutouts, and the OCCS document's
  face shapes all read the result rings (`resultInnerCutEntities`;
  overlapping operands dissolve into one merged ring, each ring
  attributing to the relation of the operand it swallows). A result
  hole in material hanging past the authored face boundary (a
  straddling tab) rides the contour, staying off the inner-cut
  layer. The
  operand entities stay on the OCCS wire as authored truth
  (`booleanOperation` steps: an add reshapes the contour only, a
  subtract inside the face becomes one of the result's hole rings,
  one breaking the edge dispatches through the modified contour).
  Primitive parameters author as on-canvas dimension annotations (the
  cassette editor's dimension law): every rect field (width, height,
  position from the axis, height from the origin) and circle field
  (diameter, position) renders as a dimension labeled by its parameter
  expression where one is bound — measured numbers otherwise — and
  edits in place, typing commits the field: a dimension bound to a
  bare parameter is that parameter's editor — a typed number commits
  to the parameter and every field bound to it follows, while a
  compound expression (`W/2`) commits to its own field; stacked
  dimensions on one baseline chain outward (slots keyed on world
  position, so navigation keeps them in place), and every dimension
  line terminates in arrowheads. Concentric primitives bound to the
  same position expression render one dim for it; divergent
  expressions each keep their own. The sketch's expression table lives
  in the parameter
  strip above the canvas (the `fx` row — its one home); the primitives
  panel floats inside the canvas beside it and rides the workpieces
  tree's row anatomy: a quiet full-width select row per shape — kind
  glyph, truncated kind name, the op as a state tag (success/danger/
  secondary) — with rows in the authored CSG sequence (drawing and
  import order; the sequence is semantic). Selecting a row replaces
  the tag with the settings: the move-earlier/move-later controls
  (the sequence is the evaluation), the segmented
  Add/Subtract/Construction control, the shape's whole authoring
  table as wrapping expression inputs (sizes, position, rotation,
  fillet radii — the same model the canvas dims edit), and the row's
  delete action. A repeat click collapses. Canvas picks select their
  shape the same way. Primitives are atomic: the row's delete and a
  partial engine erase both remove the whole shape (the reseed clears
  the leftover entities — a half-erased rect never degrades into
  loose lines); chains keep their per-segment nature. A selected
  primitive's popup carries its op segmentation, rotation, and
  fillet radii as one compact panel (header, then a single field
  row), and opens on
  clicking the primitive — face, edge, or cutout. Floating authoring
  chrome (popups, dimension inputs) styles through the design-token
  utilities `bg-content`, `border-content-border`, and `text-muted`,
  and every authoring field sizes to its content (growing while
  typing) so its value stays whole.
  The default
  hanger
  template is parametric by law: a rect (W/H the rectangle, R the four
  corner fillets) plus a subtract circle (D, the hole), with L resolving
  the sweep at evaluation, so a cassette's instance parameters drive it
  the moment it is attached — the workpiece row's chips are live. The
  template is the renderer's fallback for sketch-less workpieces, never
  the dialog's starting draft (owner decision 2026-10-17: every dialog
  session drafts blank — empty canvas, empty table), and an attached
  workpiece's table is its derived sketch's table with the instance values
  on top, so the row renders a chip for every parameter the sketch
  binds, and the profile dialog opens a placed workpiece on that
  derived table — the editor edits what the workpiece renders.
  The numeric geometry seed that `normalizeOccsProfileSketch` fills a
  sketch-less read with stays literal. A blank authoring session starts
  with an empty table — parameters are added when a sketch needs them;
  the dialog opens that blank session, and clearing the canvas restarts
  it (the previous session's table dies with its geometry). The blank
  canvas opens at drawing scale — a 200×150 mm window with the zero
  axis in view — so freehand drawing lands in millimetres.
  `evaluateOccsProfileSketch` resolves the whole sketch (parameters may
  reference each other; cycles and unknown identifiers throw); the
  savable gate (`isOccsProfileSketchSavable`) turns those throws into
  authoring feedback and requires at least one participating shape — a
  closed participant, or an open chain as a cut path. Fillets are
  non-destructive: they live as modifiers on their shape (per-corner on
  rects, per-vertex on chains), stay editable after application, and a
  radius larger than the corner's adjacent segments allow resolves as
  the largest tangent fillet that fits — the emitted arc derives from
  the trimmed tangent points, so it round-trips back through extraction.
  A fillet modifier on a chain resolves by its point id (ids are
  identity, not position); sections keep the `vertexIndex` convention
  only on polyline sections, where `occProfileSectionChainedVertices`
  remains the walk that resolves fillet corners to arc points.
  A single open chain with no boolean shapes keeps the `polyline`
  section: its first and last vertices are the break points where the
  composite chain splices into the host face's contour (the embedding
  law below); boolean shapes never apply to it. Extraction keeps every
  drawn piece as its own shape — a closed four-vertex right-angle chain
  detects as a `rect` primitive in canonical order (counter-clockwise
  from the leftmost corner, so the draw direction leaves the stored
  settings and corner labels unchanged; rotation normalizes into
  (−90°, 90°] with width and height swapping past the half-turn, and
  every extracted numeric — rect center, width, height, rotation,
  circle center and diameter — rounds to 1e-3 mm), circles land as
  `subtract` shapes on a draw, and `mergeOccsProfileSketchGeometry`
  merges back under the one-way truth rule: shapes match by geometry
  identity — a rect when its four corners match the authored
  evaluation's corners as a set (ring start is draw-direction noise),
  a circle by center plus diameter, a chain per point — and a matched
  shape keeps the authored id, op, expressions, and fillets whole, so
  drawing, importing, and undoing preserve parametric authoring; the
  op rides the authored shape, and extraction defaults apply only to
  genuinely new shapes. Kept shapes ride their authored sequence
  slots and fresh shapes append — the CSG order survives every
  extraction roundtrip. A moved field keeps its authored expression
  when it names a parameter — the drag edits that parameter (the
  dimension is that parameter's editor) — while compound expressions
  and numerics carry the extracted value. Authored shapes with no
  extracted counterpart were erased and drop. An authored sketch
  whose expressions do not resolve keeps the authored model whole
  (the drawing-is-sacred law): canvas geometry merges on the next
  pass once the text resolves, and the editor renders from the last
  good evaluation in between — geometry, dims, hatch, and popups
  stay live while the invalid text sits in its field. A
  fourth argument offers dropped authored shapes back as
  adoption candidates: the editor keeps the last drops in session
  memory, so an engine undo/redo that restores erased canvas geometry
  revives the shape with its expressions (an erase alone drops it; the
  revive needs the geometry back on the canvas). Fresh ids renumber
  against every kept id by object identity — an extracted id colliding
  with a kept id still renumbers. The shape popup carries a segmented
  Add/Subtract/Construction control — the boolean selection applied to
  the face, each option's tooltip naming it.
  Document transitions (DXF import) bind the database listeners without
  scheduling an extraction: the import's own explicit extraction is the
  one that lands. Legacy chain sketches (points/edges/holes/closed/
  anchors) upgrade into the shape model at `normalizeOccsProfileSketch`
  — the chain becomes one chain shape, holes become subtract circles,
  and a closed sketch's basis anchor becomes the axis (the chain
  translates so the anchor vertex sits on X=0, coordinates numeric);
  `upgradeLegacyOccsProfileSketch` is the same upgrade for the one-shot
  migration script. Parametric instantiation: a profile
  workpiece's instance parameters override the profile's authored table —
  the workpiece's own table is the derived table with those instance
  values on top — and its snapshot re-derives from the authored sketch
  (the stored section is a last-good cache — a transient invalid
  parameter holds it); the workpiece rows edit instance parameters in
  place, instance values may be cassette expressions resolved in the
  joined scope where the profile's own table shadows the cassette's
  globals (inner over outer) while the raw expression stays stored.
  Parameter names rename in place
  (`renameOccsProfileSketchParameter` moves the key, order preserved,
  and rewrites every reference as whole identifiers), and a cassette
  global's rename rewrites the whole tree
  (`renameCassetteV2TreeParameter`). The row's chips are the
  shared expression editor
  (`surfaces/lib/components/expressionEditor.mjs`)
  over the cassette's variables, and adopt-on-bind never mints an
  identifier the surrounding scope defines: the profile editor
  evaluates and saves against the joined scope the same way. Profiles
  live on the tree: the designer's profile dialog writes profile
  workpieces (their `profileSnapshot` is the renderer's geometry
  source) that ride the cassette template's own document. The plugin's
  `profile` library type (listing declarations, class `item`) holds
  reusable profiles as org records: the dialog's Save to library writes
  the authored truth (kind, process, prepared sketch) through the
  records host capability, and picking a library record copies it into
  the draft — a snapshot copy, never a live reference. Library records
  are authored only from the designer dialog; the type carries no
  editor surface of its own, and its write access inherits the cassette
  grant (`access.inherits` in the listing). The add-profile affordance
  is a picker: library rows with evaluated-sketch thumbnails
  (`resolveOccsProfileSketchLayerData` → the drawing-preview normalizer
  — the same projection the bound `profile-preview` surface renders in
  the platform's preview slots; the boolean fold makes it async)
  beside Create new (the blank dialog draft); picking a row places the
  profile as a workpiece directly, and a record whose sketch carries no
  participating shape refuses with the authoring message — the default
  hanger stands in for sketch-less workpieces only, an authored-but-
  empty snapshot never places template geometry. Placed workpieces carry their
  library origin (`profileTemplateId`): edits are local, and the
  dialog's Update library rewrites the origin record explicitly — a
  rewrite never reaches already-placed workpieces. The current editor
  does not run a parametric constraint solver.
- `production-layout.js` wraps the Clipper-backed face union/fold-route pass and
  returns semantic `cut.outer` / `fold.route` layer intent.
- `evaluate.js` resolves OCCS graph-tree templates into production data. It
  evaluates each `sheet` workpiece in local workpiece space, runs the
  Clipper-backed cut/fold pass per sheet, and returns one `cut.outer` nesting
  polygon set per sheet workpiece with `workpieceId`, definition id, and
  occurrence id metadata. The same evaluated `layerData` is carried through the
  nesting request as source layers so generated sheet designs can redraw placed
  cut, fold, dimension, and annotation layers after the worker returns
  placements. Open profiles embed through `profileEmbedding.js` (owner law
  2026-10-15): array settings alone place the copies (anchors ON the bound
  edge, no perpendicular offset), the whole edge is replaced by the composite
  chain — host start, straight runs, copy chains, host end — the composite
  rides `contour.cassette_face`, and the production cut/nesting contour truly
  follows the stitched boundary. The margin holds from both edge ends for the
  whole copy: count mode spreads the requested copies over the span the chord
  leaves — a count the span cannot hold refuses — and spacing mode packs
  copies from the binding at the requested gap between them (zero butts them
  together), placing the copies that fit. Authored array values are
  expressions read nullishly (`??`, never a falsy `||`): an empty string or
  a zero is the author's text mid-edit, and a default substituted there
  rewrites the field under the caret. A relation patch carrying any array
  field updates the pattern — no repeated `placementMode` required. The
  array binding
  (start/center/end snap) places the array, never the walk direction:
  copies always run edge-start to edge-end. A placement that cannot fit, or a
  margin that leaves no span, refuses the evaluation with an error instead of
  clamping; the designer drawing carries the refusals as
  `profileEmbeddingErrors` (`{relationId, reason}`) so the attachment row
  shows a refused status instead of the profile vanishing silently.
  The designer's assembly tree follows the owner layout law (2026-10-17):
  every workpiece renders as a top-level row — sheets and hardware never
  nest under another workpiece — a profile workpiece renders once as a
  child of the workpiece its attachment relation targets (breadcrumb,
  status, positioning, edit, and delete inline), and every other
  relation renders as a relation row under its workpiece.
  Closed profiles produce their production effect through the
  same pass (owner law 2026-10-15, profiles are terminal; owner law
  2026-10-18, axis placement): the boolean result's rings are placed by
  the axis law — the zero axis lands on the attachment edge (snap +
  offsets), +X toward the host face, authored distances from the axis
  riding along as drawn; a point placement
  rotates by the relation's rotation alone — and each copy cuts the
  host face where it intersects, every ring a cut operand (the boolean
  difference the integral-cut hanger clips ride), with the cut paths
  named on `cut.inner` in the evaluated layerData and the designer
  drawing (a dedicated registry row awaits an owner-named production
  name; the inner-cut layer is the existing production home of exactly
  this operation). A fold edge never carries a profile (owner law
  2026-10-16): `profileFoldEdgeRefusalsForTree` refuses the arrangement
  — both profile passes skip it and the designer drawing surfaces the
  refusal through `profileEmbeddingErrors` — and the attachment popup's
  edge chooser lists only `cassetteV2AttachableProfileEdgesForTree`'s
  arrangeable edges (the trapezoid's four authored edges less folds
  and, for profile askers, the edges consumed by other profiles — the
  asking relation's own edge stays listed; hardware arrays may bind an
  edge a profile already occupies, owner law 2026-10-17), snapping a
  stale illegal default to the first arrangeable edge on the write
  path. Attachment authoring is per-kind and picker-driven (owner law
  2026-10-17): the add-attachment control opens a workpiece→face
  picker — the target workpiece and binding face are chosen
  explicitly, never a click-armed connect mode — and the attachment
  settings carry each source kind's own field set with no delete (the
  panel relation row owns removal): profiles attach on the edge-array
  pattern by default and edit placement, array, and mirror controls
  (no face side); hardware places on a face side with snap or array
  (no mirror); workpiece attachments edit symmetric HOST and SELF
  sections — face, side, basis snap, and both offsets each (plus
  rotation in SELF), stored as `target*`/`source*` pairs with
  `source.side` and `placement.sourceOrigin` — with no mirror, driver,
  or joint type in the editor. Both placements honor the pairs: the 2D
  assembly transforms and the folded 3D joint pass apply the self
  offsets in the self face's frame, and the self side flips the sheet
  against the host side (host front + self back lands front-to-front).
  Snap points and array bindings compute from the RAW
  authored face (`originalBoundaryVertices`/`referenceVertices` before
  any profile cut merges into the boundary) — placement anchors never
  drift with cut geometry.
- `drawing.js` converts resolved OCCS face curves into the shared
  `DrawingCanvas` `{ viewBox, layers }` contract with explicit layer-standard
  codes, including generated dimension annotation layers and caller-provided
  annotation/mark layers. Every standard layer's display name is its
  registry production export name (`occsLayerExportName`) in every drawing
  mode — bare codes never surface; `standardCode` carries the matching key.
  The designer's layer panel lists the FULL standards registry (every layer
  of the old standard, present in the drawing or not) through
  `cassetteV2LayerPanelRows`: each row carries the production name and the
  standard pen swatch — bare codes never surface here either; only layers
  the drawing carries get live visibility toggles, and the drawing's
  non-standard layers (designer-only helpers) follow after the registry
  rows.
- Cassette Designer v2 emits a `code.cassette_mark` text entity for the
  bottom-left of each sheet workpiece's main/root face. The resolved text uses
  the cassette template name, template id, and one-based workpiece number; the
  same layer data is carried through baking and nesting. Profiles are
  terminal (owner law 2026-10-15): an edge carrying an arranged profile is
  the end of the face — the + face-grow affordance never appears there and
  `addFaceAtEdge` refuses it (`profileTerminalEdgesForTree`). Profile
  geometry never rides `designer.section`: the open-profile composite
  splices into the drawn face boundary exactly as production embeds it,
  closed sections cut the face on `cut.inner`, and the section layer
  carries section views only (shown under its localized panel label, not
  the code).
  Whole-workpiece assembly previews use the same per-workpiece production layout
  as face/workpiece previews, so `contour.cassette_face`, `cut.outer`, and
  `fold.route` are dispatched from unioned workpiece geometry instead of raw
  per-face paths.
- `folded-3d.js` prepares canonical folded preview payloads for the Three.js
  preview component, including optional non-sheet hardware body descriptors.
  The designer mounts the preview as a bottom strip of the workpieces panel,
  expandable into a popup dialog (same mount, shared selection/isolation
  state). Profile workpieces carry no geometry of their own (owner law 2026-10-15):
  they modify face geometry, and the folded 3D rides the MODIFIED faces —
  the folded-preview curve set runs the same profile pass as the 2D drawing
  (open-profile chains splice into the local boundary, closed sections and
  hardware cuts subtract), with the authored boundary kept as the fold
  reference so edge indexes stay stable. Profiles never ride the body
  channel, and profile relations never enter the face-joint diagnostics
  (they carry no source face by design — no unresolved noise). The same
  law shapes the 2D preview modes: a selected profile previews the
  assembly it is placed in (the geometry its instance parameters drive),
  never a blank solo pane — a profile owns no face to draw.
- `templates.js` provides the default OCCS cassette fixture template.

## Conventions

These modules are pure: they do not call stores, `$fetch`, or Vue component
APIs. Cassette Designer v2 may adapt its graph-tree editor state into OCCS, but
geometry/layer/export decisions should live here.
