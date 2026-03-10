# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- **PrimeVue:** All components MUST use PrimeVue for UI elements (buttons, inputs, tables, dialogs).
- **Zero Styling Policy:** Components MUST avoid manual styling (colors, text sizes, backgrounds, etc.). Rely on PrimeVue theme presets. No custom CSS except for layout purposes.
- **Layout:** Use Tailwind CSS utility classes for layout (flex, grid, spacing, alignment).
- **Standard Components:** Create reusable components for common UI patterns (cards, modals, forms, tables) and use them consistently across the app. See [components/shared/NEOLIT.md](./shared/NEOLIT.md) for the full list.
- **Use Variants:** Components should support different visual variants (`inline`, `compact`, `card`) to ensure flexibility in different contexts.
- **Child Components:** When a component needs to display child entities, it must use the child entity's dedicated card component (e.g. NestingRunCard uses ArtifactCard for its artifacts).
- **Smart Components:** Sub-components should use permissions to conditionally render actions (edit, delete, view) based on user roles.

## v24 Standardized Patterns

All entity-related components MUST use these patterns:

| Concern | Pattern |
|---|---|
| Identity display (name, slug, serial) | `<IdentityBlock :entity="..." variant="..." />` |
| Status display + transitions | `<EntityStatus :entity="..." entity-type="..." />` |
| Read-only status display | `<StatusBadge :entity="..." />` |
| Structured key/value data (specs, parameters, tool dims) | `<DataBlock :entity="..." :fields="ENTITY_FIELDS" />` |
| Lineage breadcrumb | `<TraceChain :entity="..." />` |
| Audit log | `<StatusHistory :entity="..." entity-type="..." />` |
| CRUD + status operations | `useEntity(type, id)` |
| Card container | `<StandardCard>` (NOT raw PrimeVue `Card`) |
| Dialog container | `<StandardDialog>` |

## Composables Rule

`useBlocks.js` composables (`useIdentity`, `useStatus`, `useSpecs`, `useLineage`) are **only** used inside the shared block components (`IdentityBlock`, `EntityStatus`, `SpecsBlock`). Entity cards and pages must never import from `useBlocks.js` — they compose the block components instead.

Exception: `useStatus` may be used in an entity card **only** for reading `state` in a `v-if` conditional (not for display).

## Data Access

- Access entity-specific fields (e.g. `pen.stroke.color`, `tool.diameter`) directly in the template — only standardized block fields (identity, status, specs) go through block components.
- Never hardcode values or make assumptions about data structure — check `server/DATA_MODEL.md` first.
- For standard CRUD and status operations, use `useEntity` — no direct `$fetch` calls.
- For entity-specific data fields (tool dimensions, pen stroke, warehouse address), use `<DataBlock :entity="..." :fields="[...]" />` with the field array defined inline in the component's `<script setup>`.

## Sizing

PrimeVue Button, Tag, Badge do not inherit font-size from containers. Always add `size="small"` to these elements inside compact and inline variant contexts.

## Related
- [components/shared/NEOLIT.md](./shared/NEOLIT.md) — shared block components, layout containers
- [composables/NEOLIT.md](../composables/NEOLIT.md) — useEntity, useBlocks
- [server/DATA_MODEL.md](../server/DATA_MODEL.md) — entity data shapes
