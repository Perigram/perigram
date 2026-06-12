# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- **PrimeVue:** All components MUST use PrimeVue for UI elements (buttons, inputs, tables, dialogs).
- **Zero Styling Policy:** Components MUST avoid manual styling (colors, text sizes, backgrounds, etc.). Rely on PrimeVue theme presets and `assets/tokens/` projections. No custom CSS except for layout purposes.
- **Layout:** Use Tailwind CSS utility classes for layout (flex, grid, spacing, alignment).
- **Standard Components:** Create reusable components for common UI patterns (cards, modals, forms, tables) and use them consistently across the app. See [components/shared/README.md](./shared/README.md) for the full list.
- **Use Variants:** Components should support different visual variants (`inline`, `compact`, `card`) to ensure flexibility in different contexts.
- **Localization:** User-facing static template copy and visible component
  props must use i18n keys. `shared/localization.spec.js` parses active Vue
  templates and fails on hardcoded labels/placeholders/messages, while allowing
  real data units and code/file literals.
- **Child Components:** When a component needs to display full child entities,
  use the child entity's dedicated card component. When it only needs compact
  relation context inside another card/detail row, use `EntityInlineRef`
  instead of nesting full card popovers.
- **Smart Components:** Sub-components should use explicit permission grants to conditionally render actions (edit, delete, view).
- **Permission Editing:** `PermissionEditor.vue` edits the same grant shape used
  by `shared/access-control.js`: flat levels, action overrides, and advanced
  JSON for scoped grants / transition grants / grant arrays. Do not replace it
  with a flat role-only selector.

## v24 Standardized Patterns

All entity-related components MUST use these patterns:

| Concern | Pattern |
|---|---|
| Identity display (default: name/slug) | `<IdentityBlock :entity="..." variant="..." />` |
| Status display + transitions/actions | `<EntityStatus :entity="..." entity-type="..." :actions="..." />` |
| Read-only status display | `<StatusBadge :entity="..." />` |
| Current lifecycle location | `status.lifecycle.data.location` rendered by `<EntityStatus>` |
| Drawing and geometry preview | `<DrawingCanvas ... />` for layer-aware DXF/SVG/cassette canvas work; `<GeometryPreview :entity="..." />` as the entity-card wrapper |
| Structured key/value data (specs, parameters, tool dims) | `<DataBlock entity-type="..." :entity="..." :fields="ENTITY_FIELDS" />` |
| Lineage breadcrumb | `<TraceChain :entity="..." />` |
| Audit log | `<StatusHistory :entity="..." entity-type="..." />` |
| Detail page header | `<EntityPage :entity="..." entity-type="..." />` |
| CRUD + status operations | `useEntity(type, id)` |
| Card/container chrome | Entity cards: `<EntityCard>`; non-entity sections: PrimeVue `<Panel>` or semantic layout |
| Section/page action rows | `<ActionToolbar>` |
| Repeated card grids | `<ResponsiveGrid>` |
| Loading/empty/error surfaces | `<StateBlock>` |
| Data table frame | `<TableFrame><DataTable ... /></TableFrame>` |
| Dialog container | `<StandardDialog>` |
| Single-field rename/edit | `<NameEditPopover>` |
| Typed admin settings | `<TypedSettingsForm :fields="..." v-model="..." />` |
| Public marketing animation | `components/marketing/CassetteMarketingAnimation.vue` |

When a card needs custom lifecycle commands, pass them to `EntityCard` through `:status-actions` so the shared title/status layout remains the single owner of status placement. Destructive delete/remove commands belong in these status actions with `display: 'menu'`; edit/configuration commands stay in card footers or page action slots.
Geometry-capable entity cards should render the visual source, not tags that
state a file type or preview flag. Use `GeometryPreview` for entities with
`data.geometry.preview`/points and `CassetteThumbnail` for cassette DTOs because
it resolves DXF, stored geometry previews, OCCS definitions, and legacy
parametric definitions in the correct order.
Parent-level card click handlers must ignore nested interactive targets through
`utils/interactive-target.js` so embedded statuses, links, artifacts, geometry
previews, and nested inline cards remain clickable.
Interactive status belongs only to entity types with real `cncWorkflows`
definitions. Cards for DTOs without workflows should set `:show-status="false"`
or use a read-only badge only when the data model requires it; do not invent
component-local lifecycle states.
Entity-specific card components should use `before-identity`, `subtitle`, body, and footer slots; do not override `#title`, because that bypasses standardized identity/status layout. Subtitle slots that render entity facts must be hidden for `variant === 'card'`; the full card body is the only owner of those facts.
Entity-specific cards should render a single `EntityCard :variant="variant"`.
Inline/compact/card branching inside entity cards is a smell unless the entity
has a genuinely different structural surface. The default slot is the canonical
body and is reused by `EntityCard` for both full cards and inline/compact
expansion.
Entity detail components should use `EntityPage` for trace, identity, status, and page actions instead of rebuilding header rows locally.
Single-field rename/edit actions should use `NameEditPopover` near the relevant
identity or action cluster; reserve `StandardDialog` for creation flows,
destructive confirmation, or forms with multiple fields.
## Design System Manifest

