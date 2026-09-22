# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

## Design System Contract

- `design-system-contract.js`: Compatibility exports and validation for the CNC design-system contract now owned by `@cutkit/domain-cnc`. It does not import Vue components.
- `design-system.js`: Runtime binding that attaches Vue card components and DTO factories to the contract. Used by `/test/ui-lab`.
- `processDesignerSocketTone.js`: Pure process-port resolver used by every
  designer node form and source edge. It maps structured port type/role data to
  a semantic signal token so a socket and the wire it produces cannot drift
  into separate color contracts.
- `instance-display-contract.js`: Pure resolver for the UI constructor. It merges
  core domain field groups/surfaces, optional app extensions, and per-call
  overrides, then returns the effective surface contract and ordered field
  descriptors for cards, details, workbench previews, and generated consumers.
- `app-instance-surfaces.js`: App-owned display extensions layered on top of the
  core domain constructor. Production pages use it for route-specific surfaces
  such as project workspace rows, project detail facts, and selected warehouse
  inventory context without changing the reusable core library contract.
- `data-display.js`: Shared path resolution and value formatting for generated `DataBlock` rows. It formats scalar values, booleans, scalar arrays, object arrays, and named object references while hiding non-displayable nested objects instead of rendering `[object Object]`.
- `status-engine.js`: Compatibility status severity/icon mapping and entity route/icon registry used by shared status and trace components. New source-of-truth UI, artifact, and route metadata belongs in `@cutkit/domain-cnc` and is adapted by `@cutkit/vue`. Entity icons are CSS class strings: PrimeIcon classes, or the `ck-entity-icon-*` classes of the generated `ck-entity-icons` icon font (see `scripts/build-entity-icons.js`) used by CNC production entities. Keep both registries in sync when changing entity icons.
- `status-actions.js`: Converts workflow definitions into default `InstanceStatus` action buttons so cards do not use hardcoded state transitions. Respects transition `display` (`inline`, `menu`, `hidden`) and hides self-loop metadata transitions by default. Callers may pass a workflow override; otherwise the utility uses the committed `@cutkit/domain-cnc` workflows. Also exposes `hasWorkflow()` so UI primitives can avoid server action lookups for workflow-less entity types without importing the domain package directly.
- `status-location.js`: Normalizes typed current location facts from `status.lifecycle.data.location` for status surfaces. Supported UI types are `warehouse`, `coordinates`, and `address`.
- `instance-events.js`: Browser-local entity change event helpers. Status
  transitions and successful `useEntity()` CRUD mutations emit the changed
  entity through this helper so pages/stores can refresh related data without
  coupling every button to a page-specific command. The standardized event
  detail shape is `{ type, id, entity?, change, reason, source }`, and shared
  caches should subscribe here instead of inventing per-feature buses. Server
  SSE events from `GET /api/instance-events` are bridged into this same helper,
  so local and cross-device updates use one frontend consumption contract.
- `mobile-transient-surfaces.js`: Browser-only helper for mobile navigation
  from temporary UI surfaces. Inline entity popovers and trace links dispatch
  one shared close event before route navigation; overlay owners such as
  popovers, menus, and the chat drawer listen and close themselves. Chat open
  actions can dispatch the same event without viewport gating to close popups
  before the drawer opens.
- `workspace-splits.js`: Pure recursive split-tree operations for IDE-style
  workspaces. It creates leaves, splits a targeted leaf horizontally or
  vertically, updates pane-local selection and split proportions, collapses
  parents when a file closes, and enumerates leaves without coupling state
  mutation to Vue or PrimeVue.
- `project-workspace-state.js`: Versioned serialization and defensive
  normalization for project workspace UI state. Storage keys are scoped by
  user, organization, and project; payloads contain pane/page references,
  references for entities discovered through nested detail regions, and layout
  preferences including each pane's ordered tab keys and selected tab, never
  entity DTOs.
- `interactive-target.js`: Shared DOM guard for entity cards that have parent
  click/select actions. It detects nested links, buttons, form controls, status
  controls, geometry previews, and nested inline/compact entity cards so parent
  clicks do not steal embedded preview/status interactions.
- `selectOptions.js`: Pure helpers for PrimeVue Select option arrays. Use it to
  normalize canonical DTOs (`identity.name`, `identity.slug`, `_id`) into flat
  string `name`/id values before passing them to `optionLabel="name"` controls.
