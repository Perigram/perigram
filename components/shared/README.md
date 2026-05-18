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
Behavior: component auto-expands when custom `actions` are provided; otherwise inline mode uses badge + popover.

**Status policy:** v24 DTOs carry a `status` block, but not every card exposes lifecycle controls. Use the `status` policy in `utils/design-system-contract.js` to decide whether a card shows `EntityStatus`, hides it, or renders read-only status.
Default transition actions are derived from workflow definitions through `utils/status-actions.js`; card components should only pass custom actions for domain-specific commands such as choosing a completed nesting run.

### `StatusHistory.vue`
Fetches and displays the audit log (`status_events`) for any entity.

Props: `:entity`, `entity-type`.

---

## Navigation & Links (`components/shared/links/`)

- **`TraceLink.vue`**: Atomic, icon-aware link to any system entity. Props: `type`, `id`.
- **`TraceChain.vue`**: Standardized lineage breadcrumb chain. Always use `:entity="entity"` — never pass raw ancestry arrays. Resolves names async via `useEntityStore`; cached per session.

---

## Layout Containers (`components/shared/`)

- **`ActionToolbar.vue`**: Responsive title/subtitle/actions row for pages, sections, and tab panels. Use instead of ad hoc `flex justify-between` header markup.
- **`ResponsiveGrid.vue`**: Token-backed responsive grid for cards and repeated item surfaces. Variants: `cards` (default), `dense`, `wide`.
- **`StateBlock.vue`**: Standard loading/empty/error state block with icon, message, optional description, and action slot.
- **`TableFrame.vue`**: Standard bordered/elevated frame around PrimeVue `DataTable` surfaces.
- **`StandardDialog.vue`**: Dialog wrapper with standardized footer and responsiveness.
- **`StandardPage.vue`**: Page layout with header and breadcrumbs.
- **`EntityPage.vue`**: Root layout for all entity detail views. Features a flexible header with trace, identity, status, an `actions` slot, an `info` slot for summary data, optional `sidebar`, and `statusActions` for custom lifecycle commands.
- **`EntityCard.vue`**: Shared entity card chrome built directly on PrimeVue `Card` slots (`header` / `title` / `subtitle` / `content` / `footer`). Supports `showStatus` / `showTrace` toggles for entities that intentionally omit status or lineage chrome, and `statusActions` for passing entity-specific state-machine actions into the shared status block without rebuilding the title row. Entity cards should use `before-identity` and `subtitle` instead of overriding the `title` slot.

Direct `primevue/card` and `primevue/dialog` imports belong only in these shared wrappers. Used pages and feature components consume `EntityCard`, entity-specific card components, `StandardDialog`, `ActionToolbar`, `ResponsiveGrid`, `StateBlock`, `TableFrame`, and `Panel` for non-entity sections.

Shared wrappers also own token-backed visual chrome. When a wrapper needs a new width, radius, spacing, or motion value, add it to `assets/tokens/index.js` and project it through Tailwind or CSS variables instead of hardcoding it in feature components.

## Demo Contract

The design-system demo is contract-driven:
- `utils/design-system-contract.js` contains entity UI policy and expected card prop names.
- `utils/design-system.js` binds the contract to actual Vue components and DTO factories.
- `test-data/factories.js` provides DTO-shaped examples with v24 blocks preserved.

Shared primitives should be demoed through this manifest so component coverage and contract drift are visible in `/test/ui-lab`.