`@cutkit/domain-cnc` defines the CNC design-system contract for entity demos:
entity key, component prop name, variants, status policy, trace policy, factory name, and docs links.
`utils/design-system-contract.js` is a compatibility export with validation, and
`utils/design-system.js` attaches Vue components and factories to that contract.

`pages/test/ui-lab.vue` renders from this manifest. When adding or renaming an entity card, update the manifest and its DTO factory instead of hand-editing UI lab sections.

`framework.manifest.json` snapshots this same contract for framework consumers. Entity card `DataBlock` paths are validated against `server/DATA_MODEL.md` fields plus explicit compatibility aliases, so avoid synthetic display-only fields unless they are represented in DTO metadata first.

## Visual Tokens

`assets/tokens/index.js` is the source for app-level visual tokens. Tailwind aliases, PrimeVue component overrides, and global `--ck-*` CSS variables must stay aligned with it.

Current app chrome uses `bg-page`, `bg-chrome`, `bg-subtle`, `rounded-ui`, `rounded-panel`, `shadow-card`, `shadow-card-hover`, and `shadow-overlay`. New shared wrappers should consume these aliases instead of local shadows, arbitrary backgrounds, or one-off radii.

For shell/layout chrome that must update reliably during Nuxt dev HMR, direct CSS-variable utilities such as `bg-[var(--ck-page-background)]` and `[box-shadow:var(--ck-shadow-card)]` are acceptable. This avoids depending on a Tailwind config restart for newly added aliases.

Use token-backed classes such as `max-w-app`, PrimeVue semantic classes, and shared layout primitives (`StandardPage`, `ResponsiveGrid`, `TableFrame`, `StateBlock`) instead of local arbitrary max-widths, colors, radii, or transition durations. Legacy global grid helpers are not used in active components; detail surfaces spell out their responsive grid tracks locally when a shared primitive is not a fit.

## UI Inventory Policy

Component cleanup uses a route/registry inventory instead of deleting files by
name. Files can be:

- **route-active** when reached from `pages/**` or `layouts/**`;
- **registry-active** when referenced by the design-system manifest,
  `utils/design-system.js`, `EntityInlineRef`, or framework inspection scripts;
- **dormant** when not currently routed but still architecturally meaningful.

Dormant components are inspected and may be refactored, but are not removed by
automated cleanup. Legacy components such as old dashboard/footer widgets must
be removed only by an explicit human cleanup decision.

The current component-by-component cleanup audit lives in
[docs/UI_COMPONENT_AUDIT.md](../docs/UI_COMPONENT_AUDIT.md). It applies the
same ten questions to entity components, shared primitives, hubs, pages, and
layouts: business job, frontend context, DTO ownership, status policy,
relationships, actions, nested click behavior, density, responsive constraints,
and the resulting refactor decision.

## Composables Rule

`useBlocks.js` composables (`useIdentity`, `useStatus`, `useSpecs`, `useLineage`) are **only** used inside the shared block components (`IdentityBlock`, `EntityStatus`, `SpecsBlock`). Entity cards and pages must never import from `useBlocks.js` — they compose the block components instead.

No exceptions are currently needed in used entity pages/cards; state-only conditionals should use a local `computed` from `entity.status?.state`.

## Data Access

- Prefer canonical DTO blocks for entity data: `identity.*`, `status.*`, `lineage.*`, `attachments.*`, `data.*`, `summary.*`. Hoisted aliases may be used only as defensive fallbacks when a current API response still emits them.
- Entity cards should present an operational summary, not decorative placeholders: identity/status in the title, concise specs/data in the body, and actions in the footer.
- Pages and workbench/demo surfaces must not add behavior wrappers around
  entity components to simulate missing component behavior. If inline/compact
  variants need expansion, relation detection, commands, or other interaction,
  implement that contract in the entity component or a shared entity primitive
  and let pages render the component normally.
