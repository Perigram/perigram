# COMPONENT: OCCS Utilities

Pure helpers for canonical Open Cassette Component Standard handling in the
frontend/shared utility layer.

## Responsibilities

- `layers.js` exports semantic OCCS layer ids, including production contours,
  fold/cut routes, dimensions, and `code.cassette_mark` annotation marks.
  Styling remains owned by layer standards and pen templates.
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
  applying either a `count` or `spacing` rule.
- `profiles.js` declares the reusable OCCS profile sketch helper used by
  Cassette Designer v2. It keeps profile templates declarative but direct:
  blank profile drawing sessions, editable snap points, point-by-point
  polylines with explicit open/closed state, typed segment-distance projection,
  ortho projection, circle holes, DXF-imported geometry, and per-corner fillet
  modifiers are normalized into `profile.section` polygon/circle data plus a
  linear `profile.sweep`. Save/insert workflows accept any drawn boundary with
  at least three points and close it into a profile section snapshot so users do
  not need to run a separate close command before persisting or inserting. The
  current editor does not run a parametric constraint solver.
- `production-layout.js` wraps the Clipper-backed face union/fold-route pass and
  returns semantic `cut.outer` / `fold.route` layer intent.
- `evaluate.js` resolves OCCS graph-tree templates into production data. It
  evaluates each `sheet` workpiece in local workpiece space, runs the
  Clipper-backed cut/fold pass per sheet, and returns one `cut.outer` nesting
  polygon set per sheet workpiece with `workpieceId`, definition id, and
  occurrence id metadata. The same evaluated `layerData` is carried through the
  nesting request as source layers so generated sheet designs can redraw placed
  cut, fold, dimension, and annotation layers after the worker returns
  placements.
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
