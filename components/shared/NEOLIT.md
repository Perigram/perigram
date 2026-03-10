# COMPONENT: Shared UI Components

This directory contains reusable, standardized UI components and blocks that MUST be used across the application to ensure consistency and traceability.

## Atomic Blocks (`components/shared/blocks/`)
- **IdentityBlock.vue**: Standardized display for entity name, slug, and serial.
- **StatusBadge.vue**: Atomic, read-only status tag with icon and semantic coloring.

## Status & History (`components/shared/status/`)
- **EntityStatus.vue**: Interactive status component. Handles state machine transitions via `useStatusController`.
- **StatusHistory.vue**: Fetches and displays the audit log (`status_events`) for any entity.

## Navigation & Links (`components/shared/links/`)
- **TraceLink.vue**: An atomic, icon-aware link to any system entity.
- **TraceChain.vue**: The standardized breadcrumb/lineage chain. Supports `expandable` mode for deep ancestry.

## Layout Containers (`components/shared/`)
- **StandardCard.vue**: Wrapper around PrimeVue Card/Panel with consistent padding and header slots.
- **StandardDialog.vue**: Wrapper around PrimeVue Dialog with standardized footer buttons and responsiveness.
- **StandardPage.vue**: Layout wrapper for page content with header and breadcrumbs.
- **EntityPage.vue**: The root layout for all entity detail views (Project, Queue, etc.).
- **EntityCard.vue**: Shared card chrome for entity list cards. Composes `TraceChain` + `IdentityBlock` + `EntityStatus` in a consistent layout. Entity-specific cards use this as their outer container and provide entity-specific body/footer content via slots (`before-identity`, `compact-content`, `inline-extra`, `footer`). Props: `entity`, `entityType`, `variant` (`card` | `compact` | `inline`).

## `TraceChain` Name Resolution
`TraceChain` reads name fields stored in the lineage block (`organizationName`, `projectName`, `queueName`, `warehouseName`). These are populated server-side by `inheritLineage()` at entity creation time. For entities created before this convention, the lineage ID (uid/slug) is shown as a readable fallback.

## Usage
Import these components from their respective sub-directories in `~/components/shared/`. These components strictly follow the **v24 Absolute Final** architecture.
