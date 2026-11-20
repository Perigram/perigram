# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

Parent: [root README](../README.md).

- `workspace-page-dirty.js`: Dirty registry for workspace page tabs —
  pages register unsaved-edit state under their tab key (`provide`d as
  `workspacePageKey` by the page mount), and the workspace's pane/tab
  close paths confirm through the shared dialog before closing a dirty
  tab.
- `workspace-dock-layout.js`: Dockview layout normalization and pruning —
  rejects layouts the dock cannot restore, drops panels whose surface no
  longer resolves, and collapses emptied groups.
- `home-workspace-state.js`: Versioned home dock state (layout serialization,
  opened surface references, sidebar state) scoped to user and organization;
  reads a version 3 pane tree once and flattens its tabs.
- `designer-workspace-state.js`: Versioned per-editor dock layout scoped to
  the editor id, user, and organization.
- `graphOutputViews.js`: The graph-output representation contract — the
  ordered views a graph output value supports (text, markdown, table,
  image, document, scene-2d, scene-3d, plugin, JSON fallback) and the
  table-column derivation. The graph preview panel and the Page
  graph-result embed both derive their renderers through it. The
  tessellated mesh channel (SPEC §20 client-carried engines) is the
  `perigram.scene-3d` value: `{ representation: 'perigram.scene-3d',
  vertices: [[x, y, z], …], faces: [[i, j, k], …] (triangle indices),
  normals?: [[nx, ny, nz], …] (per-vertex, parallel to vertices) }` —
  plain structured-cloneable data, so it crosses Worker and channel
  mounts unchanged; the scene-2d/scene-3d host projections and plugin
  preview surfaces (the demo engine's mesh channel) are its renderers.
- `instance-hierarchy.js`: The containment walk — ancestor refs carry the
  declaration's canonical type id so breadcrumb labels, glyphs, and popup
  targets resolve through the served type view.
- `home-collections.js`: The workspace collection set — the home screen's
  list regions, excluding single-instance sources and parent-bound child
  sources, with labels through `generatedRegionLabel`. `InstanceTree`
  roots its sections through this derivation.

## Design System Contract

- `design-system-contract.js`: The design-system vocabulary source — entity contracts and surface-chrome tables; binding to Vue components happens in `design-system-cards.js`.
- `design-system-cards.js`: The one card-component binding (`DESIGN_SYSTEM_CARD_COMPONENTS`, keyed by contract key) that `InstanceInlineRef`, `DrawingCanvas`, and the registry resolve cards through.
- `design-system.js`: The registry binding (`DESIGN_SYSTEM_ENTITIES`) composing the card binding with the DTO factories. Used by `/test/ui-lab`.
- `processDesignerPaletteSearch.js`: The shared search predicate for the
  process palette and socket-context palette; it indexes display text,
  stable operation identity, provider/group ids, and declared aliases.
- `processDesignerPaletteSections.js`: The palette section views — a
  section's subgroups beside its root items, and the section filter both
  palette renderers (the dock popover and the context palette) share.
- `processDesignerSocketTone.js`: Pure process-port resolver used by every
  designer node form and source edge. It maps structured port type/role data to a
  semantic signal token so a socket and the wire it produces cannot drift
  into separate color contracts.
- `processDesignerIdentity.js`: Pure identity minting for the process
  designer — opaque kebab-safe registry type ids, and `mintId()` for every
  canvas/definition id created at runtime (nodes, edges, services, sockets,
  stations), collision-proof across same-millisecond drops.
- `processDesignerCommandPorts.js`: Pure projection of a domain command
  contract into the handle-shaped port rows the runCommand inspector panel
  renders; consumes no designer state.
- `processDesignerChannelOutputs.js`: Pure preview-output display: the
  branch/value formatters every output surface shares and the built-in
  outputs channel's `graphOutputEntries` derivation over a whole-graph
  channel payload (SPEC §28); the channel strip lives in
  [components/process-designer](../components/process-designer/README.md).
- `processDesignerCanvasStatus.js`: The canvas status pill derivation
  (`canvasStatusOf`) shared by every editor mount — evaluation lifecycle
  (idle/running/ready/error) plus the evaluated-node count; the pill
  contract lives in
  [components/process-designer](../components/process-designer/README.md).
- `processDesignerDefinitionRecords.js`: Pure factories for the
  definition-plane service and socket records (Roles tab surfaces); the
  process-node record factories stay with the designer node-sync family.
- `processDesignerArrangement.js`: Pure arrangement passes for the
  process canvas — the Tidy command's layered engine
  (nodes/edges/lane bands → positions) and the lane container projection
  (`laneContainerLayout`, `deriveLaneFacts`), both contracted in
  [components/process-designer](../components/process-designer/README.md).
- `processDesignerTypeMigrations.js`: Pure seam of the type-migration
  authoring loop (CTS SPEC §11/§14): a refused declaration post's plan
  payload becomes step rows labeled by the authored vocabulary
  (`declarationVocabulary` maps field ids back to labels through the tree
  and the stored view), confirmed rows become migration steps, and the
  steps write back onto (and clear from) the designer tree's class nodes.
  The consuming flow and dialog live in
  [components/process-designer](../components/process-designer/README.md);
  the step language and the 400 plan payload are the
  [cts-types](../server/features/cts-types/README.md) contract.
- `processDesignerDeclarationEditor.js`: Pure projection and gesture layer
  of the surface declaration authoring (SPEC §1) — the per-type declaration
  subtree over the canvas arrays, the node/edge/record gestures that mint
  what the canvas palette and connect gestures create, the compile-
  diagnostics removal gate, the field reorder, and the lifecycle machine →
  mermaid derivation.
  Spec-pinned: a surface edit serializes through `canvasToDefinition`
  to the document the canvas gestures save. The authoring contract lives in
  [components/type-designer](../components/type-designer/README.md).
- `instance-display-contract.js`: Pure surface-chrome resolver for the
  shared instance primitives. `resolveInstanceDisplayContract` derives
  preview/dataDisplay/relations/actions/status/trace per surface from the
  type record (payload presence, declared state axes), with per-call
  `surfaces`/`overrides` patches winning. Fact rows live in
  `fact-rows.js`; record titles and glyphs come from
  `titleFor`/`iconFor` in [shared/ui-mapping](../shared/ui-mapping/README.md).
- `fact-rows.js`: The one fact-row derivation for read-only record
  surfaces (peeks, tiles, compact refs, cards, directory profiles):
  `instanceFactRows({ typeId, typeRecord, entity, accessEntity, auth,
  translator, cap, skip })` projects the generated field vocabulary
  (`resolveFieldGroups` — every declared field) with the record's values,
  dropping the identifier (the title owns it), ref fields (relation
  surfaces own them), prose, and structures; every row gates through
  `shared/instance-field-access.js` via the `auth` input, labels resolve
  the generated keys first (`fieldLabelKey`), and values render through
  `decorateDataValue` (quantities through the shared `formatQuantity`,
  instants as locale dates — the translator's `locale` drives formatting,
  boolean labels are localized inputs). Rows carry their `group` for
  sectioned surfaces and their `role` — `factRoleFor` resolves the value
  typography from the field descriptor: `number`, `quantity`, `instant`
  bases and `display: 'code'` are `technical`; every other value is
  `body`.
- `instance-select.js`: The entity-option seam of the entity dropdown
  wrappers ([shared](../components/shared/README.md)) and every instance
  picker: option→entity/type resolution over the record dialects (an
  `identity` block or the flat §3 `fields` object), and
  `instancePickerOptions` — the one instance-option derivation
  (SPEC §22.13): identifier-field label through the one title resolver
  (type-prefixed for multi-type pickers), value, entity, and the per-option
  type id.
- `generated-labels.js`: The app binding of the one type-label chain
  (`typeLabelFor`, [shared/ui-mapping](../shared/ui-mapping/README.md)):
  `generatedEntityLabel` feeds it the design-system `entities.*` key
  table and the registry-resolved type record (guarded for contexts
  without an active Pinia), and the generated screen/region/action
  label resolvers on top translate compiled manifest labels through the
  same chain. `generatedCreateLabel` owns the localized create caption
  (SPEC §4): an authored label wins; the generic `New <Type>` /
  `New <Type> from <Mode>` shape composes from the `uiMapping.createCaption*`
  keys over the localized type label and mode name; `includeMode: false`
  yields the type caption alone for the collection create control.
- `data-display.js`: Shared path resolution and value formatting for fact rows (`decorateDataValue`), plus the byte-size and payload-fact labels (`formatFileSize`, `payloadFactLine`). It formats scalar values, booleans, scalar arrays, object arrays, and named object references while hiding non-displayable nested objects instead of rendering `[object Object]`. Declared `unit`s render as value suffixes through the closed unit-symbol table (`mm`, `m`, `m2`→`m²`, `percent`, `min`, `deg`); `display: 'dimensions'` renders the width × length span of a resolved specs object.
- `instance-chat.js`: The instance-conversation seam. `openInstanceChat`
  opens the shared chat popup for an instance surface (card footers,
  inline refs, directory surfaces) with the support conversation
  contract's thread kind built in — a `user` target opens the direct 1:1
  thread, every other type the composed instance thread.
  `instanceThreadKey`/`directConversationKey` are the pure key
  derivations the pinned-thread mounts read (the record page's comments
  section; the thread core's direct-key grammar homes here).
- `file-refs.js`: The document file-reference descriptor: derives the
  shared `FileChip` facts (name, mime, stored id/bucket, direct URL) from a
  file link's href and carried label; `fileTypeIconClass` is the one
  mime/extension-to-file-type-glyph derivation the chip renders.
- `chat-file-targets.js`: Pure resolver for the chat composer's instance-chat
  upload window: over the served CTS type view it collects a composer
  target's declared `file`-class children whose payload traits and `upload`
  protocol accept a given file (`payloadAccepts` from
  [packages/cts](../packages/cts/README.md)), yielding the candidate set,
  the union `accept` string for the file input, and per-file matches. The
  server re-validates every send — this is only the early check the
  [support feature](../server/features/support/README.md) contract
  describes.
- `call-rooms.js`: Display helpers for active call rooms — the label
  resolved against the loaded conversation summaries and the room-kind
  icon; the room-name grammar and room↔conversation mapping live in
  [shared/call-rooms.js](../shared/README.md).
- `generated-screen-source.js`: The pure generated-screen source
  contracts: `entityMatchesFilters` (wire-DTO filter matching; bare
  lineage keys read the `lineage` block, status windows read `state`),
  `resolveSourceFilters`/`resolveSourceIdentifier` (`$screen.`-reference
  resolution over a compiled screen's scope), plus the home-tree helpers
  (`filterRootSourceItems`, `typeParentOf`, `shouldRenderHomeSection`)
  consumed by `useGeneratedScreen`, `useMobileHomeTabs`, and the generator
  host
  ([components/generated](../components/generated/README.md)).
- `action-visibility.js`: The one home for action-kind questions over the
  projected manifest vocabulary (`createInstance`/`updateInstance`/
  `deleteInstance`/`link`/`unlink`/`runCommand`): kind predicates,
  entity-state applicability, compiled-create grouping by target type
  (`createActionsByType`), and surface-action resolution. Pure (no Vue,
  no stores) — components, utils, and stores consume it alike, and all
  action-kind questions route through this module.
- `instance-run-results.js`: The one extractor for the created entity a
  process-action run carries (chained constructs filtered to the action's
  own target type). Consumed by the instances store — a create run lands
  its created entity in the pool ([stores](../stores/README.md)) — and by
  the created-open contract
  ([components/generated](../components/generated/README.md)).
- `instance-shape.js`: The wire-DTO → generator-instance projection the
  instances store maps every entity collection through
  ([shared/ui-mapping](../shared/ui-mapping/README.md) consumes the
  result): `dtoToScreenInstance` carries `fields` (quantity-wrapped,
  record trees nested), normalized `lineage` refs, `relations`, the flat
  `state` string, `payload`, and `provenance` verbatim — `provenance`
  feeds the record header's replace gate and the construct re-run row
  ([components/generated](../components/generated/README.md)); a DTO
  without one projects `null`. `previewSourceValue` reads the type's
  declared preview path (plus fallbacks) off the wire.
- `dxfParser.js`: the DXF preview parser — LINE, LWPOLYLINE/POLYLINE (bulge
  arcs included), CIRCLE, ARC, SPLINE, ELLIPSE, TEXT/MTEXT, and INSERT block
  references (nested, placed, layer 0 inheriting the insert's layer) flatten
  into the drawing layer contract, each layer styled from the file's own
  LAYER table (truecolor, linetype, lineweight, on/off — off layers stay
  out); a supplied org pen mapping wins where it names the layer.

## Utility Protocol

Keep utilities pure: they should not call `$fetch`, mutate Pinia stores, or own
component state. Cross-entity generated data belongs in the
[test-data workbench context](../test-data/README.md);
stateful workbench flows belong in stores/composables; backend writes belong in
server feature services and repositories.

The design-system contract is the source of truth for UI lab coverage. Add new
entity cards, field groups, and surface contracts there first, then wire the
component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
