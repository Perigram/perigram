# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- **PrimeVue:** All components MUST use PrimeVue for UI elements (buttons, inputs, tables, dialogs).
- **Zero Styling Policy:** Components MUST avoid manual styling (colors, text sizes, backgrounds, etc.). Rely on PrimeVue theme presets. No custom CSS except for layout purposes.
- **Layout:** Use Tailwind CSS utility classes for layout (flex, grid, spacing, alignment).
- **Standard Components:** Create reusable components for common UI patterns (cards, modals, forms, tables) and use them consistently across the app, add variants where needed. See [components/shared/NEOLIT.md](./shared/NEOLIT.md) for the list of available standard components (`StandardCard`, `StandardDialog`, `StandardPage`).
- **Use Variants:** Components should support different visual variants (e.g., `inline`, `compact`, `card`) to ensure flexibility in different contexts.
- **Child Components:** Entities (see ../server/DATA_MODEL.md) which components need to display child entities (for example, NestingRunCard needs to display it's artifacts gathered by parent id) must use their components (ArtifactCard).
- **Smart Components:** Sub-components should use permissions to conditionally render actions (edit, delete, view) based on user roles.
- **Use Standardized Patterns**: All entity-related logic MUST use the v24 Absolute Final patterns:
  - **Interactions**: Use `useEntity` for all standard CRUD and status operations.
  - **Status**: Use `EntityStatus` (interactive) or `StatusBadge` (read-only).
  - **Traceability**: Use `TraceChain` for all lineage and ancestry visualization.
  - **History**: Use `StatusHistory` for entity audit logs.
  - **Data**: Use 'DataBlock' for displaying structured data like specs, parameters, etc. (TODO: create this component if it doesn't exist).
- **Use State Machines**: To manage component states and transitions use `EntityStatus` component, not in-component logic and buttons. Ensure `EntityStatus` supports dynamic buttons based on the entity's state machine.
- **True To API and Data Model**: Components must strictly adhere to the API responses and component's entity data model. Avoid hardcoding values or making assumptions about data structure, check API and data model first.
- **Use Blocks**: Follow the standardized data model blocks (`identity`, `origin`, `status`, `lineage`, `specs`) and their components when designing component props and state.
- **Variants:** Standardized components should support `inline`, `compact`, and `card` variants where appropriate to ensure scalability across different layouts.

## Data Flow
1. User interacts with SVG canvas (click edge).
2. `CassetteModel` updates the tree structure.
3. `CassetteModel` regenerates the Nodi3D graph.
4. `nodi-modular` evaluates the graph and returns geometry.
5. View layer renders SVG paths and interactive elements.

## Related
- [docs/specs/cassette-schema.md](../docs/specs/cassette-schema.md)
- [docs/guides/NODI3D_GRAPH_GUIDE.md](../docs/guides/NODI3D_GRAPH_GUIDE.md)