- `instance-select.js`: Pure option resolution for the shared entity Select and
  MultiSelect wrappers. Entity rendering requires a canonical DTO plus an
  explicit entity type from the control or option metadata; it never infers a
  type from mutable entity data or lifecycle status.
- `generated-screen-source.js`: Applies exact compiled Lineage bindings to
  generated source filters and Home visibility. It never guesses arbitrary id
  keys or imports static CNC containment in active-process mode.
- `instance-hierarchy.js`: Consumes canonical entity identity and effective
  compiled Lineage projections for ancestry, root/sibling scope, and trace
  context. Route trace exclusions require the route value to match both the
  compiled lineage key and the entity's actual ancestor id. Shared trace
  exclusions also remove the active organization and exact enclosing entity
  contexts before rendering ancestry.
- `artifact-viewer.js` and `artifact-detail.js`: Pure Artifact presentation
  dispatch for preview/editor mode and detail revision/file state.
- `navigation-breadcrumbs.js` and `billing-presentation.js`: Pure organization
  breadcrumb and deployment-derived billing presentation contracts used by the
  app shell/account surfaces.
- `process-navigation.js`: Pure helpers for filtering process-compiled
  navigation and screen manifests by the active permission grants. Scoped
  screen requirements are matched against scoped grants structurally because
  generated screen visibility is decided before a concrete entity DTO has been
  loaded; entity API access remains the backend enforcement boundary.
- `generated-labels.js`: Pure label resolver for process-generated UI. It maps
  generated screen titles, home section headers, breadcrumbs, and process
  action buttons to i18n/domain entity labels while treating raw process ids,
  role-prefixed labels, generic action words, and status ids as fallback data
  rather than primary visible copy.
- `drawingPreview.js`: Pure drawing preview helpers for `DrawingCanvas`. It normalizes entity geometry previews, baked cassette `data.layerData` / `data.polygonParts` (including migration fallback under `data.geometry.data`), polygon-only remnant geometry, and cassette render results into the shared `{ viewBox, layers }` drawing contract, extracts designer edge overlays, and resolves layer pens by explicit source mapping, caller-provided `standardCode`, layer-name standard fallback, source layer styling, then default pen. If a matched layer standard points to a pen that is not loaded or no longer exists, normalization preserves the source layer `color` and `weight` before falling back to the default pen. It must not hardcode production layer standard codes; source/caller data owns layer semantics.
  Pen lookup accepts both `_id` and canonical `identity.uid`, matching the
  layer-standard persistence contract.
- `occs/`: Canonical OCCS helpers for semantic layer ids, parameter
  extraction, arithmetic expression evaluation, Clipper-backed production
  layout, default dimension annotation entities, DrawingCanvas conversion,
  folded-preview payloads, default fixture templates, and graph-tree template
  evaluation for nesting. These helpers are the source for cassette v2 previews
  and fixture queue parameters.
- `dxfParser.js`: Browser DXF parsing and preview helpers. Layer-to-pen mapping
  consumes layer-standard DTO fields (`data.code`, `data.defaultPenId`,
  `data.orgPenId`) and pen DTO stroke data (`data.stroke`) so the seeded OCCS
  layer catalogue is the source for preview styling. `generateSvgData()`
  normalizes LINE, polyline, circle, and arc entities into SVG path commands for
  the shared `DrawingCanvas` layer renderer.
- `sheetDesigns.js`: Frontend summary helpers for sheet-design DTOs. It derives
  cassette-design placement counts from `data.cassetteDesigns` when present and
  falls back to raw nesting result `items`/`layouts` so existing sheet designs
  can still show cassette-design composition.
- `sheetLayoutEditor.js`: Pure sheet-layout editor adapters. It extracts the
  first physical layout, resolves source polygons and placement transforms,
  snaps sheet coordinates, and converts cassette-design polygon/layer data into
  nesting source items without coupling geometry logic to Vue. Bounds helpers
  rotate source geometry around the nesting origin and clamp the complete shape
  to snap-aligned coordinates inside the material sheet.
