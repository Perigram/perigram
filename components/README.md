# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- **PrimeVue:** All components MUST use PrimeVue for UI elements (buttons, inputs, tables, dialogs).
- **Zero Styling Policy:** Components MUST avoid manual styling (colors, text sizes, backgrounds, etc.). Rely on PrimeVue theme presets and `assets/tokens/` projections. No custom CSS except for layout purposes.
- **Layout:** Use Tailwind CSS utility classes for layout (flex, grid, spacing, alignment).
- **Standard Components:** Create reusable components for common UI patterns (cards, modals, forms, tables) and use them consistently across the app. See [components/shared/README.md](./shared/README.md) for the full list.
- **Use Variants:** Components should support different visual variants (`inline`, `compact`, `card`) to ensure flexibility in different contexts.
- **Child Components:** When a component needs to display child entities, it must use the child entity's dedicated card component (e.g. NestingRunCard uses SheetDesignCard for resulting sheet designs).
- **Smart Components:** Sub-components should use explicit permission grants to conditionally render actions (edit, delete, view).

## v24 Standardized Patterns

All entity-related components MUST use these patterns:

| Concern | Pattern |
|---|---|
| Identity display (default: name/slug) | `<IdentityBlock :entity="..." variant="..." />` |
| Status display + transitions/actions | `<EntityStatus :entity="..." entity-type="..." :actions="..." />` |
| Read-only status display | `<StatusBadge :entity="..." />` |
| Current lifecycle location | `status.lifecycle.data.location` rendered by `<EntityStatus>` |
| Drawing and geometry preview | `<DrawingCanvas ... />` for layer-aware DXF/SVG/cassette canvas work; `<GeometryPreview :entity="..." />` as the entity-card wrapper |
| Structured key/value data (specs, parameters, tool dims) | `<DataBlock :entity="..." :fields="ENTITY_FIELDS" />` |
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
| Typed admin settings | `<TypedSettingsForm :fields="..." v-model="..." />` |

When a card needs custom lifecycle commands, pass them to `EntityCard` through `:status-actions` so the shared title/status layout remains the single owner of status placement. Destructive delete/remove commands belong in these status actions with `display: 'menu'`; edit/configuration commands stay in card footers or page action slots.
Interactive status belongs only to entity types with real `cncWorkflows`
definitions. Cards for DTOs without workflows should set `:show-status="false"`
or use a read-only badge only when the data model requires it; do not invent
component-local lifecycle states.
Entity-specific card components should use `before-identity`, `subtitle`, body, and footer slots; do not override `#title`, because that bypasses standardized identity/status layout.
Entity-specific cards should render a single `EntityCard :variant="variant"`.
Inline/compact/card branching inside entity cards is a smell unless the entity
has a genuinely different structural surface. The default slot is the canonical
body and is reused by `EntityCard` for both full cards and inline/compact
expansion.
Entity detail components should use `EntityPage` for trace, identity, status, and page actions instead of rebuilding header rows locally.

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

Use token-backed classes such as `max-w-app`, PrimeVue semantic classes, and shared layout helpers (`grid-hub`, `grid-details`) instead of local arbitrary max-widths, colors, radii, or transition durations.

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
- `material`, `materialPile`, and `batchPile` are separate UI surfaces:
  material cards describe the base material record, material pile cards
  summarize general/manual warehouse stock, and batch pile cards show
  requisition-sourced receipt context from `lineage.requisitionId`.
- Never hardcode values or make assumptions about data structure — check `server/DATA_MODEL.md` first.
- For cassette templates and queue entries, derive parametric vs static display from the cassette DTO itself (`parameters` presence and template data), not only from saved queue item flags.
- `CassetteDesigner` persists through the cassette-template command by default.
  Development surfaces such as the admin workbench can pass `:persist="false"`
  to receive the typed save payload locally and upsert it into an in-memory
  fixture context instead of calling the API.
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
  `R`, ...), and keeps actual OCCS workpieces as separate graph roots. The
  canvas overlay renders workpieces as a compact indented topology list;
  each row `+` action creates a new `definitions.workpieces[]` entry,
  matching cassette occurrence, root face, and face-relative joint instead of
  another fold child on the current sheet. Non-root rows can be deleted, which
  removes that workpiece subtree, its faces, and related OCCS joints. The
  topology side-panel tab edits that attachment's target workpiece, target
  face, source face, target/source snap points, face offsets, rotation, side,
  joint type, and method. The 2D canvas stays in selected-workpiece flat
  editing mode for face operations, while the top-right 3D overlay is a single
  cassette assembly window: workpieces render in deterministic varied hues,
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
  draft edits. Offset fields display point/side labels derived from active
  anchors while preserving the stored OCCS socket keys. The renderer preserves
  those strings in OCCS and resolves numeric values only for preview geometry.
  Free edge handles show a `+` only on hover; folded edges show their fold angle
  and select the child face for angle editing on click. Its side panel
  stays beside the canvas and is the only v2 control surface for parameters,
  layer visibility, and OCCS JSON. Layer visibility is controlled by the
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
  The canvas also hosts a top-right
  `CassetteFoldedPreview` thumbnail that projects the evaluated 2D face loops
  through OCCS fold topology for a compact folded 3D view with drag orbit,
  wheel zoom, and reset controls. The thumbnail sits above the 2D canvas hit
  overlays, keeps its panel mounted with an empty state while projection data
  is unavailable, stops pointer events inside its panel, and renders the folded
  faces through a Three.js WebGL scene with real depth testing, double-sided
  materials, outline edges, lights, and raycast workpiece selection. The
  preview panel must not stop document-level pointer movement, because
  OrbitControls registers drag continuation on `ownerDocument`. The designer
  root uses a fixed viewport-height work area with
  internal side-panel/canvas overflow instead of growing below the window.
  Edges already represented by either side of a fold are not clickable. It does
  not replace the persisted cassette-template designer.
- For standard CRUD and status operations, use `useEntity` — no direct `$fetch` calls.
- Direct `$fetch` is reserved for custom workflows that are not represented by `useEntity`: declared domain operations, uploads/downloads, invitations, permissions, support chat, payments, debug endpoints, and project-scoped subresources.
- For entity-specific data fields (tool dimensions, pen stroke, warehouse address), use `<DataBlock :entity="..." :fields="[...]" />` with the field array defined inline in the component's `<script setup>`.
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
- [components/entities/README.md](./entities/README.md) — manifest-backed entity card contracts
- [components/shared/README.md](./shared/README.md) — shared block components, layout containers
- [composables/README.md](../composables/README.md) — useEntity, useBlocks
- [server/DATA_MODEL.md](../server/DATA_MODEL.md) — entity data shapes
