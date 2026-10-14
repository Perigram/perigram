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
  coordinates, hole centers and diameters, fillet radii, parameter values,
  anchor distances) carries a number or an expression string evaluated
  against the parameter table through `expressions.js` — the same
  evaluator the cassette tree uses. `evaluateOccsProfileSketch` resolves
  the whole sketch (parameters may reference each other; cycles and
  unknown identifiers throw); the savable gate and the editors' save
  buttons turn those throws into authoring feedback, never silent zeros.
  Points that an extracted arc flattened to chords carry a `chord` flag —
  real geometry, but not authored corners; the editor collapses their
  runs into single read-only chips. Anchors tie a profile to its host: a
  closed profile carries one anchor vertex (it lands on the attachment
  snap+offset point when inserted), an open profile carries start/end
  distances (margins from the host edge's two ends — the profile runs
  from the first and the contour breaks at both). The same module
  normalizes CAD entity records (LINE/ARC/CIRCLE/polyline) into the
  sketch model (`occProfileSketchFromEntities`) and back
  (`occProfileEntitiesFromSketch`): the browser sketch canvas — the
  vendored MLightCAD CAD engine — seeds from the sketch and is
  re-extracted through this one path. A tangent corner arc between two
  line segments maps to the corner's fillet modifier (the polygon keeps
  the theoretical sharp corner); any other arc flattens to chords within
  a 0.05 mm sagitta tolerance; circles become holes. A sketch is authored
  closed or open (the editor's toggle; drawn chains keep their extracted
  closure — closed boundaries with three or more points save closed, open
  chains with two or more save open). An open profile saves as a
  `polyline` section whose first and last vertices are its break points:
  the designer's section layer marks them and splits the host face's
  contour at their projections (or at the anchor distances, when set)
  where the profile lands, and the evaluated layerData carries the two
  contour chains into production redraw on `contour.cassette_face`. The
  sketch editor's authoring rows edit the parameter table, vertex
  coordinates, fillet radii, and hole geometry directly on the sketch
  model, with a read-only evaluated dimension row (edge lengths and
  total) beneath; the extraction pass re-derives points, holes, and
  modifiers from drawn geometry, so a later draw or import overwrites
  authored expressions and radii. Parametric instantiation: a profile
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
  placements. Open profiles inserted into a face contribute their break to
  that layerData: the host contour's two chains between the break
  projections ride `contour.cassette_face` (nesting polygons stay whole —
  a break is an edge feature, not a cut).
- `drawing.js` converts resolved OCCS face curves into the shared
  `DrawingCanvas` `{ viewBox, layers }` contract with explicit layer-standard
  codes, including generated dimension annotation layers and caller-provided
  annotation/mark layers.
- Cassette Designer v2 emits a `code.cassette_mark` text entity for the
  bottom-left of each sheet workpiece's main/root face. The resolved text uses
  the cassette template name, template id, and one-based workpiece number; the
  same layer data is carried through baking and nesting. Designer-only section
  preview lines stay on `designer.section` so production mark layers do not
  receive contour-like helper paths.
  Whole-workpiece assembly previews use the same per-workpiece production layout
  as face/workpiece previews, so `contour.cassette_face`, `cut.outer`, and
  `fold.route` are dispatched from unioned workpiece geometry instead of raw
  per-face paths.
- `folded-3d.js` prepares canonical folded preview payloads for the Three.js
  preview component, including optional non-sheet hardware body descriptors.
- `templates.js` provides the default OCCS cassette fixture template.

## Conventions

These modules are pure: they do not call stores, `$fetch`, or Vue component
APIs. Cassette Designer v2 may adapt its graph-tree editor state into OCCS, but
geometry/layer/export decisions should live here.
