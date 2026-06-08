# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

## Design System Contract

- `design-system-contract.js`: Compatibility exports and validation for the CNC design-system contract now owned by `@cutkit/domain-cnc`. It does not import Vue components.
- `design-system.js`: Runtime binding that attaches Vue card components and DTO factories to the contract. Used by `/test/ui-lab`.
- `data-display.js`: Shared path resolution and value formatting for generated `DataBlock` rows. It formats scalar values, booleans, scalar arrays, object arrays, and named object references while hiding non-displayable nested objects instead of rendering `[object Object]`.
- `status-engine.js`: Compatibility status severity/icon mapping and entity route/icon registry used by shared status and trace components. New source-of-truth UI, artifact, and route metadata belongs in `@cutkit/domain-cnc` and is adapted by `@cutkit/vue`.
- `status-actions.js`: Converts workflow definitions into default `EntityStatus` action buttons so cards do not use hardcoded state transitions. Respects transition `display` (`inline`, `menu`, `hidden`) and hides self-loop metadata transitions by default. Callers may pass a workflow override; otherwise the utility uses the committed `@cutkit/domain-cnc` workflows.
- `status-location.js`: Normalizes typed current location facts from `status.lifecycle.data.location` for status surfaces. Supported UI types are `warehouse`, `coordinates`, and `address`.
- `selectOptions.js`: Pure helpers for PrimeVue Select option arrays. Use it to
  normalize canonical DTOs (`identity.name`, `identity.slug`, `_id`) into flat
  string `name`/id values before passing them to `optionLabel="name"` controls.
- `drawingPreview.js`: Pure drawing preview helpers for `DrawingCanvas`. It normalizes entity geometry previews and cassette render results into the shared `{ viewBox, layers }` drawing contract, extracts designer edge overlays, and resolves layer pens by explicit source mapping, caller-provided `standardCode`, layer-name standard fallback, then default pen. It must not hardcode production layer standard codes; source/caller data owns layer semantics.
- `occs/`: Canonical OCCS helpers for semantic layer ids, parameter
  extraction, arithmetic expression evaluation, Clipper-backed production
  layout, default dimension annotation entities, DrawingCanvas conversion,
  folded-preview payloads, default fixture templates, and graph-tree template
  evaluation for nesting. These helpers are the source for cassette v2 previews
  and fixture queue parameters.
- `dxfParser.js`: Browser DXF parsing and preview helpers. Layer-to-pen mapping
  consumes layer-standard DTO fields (`data.code`, `data.defaultPenId`,
  `data.orgPenId`) and pen DTO stroke data (`data.stroke`) so the seeded OCCS
  layer catalogue is the source for preview styling.
- `domain-builder.js`: Browser-side helpers for `/admin/domain-builder`. It clones CNC package definitions into a draft, validates entity/workflow/summary consistency, builds automatic Vue Flow node/edge layout data with reciprocal-transition metadata used unless the page has browser-local manual node positions, and generates deterministic `@cutkit/domain-cnc` source for manual export.
- `workflow-compiler.js`: Shared workbench/domain-builder compiler wrapper for live workflow drafts. It validates draft machines, exposes state options for typed forms, and derives permission summaries used by fixture scenarios and workbench test access. If a caller has not loaded entity or hook definitions yet, it falls back to committed CNC contracts so workflow validation does not report every known workflow/hook as unknown.
- `cassette.js` / `cassetteRenderer.js`: Browser cassette designer helpers. ID generation must work on plain HTTP LAN deployments where `crypto.randomUUID` may be unavailable; use local helpers that fall back to `crypto.getRandomValues` before non-cryptographic IDs.
- `cassetteV2Clipper.js`: Cassette Designer v2 layout boolean helper. It loads
  the vendored `clipper2-wasm` ESM/WASM runtime from `public/vendor/clipper2`,
  unions evaluated closed face curves/paths into `cut.outer`, normalizes input
  winding before the boolean so overlapping regions do not cancel each other,
  subtracts the union boundary from original source curves to derive
  `fold.route` remnant segments, splits fold remnants at intersections, and
  joins connected fold segments into polylines where possible.
- `cassetteV2FoldedPreview.js`: Pure folded sheet preview helper. It consumes
  evaluated 2D face loops plus OCCS fold topology, places every disconnected
  workpiece root in the XY plane, recursively rotates child faces around parent
  fold axes by their fold angles and child attachment edge indices, preserves
  child face offsets along the selected parent edge when deriving the hinge
  origin from evaluated flat loops, applies
  workpiece joint transforms from folded source/target face snap points and
  face-relative offsets, and returns 3D face points for thumbnail rendering.
- `cassetteV2Trapezoid.js`: Pure OCCS trapezoid geometry helper. It resolves
  canonical trapezoid points from base length, zero-default offsets, and height,
  then places child faces on the selected parent edge's exterior side with child
  `E0` reversed against the shared parent edge so both polygons remain CCW. It
  returns closed face curves for the v2 renderer.
- `cassetteV2Renderer.js`: Cassette Designer v2 graph adapter. It owns the local
  recursive `face.trapezoid` graph-tree model with a top-level OCCS-style
  parameter scope, separate workpiece roots, and explicit workpiece joints,
  builds live preview curves through `cassetteV2Trapezoid.js`, delegates
  production layer drawing and folded-preview payload construction to
  `occs/`, emits OCCS v0.4-draft
  workpiece definitions, occurrences, joints, per-workpiece faces, and
  per-workpiece folds plus default `dimension.cassette` entities,
  derives locked click targets plus fold-angle edit handles from tree folds,
  and adapts editor-only graph state into canonical OCCS helper inputs.
  It also exposes workpiece topology helpers for ordered workpiece-tree rows,
  source/target face-snap relation editing, workpiece subtree deletion,
  selected-workpiece flat preview, all-workpiece flat layout, and
  attachment-driven assembly placement.
  It keeps Nodi graph composition helpers for export/debug checks, but live
  trapezoid preview does not initialize Nodi. Face socket values may be
  OCCS arithmetic expressions using identifiers, `+ - * /`, parentheses, unary
  minus, and degree-based `sin()`, `cos()`, and `tan()`; child face scopes add
  `foldAngle` from the incoming parent fold. Helper code preserves expressions
  in OCCS and resolves numeric preview values from the current parameter scope.

## Utility Protocol

Keep utilities pure: they should not call `$fetch`, mutate Pinia stores, or own
component state. Cross-entity generated data belongs in `test-data/scenarios.js`;
stateful workbench flows belong in stores/composables; backend writes belong in
server feature services and repositories.

The design-system contract is the source of truth for UI lab coverage. Add new entity cards there first, then wire the component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
