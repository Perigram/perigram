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
  same layer data is carried through baking and nesting.
- `folded-3d.js` prepares canonical folded preview payloads for the Three.js
  preview component.
- `templates.js` provides the default OCCS cassette fixture template.

## Conventions

These modules are pure: they do not call stores, `$fetch`, or Vue component
APIs. Cassette Designer v2 may adapt its graph-tree editor state into OCCS, but
geometry/layer/export decisions should live here.