- Entity cards may consume an injected `entityContext` in development surfaces
  to render related entities from the same generated graph. Prefer explicit
  props in production pages; use context only as a fallback for workbench/demo
  relationship detection.
- Mutable current location belongs in `status.lifecycle.data.location`, not in a static display-only card field. Supported UI location types are `warehouse`, `coordinates`, and `address`; warehouse locations render as entity links.
- `cassette`, `cassetteTemplate`, `cassetteDesign`, and `cassetteInstance`
  are separate UI surfaces and must not be collapsed into one card contract.
- `CassetteInstanceCard` renders the produced cassette geometry from the source
  cassette design and embeds source design/template/queue context through
  compact `EntityInlineRef` rows. Queue-produced instances are already `CUT`;
  lifecycle action design remains a workflow-machine concern, not a local card
  action override.
- `RemnantCard` and `RemnantDetail` render saved leftover material geometry
  through `GeometryPreview`, including polygon-with-holes queue-cut remnants.
  Source sheet, warehouse, and material pile context should be compact
  `EntityInlineRef` rows, not trace-link-only rows or local status badges.
- `material`, `materialPile`, and `batchPile` are separate UI surfaces:
  material cards describe the base material record, material pile cards
  summarize general/manual warehouse stock, and batch pile cards show
  requisition-sourced receipt context from `lineage.requisitionId`.
- Entity relation rows use `EntityInlineRef` with design-system surface keys
  (`materialPile`, `nestingRun`, `cassetteDesign`, etc.). Do not use
  `TraceLink` for relation summaries inside cards/details; reserve it for rows
  whose explicit purpose is route navigation.
- Never hardcode values or make assumptions about data structure — check `server/DATA_MODEL.md` first.
- For cassette templates and queue entries, derive parametric vs static display from the cassette DTO itself, not only from saved queue item flags. Prefer `data.parameters` when present and fall back to OCCS `data.definition.parameters` so updated OCCS templates do not appear static in queues.
- `QueueEditor` keeps a UI-only `_key` for queue rows because persisted
  `queue.data.job.items[]` entries intentionally store only the cassette/design
  id, type, quantity, and parameters. Delete actions must use `_key`; nesting
  payload saves must persist `id` without leaking the UI key.
- `QueueEditor` is a production workspace: desktop layout uses a left queue
  lane rendered as one local scroll body containing the detailed active
  `QueueCard` and non-expanding compact queue selector cards, a center lane for
  nesting settings and wide cassette entry cards, and a right runs lane. Queue
  status/actions live on the active queue card; the center lane starts with
  queue content. The runs lane receives queue-level sheet designs once, selects one active run, and lets
  `NestingRunCard` filter designs by run before rendering preview tiles. Run
  material sources render on `NestingRunCard` through entity references; queue
  cards summarize queue work, not available stock.
- In warehouse material mode, `QueueEditor` loads selected warehouse piles,
  sheets, and remnants, filters unavailable piles, blocks mixed sheet sizes for
  the current one-bin nesting worker, and persists selected stock as
  `queue.data.job.materialPool` with dimensions, available counts, and remnant
  `sheetPolygon`/`geometryData` when present. For remnants, `sheetPolygon`
  preserves both `outer` and `inner` rings so holes remain fixed non-placeable
  zones in the nesting bin. The backend resolves worker sheet size/count and
  irregular remnant sheet polygon from that material pool.
  Starting nesting also sends the normalized selected material pool directly so
  command validation does not reduce warehouse selections to UI ids. If queue
  saving fails, nesting must not start with stale material context. Choosing a
  completed run is the production acceptance action: the backend consumes
  selected pile stock, records `queue.data.materialConsumption`, creates
  physical outputs, transitions the queue to `READY`, and returns the updated
  queue. Solver completion alone leaves the queue in `NESTING` so the operator
  still has to choose the accepted run. Those outputs are cassette instances
  plus remnant geometry; already cut source sheets are not displayed as
  warehouse sheet inventory.
- `CassetteDesignerV2` is the persisted cassette-template designer used by the
  cassette manager and the admin workbench designer section. The legacy
  `CassetteDesigner` remains only for dev/test fixture surfaces that still need
  its local-save graph format.
