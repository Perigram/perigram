# NEOLIT.md (CONTAINER Level)

This document describes the implemented architecture of the system, derived from the codebase as of Feb 1, 2026.

## 1. Core Philosophy: The Standard Blocks

Every entity in the system is built from the same set of fundamental primitives (Blocks). This ensures consistency in serialization, API responses, and database structure.

### 1.1. BaseEntity Structure
All domain models extend `BaseEntity` (see `server/utils/blocks.js`).

```javascript
class BaseEntity {
  _id: ObjectId | String;   // Database Primary Key
  identity: Identity;       // Identification Block
  lineage: Lineage;         // Ancestry Block
  origin: Status;           // Creation Snapshot Block
  status: Status;           // Current State Block
  attachments: Object;      // Files Block
  data: Object;             // Entity-Specific Data Block
}
```

### 1.2. The Blocks

#### **Identity Block**
*   **Purpose:** Human and System identification.
*   **Structure:** `{ uid: String, name: String }`
*   **Convention:** `uid` matches `_id`.

#### **Lineage Block**
*   **Purpose:** Flat map of all ancestors for instant lookups and permission checks.
*   **Structure:** `{ [entityType]Id: ObjectId | String, ... }`
*   **Example:** `{ organizationId: "...", projectId: "...", queueId: "..." }`
*   **Rule:** Children inherit and extend parent lineage.

#### **Status Block**
*   **Purpose:** State Machine snapshot.
*   **Structure:** `{ state: String, userId: String, timestamp: Date, metadata: Object, eventId: ObjectId }`
*   **Origin:** The `origin` field is a Status Block capturing the *creation* state (immutable).
*   **Current:** The `status` field is the current state.

#### **Data Block**
*   **Purpose:** Container for all entity-specific logic and properties.
*   **Rule:** Fields that are not Identity, Lineage, Status, or Attachments go here.

---

## 2. Key Domain Entities

### 2.1. Material Flow

*   **`catalogs`**: Definitions of available materials (prices, specs) from Manufacturers.
*   **`requisitions`**: Orders from Contractors to Manufacturers.
    *   *Lineage:* `{ organizationId (Contractor), manufacturerId, projectId? }`
    *   *Data:* List of requested items with price snapshots.
*   **`material_piles`**: Physical inventory in a warehouse.
    *   *Replaces:* Old "Batch" entity.
    *   *Lineage:* `{ warehouseId, catalogId, colorId, requisitionId? }`
    *   *Data:* `{ stock: { total, used }, specs: {...} }`

### 2.2. Production Flow

*   **`projects`**: Top-level container for work.
*   **`queues`**: Nesting Jobs.
    *   *Lineage:* `{ projectId }`
    *   *Data:* `{ job: {...}, materialPool: [...] }`
*   **`nesting_runs`**: Results of a nesting algorithm.
    *   *Lineage:* `{ queueId, ... }`
    *   *Data:* `{ results: { efficiency, ... } }`
*   **`sheets`**: Physical sheets consumed or generated.
    *   *Lineage:* `{ pileId (source), runId (if used), ... }`
*   **`cassettes`**: The final manufactured panels.
    *   *Types:* `cassette_designs` (digital), `cassette_instances` (physical).

---

## 3. Service Architecture

*   **Service/Repository Pattern:** Strict separation.
    *   `repository.js`: Pure MongoDB calls. No business logic.
    *   `service.js`: Permissions, Validation, State Transitions (`statusService`).
*   **Registry:** `server/utils/blocks.js` maintains a registry of services to allow `entity.getAncestor('project')` dynamic resolution.

## 4. Status Machine
*   **`status_events`**: Immutable log of all state transitions.
*   **Transitions:** Managed by `server/core/machines`.

