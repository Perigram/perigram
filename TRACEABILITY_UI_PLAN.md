# 🏗️ Atomic Traceability UI System Plan

## 1. Core Architectural Principles
*   **Separation of Concerns:** Components are "dumb" views. Logic (hierarchy resolving, status transitions, formatting) lives in dedicated `composables/` and `utils/`.
*   **Atomic Design:** Entities are broken into standardized variants: `Badge`, `Chip`, `ListItem`, `Card`, and `DetailView`.
*   **Traceability First:** Every entity component knows its "Ancestors" and "Descendants" via a centralized `ReferenceTree` logic.
*   **Polymorphic Status:** A single state-machine-driven utility handles colors, icons, and history logs for all 13 entities.

## 2. Shared Core Components (`components/shared/`)
### A. Status & History System
*   **`StatusBadge.vue`**: Centralized mapping of status strings to PrimeVue severities/icons.
*   **`HistoryTimeline.vue`**: Consumes the standardized `statusHistory` array. Shows user avatars, timestamps, and notes.

### B. Traceability & Reference Chains
*   **`TraceLink.vue`**: An atomic link to any entity. Props: `(type, id, label)`. Renders specific icon + navigation logic.
*   **`TraceChain.vue`**: The "Breadcrumb on Steroids". Visualizes the tree logic.
    *   *Example (Production Chain):* `Project > Queue > Sheet Design > Cassette Design > Instance`
    *   *Example (Material Chain):* `Requisition > Batch > Pile > Sheet > Remnant`

## 3. The Entity Registry (Standardized Modules)
Each entity below will be implemented as a module in `components/entities/[EntityName]/` with three standard files:
1. `[Entity]Summary.vue` (Small chip/badge for use inside other tables).
2. `[Entity]Card.vue` (Medium-sized overview for grids).
3. `[Entity]Detail.vue` (Full information display with history and refs).

### List of All 13 Entities & Their Ref Chains:

| Entity | Primary Chain (Ancestry Tree) | Key Attributes |
| :--- | :--- | :--- |
| **1. Project** | *Root* | Deadline, Contractor, Queues |
| **2. Queue** | Project | Status (Draft/Cut), Runs |
| **3. Sheet Design** | Queue | Geometry (DXF), Nesting Layout |
| **4. Cassette Design**| Sheet Design | Template Ref + Dimensions |
| **5. Cassette Instance**| Cassette Design + Sheet | Physical Status (Nested -> Installed) |
| **6. Warehouse** | Organization | Stock Levels, Location |
| **7. Catalog** | Manufacturer | Sheet Types, Material Specs |
| **8. Requisition** | Catalog + Project | Order Composition, Linked Batches |
| **9. Batch** | Requisition | Receipt ID, Supplier, Status |
| **10. Batch Pile** | Batch | Party ID, Material Characteristics |
| **11. Sheet** | Batch Pile | Movement History, Status (In Stock -> Milled) |
| **12. Remnant** | Sheet | Geometry, QR Code, Reusability |
| **13. Cassette Template**| *Definition* | Parametric JSON, DXF Layers |

## 4. Implementation Roadmap

### Phase 1: Logic & Utils (The "Engine")
*   **`utils/status-engine.js`**: A centralized object containing every possible status, its translation key, color, and icon.
*   **`composables/useTraceability.js`**: Logic to fetch "Related Entities". Given an entity, it automatically resolves the breadcrumb chain.

### Phase 2: Atomic UI Primitives
*   Build `StatusBadge`, `HistoryTimeline`, and the base `EntityIcon` set.
*   Build `TraceLink` with dynamic routing.

### Phase 3: The Materials Chain Rollout
*   Implement `Catalog`, `Requisition`, `Batch`, and `Pile`.
*   Unify usage in the `Materials Hub`.

### Phase 4: The Production Chain Rollout
*   Implement `Sheet Design`, `Cassette Design`, and `Cassette Instance`.
*   Update `QueueEditor` to use the standardized `TraceChain`.

### Phase 5: Inventory & Analytics
*   Implement `Warehouse`, `Sheet`, and `Remnant`.
*   Create the "Ancestry Dashboard".