- `CassetteDesignerV2` is the top-level cassette designer section in the admin
  workbench. Its header edits the cassette template name, loads existing
  workbench cassette templates from parent-provided options, receives
  `persistedTemplateIds` from the parent to distinguish DB templates from
  generated fixture templates, persists saves through `saveCassetteTemplate` by
  default, and emits a save payload with the saved cassette DTO plus the OCCS v2 definition and
  `extensions.cutkit.graphTree` so the workbench can mirror and reload the exact
  graph tree. Template data is applied only when the selected template id
  changes; saving or updating the fixture context must not overwrite the
  in-progress name/graph draft. It starts from one root
  `face.trapezoid`, adds child trapezoids
  immediately when users click unoccupied canvas edges, stores the result as a
  recursive graph tree with a top-level OCCS-style parameter scope (`A`, `B`,
  `R`, ...), and keeps actual OCCS workpieces as graph nodes connected by
  OCCS cassette joints. The designer shell separates document actions,
  geometry editing, global settings, assembly topology, and folded 3D preview:
  the canvas owns only CAD interaction, the top bar owns the active cassette
  name plus compact load/save/reset actions, the side panel owns global
  parameters, layer visibility, and OCCS JSON, and the assembly rail owns the
  compact workpiece DAG/list plus 3D preview. The load selector is an action
  placeholder rather than a second selected-name display, and save/reset are
  icon-only controls. The workpiece `+` action creates a new
  `definitions.workpieces[]` entry,
  matching cassette occurrence, root face, and face-relative joint instead of
  another fold child on the current sheet. The link action declares another
  attachment for the selected workpiece without creating geometry. Non-root
  workpieces can be deleted, which removes only that workpiece, its faces, and
  incident OCCS joints. Relation rows appear under both source and target
  workpieces so multi-parent attachments stay visible; they open the
  canvas-local attachment editor
  for target/source face, target/source snap points, face offsets, rotation,
  side, joint type, method, and driver choice, can remove a joint link without
  deleting either workpiece, and display unresolved/impossible diagnostics from
  the folded preview helper. Attachment placement choice is
  internal renderer state; the user workflow only declares face-to-face
  attachments. The 2D canvas stays in selected-workpiece flat
  editing mode for face operations, while the folded 3D panel is a single
  cassette assembly window in the assembly rail: workpieces render in deterministic varied hues,
  source/target face attachment snaps are applied after sheet folding, clicking
  a workpiece selects it in the designer and isolates it in 3D, and the back
  button returns to the whole cassette view. The designer selects faces from hoverable canvas face
  clicks, resolves
  `face.trapezoid` boundaries through a pure OCCS trapezoid geometry helper
  from cached parent edge vertices, and displays an OCCS v0.4-draft template
  with per-workpiece faces, folds, occurrences, and joints. Face shape
  sockets store arithmetic expression strings such as `A + 10` or
  `B + (R / 2 - 1)`. `CassetteExpressionEditor` keeps those fields text-backed
  while validating them, highlighting recognized tokens inline, offering
  one grouped cassette-parameter/operator/trig chip panel under the active
  expression, a tooltip usage guide, and a child-face `∠ foldAngle` context
  chip. The editor stays single-line with horizontal overflow, and the chip
  panel is positioned as an overlay so active fields do not resize the
  parameter list. Highlight refresh restores cursor selection only for the
  focused editor so sibling parameter fields cannot steal focus during invalid
  draft edits. Selected-face offsets are edited from compact value chips
  centered on evaluated face points, base offset anchors stay in the same
  popup, and generated `dimension.cassette` labels stay on the annotation layer
  while selected/hovered labels get interactive edit chips. The
  renderer preserves those strings in OCCS and resolves numeric values only for
  preview geometry. Free edge handles show a `+` only on hover;
  folded edges show a plain numeric fold angle and open the inline angle editor
  when clicked. The selected face exposes an editor-surface action menu for
  canonical OCCS face role ids and child-face deletion. Deleting a fold is not exposed as a
  separate command because the current same-sheet model cannot keep an orphan
  face; deleting the child face removes that face and its descendants.
  Selecting a workpiece
  or attachment from the assembly rail switches the 2D canvas to assembly context; when no face is
  selected, attached/background workpieces render with transparent pens and
  source/target attachment markers, while only the active/selectable workpieces
  receive face hit targets. In attachment mode, clicking source/target
  workpiece faces updates the corresponding joint faces.
  The assembly rail scrolls topology internally instead of occupying the CAD
  surface.
  Editable section-plane handles on the main drawing generate 1:1 left and top
  section views by intersecting the folded 3D workpiece geometry; section
  graphics are emitted on the toggleable `code.cassette_mark` layer while the
  canvas keeps only invisible drag hit targets. At `xl` and wider breakpoints
  the designer uses side/canvas/assembly columns; at `lg` it keeps canvas plus
  assembly columns with global settings docked below, and below `lg` the canvas,
  assembly, and settings panels stack. Global parameter fields switch to a
  multi-column grid while the settings panel is wide and back to one column in
  the narrow side rail. The 3D panel is hidden below `lg` so the mobile
  assembly row remains usable for workpiece and relation controls.
  Layer visibility is controlled by the
  designer, so hidden layer names persist when the preview regenerates after
  face additions. Invalid expression drafts do not clear or redraw the canvas;
  the designer keeps the last successful preview until the tree evaluates
  again. Designer preview layers are built by canonical `utils/occs/` helpers
  and carry OCCS layer-standard codes for the united workpiece fill, derived
  `cut.outer` workpiece outlines, derived `fold.route` paths, and generated
  `dimension.cassette` annotation entities so `DrawingCanvas` resolves colors
  from layer standards and pen templates. Template dimensions display expression
  labels such as `A`, `B`, and `R`; evaluated/baked designs store measured
  numeric annotation values.
  The assembly rail hosts
  `CassetteFoldedPreview`, which projects the evaluated 2D face loops
  through OCCS fold topology for a compact folded 3D view with drag orbit,
  wheel zoom, and reset controls. The preview panel keeps mounted with an empty
  state while projection data is unavailable and renders the folded
  faces through a Three.js WebGL scene with real depth testing, double-sided
  materials, outline edges, lights, and raycast workpiece selection. The
  preview panel must not stop document-level pointer movement, because
  OrbitControls registers drag continuation on `ownerDocument`. The designer
  root uses a fixed viewport-height work area with
  internal side-panel/canvas overflow instead of growing below the window.
  Edges already represented by either side of a fold are not clickable. It
  automatically emits a `code.cassette_mark` text entity at the bottom-left of
  the main/root face for each sheet workpiece. The mark text resolves from the
  current cassette template name, template id (or `draft` before first save),
  and one-based workpiece number, so preview, saved OCCS, baking, and nesting
  share the same mark intent.