- `domain-builder.js`: Browser-side helpers for `/admin/domain-builder`. It clones CNC package definitions into a draft, validates entity/workflow/summary consistency including multi-region workflows, builds automatic Vue Flow node/edge layout data with reciprocal-transition metadata used unless the page has browser-local manual node positions, and generates deterministic `@cutkit/domain-cnc` source for manual export.
- `workflow-compiler.js`: Shared workbench/domain-builder compiler wrapper for live workflow drafts. It normalizes single-region and multi-region workflow shapes, validates draft machines, exposes state options for typed forms, and derives permission summaries used by fixture scenarios and workbench test access. If a caller has not loaded entity or hook definitions yet, it falls back to committed CNC contracts so workflow validation does not report every known workflow/hook as unknown.
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
  origin from evaluated flat loops, applies the renderer-selected workpiece
  joint transforms from folded source/target face snap points and face-relative
  offsets, and returns 3D face points plus attachment diagnostics for thumbnail
  rendering. Additional joints are kept as constraints and reported as `ok`,
  `unresolved`, or `impossible` after placement.
- `cassetteV2Trapezoid.js`: Pure OCCS trapezoid geometry helper. It resolves
  canonical trapezoid points from base length, zero-default offsets, and height.
  Positive start/end offsets extend points outward from the edge and negative
  offsets move them inward, so designer `+`/`-` controls match the visible
  growth direction. It
  then places child faces on the selected parent edge's exterior side with child
  `E0` reversed against the shared parent edge so both polygons remain CCW. It
  returns closed face curves for the v2 renderer.
- `cassetteV2Renderer.js`: Cassette Designer v2 graph adapter. It owns the local
  recursive `face.trapezoid` graph-tree model with a top-level OCCS-style
  parameter scope, separate workpiece roots, and explicit workpiece joints. New
  graph trees start from one root face; child creation defaults to
  `return_flange` from non-return parents and `mounting_flange` with a `-90`
  fold from return-flange parents. The adapter
  builds live preview curves through `cassetteV2Trapezoid.js`, delegates
  production layer drawing and folded-preview payload construction to
  `occs/`, emits OCCS v0.4-draft
  workpiece definitions, occurrences, joints, per-workpiece faces, and
  per-workpiece folds plus default `dimension.cassette` entities,
  derives locked click targets, selected-face action metadata, point offset
  edit controls, dimension label edit metadata, folded-geometry section mark
  layers, and plain-number fold-angle edit handles from tree folds. It
  adapts editor-only graph state into canonical OCCS helper inputs.
  `OCCS_CASSETTE_FACE_ROLES` mirrors the recommended face role ids from the
  OCCS cassette spec; roles remain descriptive metadata and do not drive
  geometry.
  It also exposes workpiece topology helpers for workpiece graph nodes/edges,
  source/target face-snap relation editing, explicit attachment creation,
  attachment deletion without deleting either workpiece, incident-edge
  workpiece deletion, selected-workpiece flat preview, all-workpiece flat
  layout, and attachment-based assembly placement. Assembly editor previews
  can request selected-workpiece context styling; in that mode per-workpiece
  paths replace the production union so attached/background workpieces render
  with transparent pens and source/target attachment snap markers.
  It keeps Nodi graph composition helpers for export/debug checks, but live
  trapezoid preview does not initialize Nodi. Face socket values may be
  OCCS arithmetic expressions using identifiers, `+ - * /`, parentheses, unary
  minus, and degree-based `sin()`, `cos()`, and `tan()`; child face scopes add
  `foldAngle` from the incoming parent fold. Helper code preserves expressions
  in OCCS and resolves numeric preview values from the current parameter scope.
  For modified faces created by declarative hardware cutouts (integral-cut),
  preview geometry is boolean-subtracted for drawing output, while dimension
  labels and edit controls are calculated from preserved original face boundaries,
  and edge interaction metadata (`designerEdges`) keeps plus-button and hover
  anchors on the original outer edge set so add-geometry actions stay stable.

## Utility Protocol

Keep utilities pure: they should not call `$fetch`, mutate Pinia stores, or own
component state. Cross-entity generated data belongs in `test-data/scenarios.js`;
stateful workbench flows belong in stores/composables; backend writes belong in
server feature services and repositories.

The design-system contract is the source of truth for UI lab coverage. Add new
entity cards, field groups, and surface contracts there first, then wire the
component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
