# COMPONENT: Shared UI Components

This directory contains reusable, standardized UI components and blocks that MUST be used across the application to ensure consistency and traceability.

---

## Critical Architectural Rule: Blocks vs. Composables

`useBlocks.js` exposes low-level composables (`useIdentity`, `useStatus`, `useSpecs`, `useLineage`).

**These composables are ONLY for use inside the shared block components listed below.**
Entity cards and page components must NEVER import from `useBlocks.js` directly.

| ✅ Correct — inside IdentityBlock.vue | ❌ Wrong — inside ProjectCard.vue |
|---|---|
| `const { name } = useIdentity(entity)` | `const { name } = useIdentity(project)` |

State-only conditionals in entity cards should use a local `computed` from `entity.status?.state`. Do not import `useStatus` outside shared status/block primitives.

All shared and entity UI components consume the strict DTO contract: root `_id`
plus canonical blocks only. Display identity through `IdentityBlock` or
`entity.identity.*`, status through `entity.status.*`, and feature data through
`entity.data.*`; do not read flat compatibility fields such as `entity.name`,
`entity.id`, `entity.type`, or `entity.parameters`.

---

## Atomic Blocks (`components/shared/blocks/`)

### `IdentityBlock.vue`
Standardized identity display block. Always use this — never render `entity.identity.*` directly in templates.

**Variants:**

| `variant` | Renders as | Use case |
|---|---|---|
| `inline` (default) | `<Chip>` with primary identifier | Pills in lists, tags, lineage |
| `compact` | Primary identifier | Card titles, list items |
| `default` | Primary identifier | Full card title area |
| `header` | Primary identifier | Entity detail page headers |

Primary identifier fallback: `name` → `slug` → `uid` → `'Unnamed'`.

Props: `:entity` (required), `variant`, `icon` (inline only), `:fields` (optional extra fields array).
Rendering guard: block renders only when `props.entity` is present.
Supported extra fields: `uid`, `slug`, `serial`, `reference`. By default, no extra fields are rendered.

### `SpecsBlock.vue`
Standardized display for entity dimensional specs (width, length, area, sheetThickness, foilThickness). Always use this for specs — never render `entity.specs?.width` directly.

**Variants:**

| `variant` | Renders as |
|---|---|
| `default` | Labeled grid rows |
| `compact` | Single inline text: `"W × L mm (thickness)"` |

Props: `:entity` (required), `variant`.

**Scope:** Only handles standard specs block fields. Entity-specific fields (tool diameter, pen stroke, pile stock) are accessed directly in the template — no SpecsBlock wrapper needed.

### `DataBlock.vue`
Standardized label/value display for entity-specific data fields (anything not covered by SpecsBlock). Define the field array inline in the component's `<script setup>`.

**Usage:**
```vue
const FIELDS = [
    { path: 'diameter', i18n: 'toolProfile.diameter', suffix: ' mm' },
]
<DataBlock :entity="tool" :fields="FIELDS" />
```

Props: `:entity` (required), `:fields` (required — inline array of field descriptors).

**Field schema:** `{ path, i18n, suffix?, prefix? }` — `path` is dot-notation into entity object, `i18n` is the translation key for the label. Rows with null/undefined values are hidden automatically.
Values are formatted through `utils/data-display.js`: scalar arrays render as comma-separated text, arrays of objects render as counts, objects render only when they expose a stable identifier (`name`, `label`, `code`, `serial`, `reference`, `uid`, or `_id`), and non-displayable nested objects are hidden.

### `StatusBadge.vue`
Atomic, read-only status tag with semantic coloring. Use for display-only contexts where no transitions are needed.

---

## Status & History (`components/shared/status/`)

### `EntityStatus.vue`
Interactive status component for display + state-machine transitions. Status-changing action buttons must live here (not in parent layouts).

Props: `:entity`, `entity-type`, `variant` (`inline` | `compact` | `full`), `:actions` (optional custom action set), `:expanded` (optional override).
Rendering guard: component renders only when `props.entity` is present.
Behavior: component auto-expands when custom `actions` are provided; otherwise inline mode uses badge + popover. The popover is compact UI, not a labeled detail page: it renders action controls, current location, notes, and the status timeline without section headings or empty placeholder copy.

**Status policy:** v24 DTOs carry a `status` block, but not every card exposes lifecycle controls. Use the status policy declared in `@cutkit/domain-cnc` and re-exported by `utils/design-system-contract.js` to decide whether a card shows `EntityStatus`, hides it, or renders read-only status.
Interactive status is enabled only for entity types that have a real workflow in
`cncWorkflows`; non-workflow entities hide status chrome in cards unless a
read-only `StatusBadge` is explicitly required. Default transition actions are
derived from workflow definitions through `utils/status-actions.js`; card
components should only pass custom actions for domain-specific commands such as
choosing a completed nesting run.
`EntityStatus` can also receive a `workflows` prop or consume a provided
`statusWorkflows` value. This is used only by development surfaces such as the
admin workbench so live draft machines can drive previews without replacing the
committed `@cutkit/domain-cnc` runtime workflow source.

### `StatusHistory.vue`
Fetches and displays the audit log (`status_events`) for any entity.

Props: `:entity`, `entity-type`, `target-id`, `mock-events`, `compact`.
When the persisted audit log is not available yet, it renders the entity's
current `status`/`origin` as the first timeline event instead of displaying an
empty-history placeholder. Last-update timestamps belong in this timeline, not
as a separate status section.

### `StatusLocation.vue`
Renders the current mutable lifecycle location from `status.lifecycle.data.location`.

Supported location shapes:
- `{ type: 'warehouse', warehouseId, label? }` — renders a warehouse `TraceLink`.
- `{ type: 'coordinates', coordinates: { x, y, z } }` or `{ lat, lng }` — renders a compact coordinate string.
- `{ type: 'address', address }` — renders the address text.

