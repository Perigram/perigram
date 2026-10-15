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
  history. Integral-cut hanger clips resolve through curve boolean difference:
  the parent face becomes the resulting polygon. Fully internal cutouts remain
  on `cut.inner`; edge-breaking hanger operands are boolean-only and dispatch
  only through the modified `cut.outer` contour. Bolt/rivet/screw/spacer/standoff
  placements resolve to exact `cut.hole` circles. Edge arrays use attachment X
  as a margin from both edge ends, attachment Y as the face-normal offset, and
  the target snap (`start`, `end`, or `center`) as the array binding before
  applying either a `count` or `spacing` rule. Cassette Designer v2 exposes that
  same contract as edge margin, normal offset, edge, count/step value, and
  profile mirror controls on the attachment relation; hanger width/height is
  not duplicated in the workpiece row when a saved profile supplies geometry.
- `profiles.js` declares the reusable OCCS profile sketch helper used by
  Cassette Designer v2. It keeps profile sketches declarative but direct:
  editable snap points, point-by-point polylines with explicit open/closed
  state, circle holes, and per-corner fillet modifiers are normalized into
  `profile.section` polygon/polyline data plus a linear `profile.sweep`.
  The parameter table starts empty — parameters are added when a sketch
  needs them, nothing is pre-seeded. Every authoring field (point
  coordinates, hole centers and diameters, fillet radii, parameter
  values) carries a number or an expression string evaluated
  against the parameter table through `expressions.js` — the same
  evaluator the cassette tree uses. `evaluateOccsProfileSketch` resolves
  the whole sketch (parameters may reference each other; cycles and
  unknown identifiers throw); the savable gate and the editors' save
  buttons turn those throws into authoring feedback, never silent zeros.
  Points that an extracted arc flattened to chords carry a `chord` flag —
  real geometry, but not authored corners; the editor collapses their
  runs into single read-only chips. Anchors are the placement basis of a
  closed profile: one chosen vertex — picked ON the canvas (the Basis
  toggle arms a modal pick; dashed targets highlight every corner) and
  shown as a datum mark — that lands on the attachment snap+offset point
  when inserted, with cut geometry taken anchor-relative. Open shapes
  carry two anchors — their first and last vertices, the same vertices
  that break the host contour — shown as datum marks beside the sketch
  origin, which the canvas always marks (0,0), empty sketch included;
  insertion places by the origin and breaks the host contour at the
  endpoints. Anchors are model state, not geometry: extraction preserves
  them instead of re-deriving (open-shape anchors are derived from the
  chain ends, never stored). One connected chain is the law: when drawn
  or imported entities hold pieces no chain joins, extraction keeps the
  longest chain but records the leftovers as the sketch's `unchained`
  count, the savable gate refuses while it is non-zero, and the editor
  surfaces it — never a silent drop, never an auto-connect with lines. Dimensions are
  automatic annotations over the canvas: a derived overlay (a computed
  keyed on the view's render frame) draws one linear dimension per
  authored edge — extension lines, ticks, the measured length —
  tracking pan and zoom; display-only, never written to the drawing
  database, the sketch model, or saved documents. The same module
  normalizes CAD entity records (LINE/ARC/CIRCLE/polyline) into the
  sketch model (`occProfileSketchFromEntities`) and back
  (`occProfileEntitiesFromSketch`): the browser sketch canvas — the
  vendored MLightCAD CAD engine — seeds from the sketch and is
  re-extracted through this one path. A tangent corner arc between two
  line segments maps to the corner's fillet modifier (the polygon keeps
  the theoretical sharp corner); any other arc flattens to chords within
  a 0.05 mm sagitta tolerance; circles become holes. A fillet radius
  larger than the corner's adjacent segments allow renders as the largest
  tangent fillet that fits — the emitted arc is derived from the trimmed
  tangent points, so it round-trips back through extraction instead of
  degenerating into chords. The stored section keeps the theoretical
  sharp corners and its fillet modifiers;
  `occProfileSectionChainedVertices` resolves them to arc points (same
  trim/bisector math, same clamp, same chord tolerance) — the walk every
  cassette consumer draws: the open-profile edge embedding, the
  closed-section cut polygons, and the 3D preview bodies. A sketch is authored
  closed or open (the editor's toggle; drawn chains keep their extracted
  closure — closed boundaries with three or more points save closed, open
  chains with two or more save open). An open profile saves as a
  `polyline` section whose first and last vertices are its break points:
  the composite chain splices into the host face's contour where the
  profile lands (the designer draws the stitched boundary; the evaluated
  layerData carries the composite into production redraw on
  `contour.cassette_face`). The
  sketch editor's authoring rows edit the parameter table and hole
  geometry directly on the sketch model, beneath a dimension annotation
  band; vertex coordinates and fillet radii edit through a canvas popup
  that opens on the selected corner (Select-tool click near an authored
  vertex; Escape or clicking away closes it). Escape routes at the window
  level: it closes the popup, cancels the engine's active command, and
  clears the selection — from any focus, including a toolbar button or an
  authoring field. The canvas reseeds (clear + redraw) on every authored
  edit, and the engine's selection dies with the removed entities — a
  selection left standing over reseeded geometry references dead object
  ids and the next erase fails inside the engine. The sketch model is the
  single truth and the canvas is its render and input surface:
  extraction MERGES back (`mergeOccsProfileSketchGeometry`) — a corner
  whose extracted position matches its authored evaluation keeps the
  authored id, expressions, and fillet radius, so drawing, importing,
  or undoing never destroys parametric authoring; moved or new
  geometry goes numeric, and an authored sketch whose expressions no
  longer resolve falls back to the plain extraction until fixed.
  Parametric instantiation: a profile
  workpiece's parameter table overrides the profile's authored table and
  its snapshot re-derives from the authored sketch (the stored section is
  a last-good cache — a transient invalid parameter holds it); the
  workpiece rows edit instance parameters in place, instance values may
  be cassette expressions — the cassette's global parameters join the
  evaluation scope but never bake into the stored table. Profiles live on
  the tree: the designer's profile dialog writes profile workpieces
  (their `profileSnapshot` is the renderer's geometry source) that ride
  the cassette template's own document — there are no standalone profile
  records of any other type. The current editor does not run a parametric
  constraint solver.
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
  whole copy (count/spacing distribute copy starts over the span the chord
  leaves), so every count/spacing setup that fits embeds. The array binding
  (start/center/end snap) places the array, never the walk direction:
  copies always run edge-start to edge-end. Overflowing, overlapping, or
  too-short placements refuse the evaluation with an error instead of
  clamping; the designer drawing carries the refusals as
  `profileEmbeddingErrors` (`{relationId, reason}`) so the attachment row
  shows a refused status instead of the profile vanishing silently.
  Closed profile sections produce their production effect through the
  same pass (owner law 2026-10-15, profiles are terminal): the array
  settings (or the point placement) place the section copies and each
  copy cuts the host face where it intersects — the boolean difference
  the integral-cut hanger clips ride — with the cut polygons named on
  `cut.inner` in the evaluated layerData and the designer drawing
  (a dedicated registry row awaits an owner-named production name; the
  inner-cut layer is the existing production home of exactly this
  operation).
- `drawing.js` converts resolved OCCS face curves into the shared
  `DrawingCanvas` `{ viewBox, layers }` contract with explicit layer-standard
  codes, including generated dimension annotation layers and caller-provided
  annotation/mark layers. Every standard layer's display name is its
  registry production export name (`occsLayerExportName`) in every drawing
  mode — bare codes never surface; `standardCode` carries the matching key.
  The designer's layer panel lists the FULL standards registry (every layer
  of the old standard, present in the drawing or not) through
  `cassetteV2LayerPanelRows`: each row carries the production name, the
  language-neutral code, and the standard pen; only layers the drawing
  carries get live visibility toggles, and the drawing's non-standard layers
  (designer-only helpers) follow after the registry rows.
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
  Closed profile sections ride the same body channel: their fillet-resolved
  section (holes included) extrudes along the sweep length at every
  array/point placement — profiles are physical parts in the 3D preview,
  placed by the same relation settings production uses. Profile relations
  carry no source face, so they never enter the face-joint diagnostics
  (their placement IS the body channel — no unresolved noise).
- `templates.js` provides the default OCCS cassette fixture template.

## Conventions

These modules are pure: they do not call stores, `$fetch`, or Vue component
APIs. Cassette Designer v2 may adapt its graph-tree editor state into OCCS, but
geometry/layer/export decisions should live here.
