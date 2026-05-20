# README.md (CONTAINER Level) - v24 Absolute Final

This document describes the established architecture of the Cutkit backend, enforcing the **v24 Standardized Block** principles.

## 1. Core Philosophy: The Standard Blocks

Every entity in the system is built from the same set of fundamental primitives (Blocks). These are implemented as strictly validated classes in `server/core/blocks/`.

The reusable kernel is now mirrored in the internal workspace package
[`@cutkit/core`](../packages/core/README.md). Runtime code still imports from
`server/core/blocks/` until compatibility wrappers and package tests are
complete.

### 1.1. BaseEntity Structure
All domain models extend `BaseEntity`.

```javascript
class BaseEntity {
  _id: ObjectId | String;   // Database Primary Key
  identity: Identity;       // Identification Block
  lineage: Lineage;         // Ancestry Block
  origin: Status;           // Creation Snapshot Block
  status: Status;           // Current State Block
  specs: Specs;             // Physical DNA Block (Optional)
  attachments: Object;      // Files Block
  data: Object;             // Entity-Specific Data Block
}
```

### 1.2. The Core Blocks (`server/core/blocks/`)

*   **`Identity`**: Unified identification. Fields: `uid`, `name`, `slug`, `serial`, `reference`.
*   **`Status`**: State Machine snapshot. Fields: `state`, `userId`, `timestamp`, `metadata`, `eventId`.
*   **`Lineage`**: Flat, cumulative ancestry trace. Used for O(1) reverse lookups and multi-tenant isolation.
*   **`Specs`**: Standardized physical DNA. Fields: `width`, `length`, `area`, `sheetThickness`, `foilThickness`.

## 2. The Golden Path (Feature Pattern)

Every feature in `server/features/[name]/` must follow the canonical structure:

1.  **`model.js`**: Extends `BaseEntity`. Implements feature-specific data mapping and `toJSON()` serialization.
2.  **`repository.js`**: Pure MongoDB operations. Uses `toFlexibleId()` for all ID lookups to support mixed string/ObjectId types.
3.  **`service.js`**: Business logic, permissions, and orchestration. Must register itself via `registerService()` to enable side-effects.
4.  **`index.js`**: Clean entry point for the feature.

## 3. Core Engine Units

### 3.1. Unified Status Engine (`server/core/machines/`)
Governs entity lifecycles using declarative state machines.
*   **Decoupled Side-Effects**: Business logic is NOT in the engine. It uses a **Dynamic Hook Registry** where features register their own side-effects (e.g., `processPhysicalCut`).
*   **Standardization**: All lookups use `pluralize()` and `toFlexibleId()`.

### 3.2. Centralized Aggregator
Maintains parent summaries (counts/sums) automatically using lineage-aware aggregation. Triggered by status transitions.

### 3.3. Access and Operations
`server/core/access/` is the single authorization layer for entity services,
workflow transitions, and operation execution. It evaluates membership
permissions against entity lineage.

`server/core/operations/` runs operation definitions from `@cutkit/domain-cnc`.
Operation handlers are registered by feature modules and run only after the
access engine approves the declared requirements.

## 4. Framework Extraction Boundary

Reusable framework concerns are being separated from the CNC domain in private
workspace packages:

| Package | Backend concern |
|---|---|
| `@cutkit/core` | Blocks, entity registry, serialization helpers |
| `@cutkit/workflows` | Lifecycle definitions and transition validation |
| `@cutkit/mongo` | Mongo repository, event-store, and summary adapters |
| `@cutkit/domain-cnc` | CNC entity/workflow/summary definitions |
| `@cutkit/devtools` | Architecture and data-model inspection helpers |
| `@cutkit/mcp` | Read-only schema/workflow/doc tool handlers |

The current app remains the source of truth until each package is covered by
tests and wrapped through the existing import paths.

## 5. Architectural Guardrails
*   **`scripts/check-arch.js`**: Automated script that verifies feature modules against the Golden Path. Every backend task must pass this check.
*   **Service-Repository Separation**: Services never touch `db.collection`.
*   **Serialization**: APIs must return `toJSON()` results, never raw database documents.

## Related
- [server/core/blocks/index.js](./core/blocks/index.js) (Block Definitions)
- [server/features/_template/README.md](./features/_template/README.md) (Golden Path Reference)
- [server/core/machines/README.md](./core/machines/README.md) (Status Engine Docs)
- [packages/README.md](../packages/README.md) (Framework package extraction)