- `CassetteEditorDialog` is the DXF import surface for standard cassette
  templates. It asks only for a cassette name, DXF file, and DXF-layer to OCCS
  layer-standard mapping; it does not edit template parameters. The dialog
  previews the selected DXF through `DrawingCanvas`, requires one source layer
  mapped to `cut.outer`, and emits the created template to normal upload
  listeners while the queue upload workflow consumes the returned initial
  `cassette_design` so the queued card has baked polygon geometry.
- For standard CRUD and status operations, use `useEntity` — no direct `$fetch` calls.
- Direct `$fetch` is reserved for custom workflows that are not represented by `useEntity`: declared domain operations, uploads/downloads, invitations, permissions, support chat, payments, debug endpoints, and project-scoped subresources.
- For entity-specific data fields (tool dimensions, pen stroke, warehouse address), use `<DataBlock entity-type="..." :entity="..." :fields="[...]" />` with the field array defined inline in the component's `<script setup>`. The `entity-type` must match an entry in `@cutkit/domain-cnc` field access policy; otherwise the row is hidden.
- PrimeVue `<Select>` options that use `optionLabel="name"` must receive
  option arrays normalized through `utils/selectOptions.js` when the source data
  is a canonical DTO. Do not pass raw entities that only expose
  `identity.name`; PrimeVue expects the resolved label to be a string.

## Localization

- User-visible labels, headings, dialog headers, toast summaries/details, placeholders, and accessible labels must use `$t(...)` in templates or `t(...)` from `useI18n()` in script.
- Keep `i18n/locales/en.json` and `i18n/locales/ru.json` structurally aligned whenever adding keys.
- Run `npx vitest run shared/localization.spec.js` after adding frontend copy or translation keys; it catches locale key drift and missing static translation keys.
- Brand names such as `CutKit` remain literal and are not localized.

## Sizing

PrimeVue Button, Tag, Badge do not inherit font-size from containers. Always add `size="small"` to these elements inside compact and inline variant contexts.

## Related
- [components/marketing/README.md](./marketing/README.md) — public and admin-preview marketing visuals
- [components/hubs/README.md](./hubs/README.md) — workflow-level pages that compose entity cards and shared primitives
- [components/entities/README.md](./entities/README.md) — manifest-backed entity card contracts
- [components/shared/README.md](./shared/README.md) — shared block components, layout containers
- [composables/README.md](../composables/README.md) — useEntity, useBlocks
- [server/DATA_MODEL.md](../server/DATA_MODEL.md) — entity data shapes
