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

**Exception:** `useStatus` in an entity card is acceptable **only** for reading `state` to drive a `v-if` conditional. Never for display.

---

## Atomic Blocks (`components/shared/blocks/`)

### `IdentityBlock.vue`
Standardized display for entity name, slug, and serial. Always use this — never render `entity.identity?.name` directly in a template.

**Variants:**

| `variant` | Renders as | Use case |
|---|---|---|
| `inline` (default) | `<Chip>` with icon | Pills in lists, tags, lineage |
| `compact` | 2-line: bold name + muted slug | Card titles, list items |
| `default` | 2-line: semibold name + small slug | Full card title area |
| `header` | Large name + slug + serial | Entity detail page headers |

Props: `:entity` (required), `variant`, `icon` (for inline Chip only).

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

### `StatusBadge.vue`
Atomic, read-only status tag with semantic coloring. Use for display-only contexts where no transitions are needed.

---

## Status & History (`components/shared/status/`)

### `EntityStatus.vue`
Interactive status component for display + state machine transitions. Use this wherever a user can trigger status changes.

Props: `:entity`, `entity-type`, `variant` (`inline` | `compact` | `full`), `:actions` (optional override).

**Entities WITHOUT status** (do not add EntityStatus): Catalog, CassetteDesign, Color, LayerStandard, ToolProfile, Organization, PenTemplate.

### `StatusHistory.vue`
Fetches and displays the audit log (`status_events`) for any entity.

Props: `:entity`, `entity-type`.

---

## Navigation & Links (`components/shared/links/`)

- **`TraceLink.vue`**: Atomic, icon-aware link to any system entity. Props: `type`, `id`.
- **`TraceChain.vue`**: Standardized lineage breadcrumb chain. Always use `:entity="entity"` — never pass raw ancestry arrays. Resolves names async via `useEntityStore`; cached per session.

---

## Layout Containers (`components/shared/`)

- **`StandardCard.vue`**: Card container for entity cards. Exposes slots: `#header`, `#title`, `#subtitle`, `#footer`, and default slot (= content area). **Note:** `<template #content>` is silently dropped — always use default slot for content.
- **`StandardDialog.vue`**: Dialog wrapper with standardized footer and responsiveness.
- **`StandardPage.vue`**: Page layout with header and breadcrumbs.
- **`EntityPage.vue`**: Root layout for all entity detail views.
- **`EntityCard.vue`**: Generic inline card rendered by entity type + id. Used in lists when the specific card component is resolved dynamically. Entity-specific cards (ProjectCard, QueueCard, etc.) use `StandardCard` directly, not EntityCard.