Use status lifecycle location for "where the entity is now"; static ancestry remains in `lineage`, and files remain in `attachments`.

### `DrawingCanvas.vue`
Shared SVG canvas for layer-aware drawing surfaces. It accepts normalized geometry previews, DXF text/URLs, SVG URLs, and parametric cassette graphs; owns layer visibility, viewer pan/zoom, cassette designer edge actions, and layer-to-pen resolution through `utils/drawingPreview.js`.

Layer colors resolve in this order: explicit DXF layer mapping, standard-code fallback from the layer name, then the default pen. Use it for artifact previews, cassette thumbnails, mapping previews, and designer canvases instead of duplicating SVG render logic in feature components.

### `GeometryPreview.vue`
Entity-card wrapper around `DrawingCanvas` for design and remnant geometry. Reads `entity.data.geometry.preview` first and falls back to `entity.data.geometry.data` / `entity.data.geometry.points`.

Use this for DXF-derived layer previews and polygon remnants instead of displaying file ids, queue ids, or static filename fields in entity cards.

---

## Navigation & Links (`components/shared/links/`)

- **`TraceLink.vue`**: Atomic, icon-aware link to any system entity. Props: `type`, `id`.
- **`TraceChain.vue`**: Standardized lineage breadcrumb chain. Always use `:entity="entity"` — never pass raw ancestry arrays. Resolves names async via `useEntityStore`; cached per session.
  Development surfaces can provide `entityContext`; `TraceChain` prefers those
  in-memory entities for labels before calling authenticated APIs, so fixture
  lineage does not create protected API errors.

---

## Layout Containers (`components/shared/`)

- **`ActionToolbar.vue`**: Responsive title/subtitle/actions row for pages, sections, and tab panels. Use instead of ad hoc `flex justify-between` header markup.
- **`ResponsiveGrid.vue`**: Token-backed responsive grid for cards and repeated item surfaces. Variants: `cards` (default), `dense`, `wide`.
- **`StateBlock.vue`**: Standard loading/empty/error state block with icon, message, optional description, and action slot.
- **`TableFrame.vue`**: Standard bordered/elevated frame around PrimeVue `DataTable` surfaces; owns the token-backed DataTable header-cell background override.
- **`StandardDialog.vue`**: Dialog wrapper with standardized footer and responsiveness.
- **`TypedSettingsForm.vue`**: Contract-driven form for simple typed field
  descriptors (`string`, `number`, `boolean`, `enum`, `entityId`,
  `entityType`, `workflowState`, `array`, `object`). Used by admin operation
  parameters and lifecycle hook settings so those surfaces do not fall back to
  raw JSON editors.
- **`EntityRefInput.vue`**: Typed entity reference selector used by
  `TypedSettingsForm` for `entityId` fields. It prefers workbench/scenario
  entity options and falls back to a manual id input only when no typed options
  are available.
- **`StandardPage.vue`**: Page layout with header and breadcrumbs.
- **`EntityPage.vue`**: Root layout for all entity detail views. Features a flexible header with trace, identity, status, an `actions` slot, an `info` slot for summary data, optional `sidebar`, and `statusActions` for custom lifecycle commands.
- **`EntityCard.vue`**: Shared entity card chrome built directly on PrimeVue `Card` slots (`header` / `title` / `subtitle` / `content` / `footer`). Supports `showStatus` / `showTrace` toggles for entities that intentionally omit status or lineage chrome, and `statusActions` for passing entity-specific state-machine actions into the shared status block without rebuilding the title row. Entity cards should use `before-identity` and `subtitle` instead of overriding the `title` slot.

`EntityStatus` action objects support `display: 'inline' | 'menu' | 'hidden'`. Workflow transitions default to inline actions, self-loop metadata transitions are hidden, and lower-priority/destructive actions should use menu placement. Inline/card status surfaces default to the current badge plus an ellipsis popover so card titles do not show multiple badge-like controls; expanded/full status surfaces show up to two inline actions by default and put overflow actions, current location, metadata, and compact status history in the popover. Entity card title/status rows and status menus are allowed to wrap, with the badge kept `min-w-fit`, so compact containers do not squeeze badges into broken multi-line fragments.

`EntityCard` owns inline and compact expansion. Inline and compact variants open
the shared entity popover on click/keyboard activation. Entity-specific card
components should render one `EntityCard :variant="variant"` and pass their
canonical body once through the default slot. `EntityCard` reuses that same
body for full card content and for inline/compact expansion; do not duplicate
card-only bodies into per-variant `expanded` slots.
The entity popover shows status as the normal inline status control only;
expanded/full status history and actions remain owned by clicking the status
control itself.

Direct `primevue/card` and `primevue/dialog` imports belong only in these shared wrappers. Used pages and feature components consume `EntityCard`, entity-specific card components, `StandardDialog`, `ActionToolbar`, `ResponsiveGrid`, `StateBlock`, `TableFrame`, and `Panel` for non-entity sections.

Shared wrappers also own token-backed visual chrome. When a wrapper needs a new width, radius, spacing, or motion value, add it to `assets/tokens/index.js` and project it through Tailwind or CSS variables instead of hardcoding it in feature components.

## Demo Contract

The design-system demo is contract-driven:
- `@cutkit/domain-cnc` contains entity UI policy and expected card prop names; `utils/design-system-contract.js` re-exports it for compatibility.
- `utils/design-system.js` binds the contract to actual Vue components and DTO factories.
- `test-data/factories.js` provides DTO-shaped examples with v24 blocks preserved.

Shared primitives should be demoed through this manifest so component coverage and contract drift are visible in `/test/ui-lab`.
