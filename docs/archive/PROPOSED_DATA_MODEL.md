# DEPRECATED
> **WARNING:** This document is outdated. Please refer to `server/README.md` and `server/DATA_MODEL.md` for the current (v24 Absolute Final) architecture.

# Engineering Data Model (v24 Absolute Final)

## 0. Core Logic Engines

### 0.1. Lineage Inheritance (The Trace)
Lineage is a flat map of ancestor IDs.
- **Inheritance Rule**: Every child document inherits its parent's `lineage` object and appends the parent's ID.
- **Rule**: `child.lineage = { ...parent.lineage, [parentType]Id: parent._id }`.
- **Purpose**: Single-index reverse lookups for any level of ancestry.

### 0.2. Declarative State Machines
Status is a validated transition in a machine.
- **`state_machines`**: Collection defining valid `states` and `transitions` for each `entityType`.
- **`StatusBlock`**: The snapshot structure used for both `origin` and `status`:
  `{ state: String, userId: String, timestamp: Date, metadata: Object, eventId: ObjectId }`
- **Updates**: Self-loop transitions allow updating `metadata` (notes/attachments) without a state code change.
- **Archive**: Every change is logged to the `status_events` collection.

---

## I. Universal Standard Blocks
Documents are constructed using these standardized primitives:

- **`identity`**: `{ slug: String, name: String, serial: String, reference: String }`
- **`status`**: [StatusBlock] (The current snapshot)
- **`origin`**: [StatusBlock] (The creation snapshot)
- **`lineage`**: `{ [entity]Id: ObjectId }` (Cumulative trace)
- **`specs`**: `{ sheetThickness: Number, foilThickness: Number, width: Number, length: Number, area: Number }`

---

## II. Production Entities

### 1. `projects`
- `_id`, `identity`, `origin`, `status`, `lineage`: { organizationId }
- `summary`: {
    totalArea: Number, // This has to be computed
  }

### 2. `queues` (The Nesting Job)
- `_id`, `identity`, `origin`, `status`, `lineage`: { organizationId, projectId }
- `job`: {
    items: Array<{ 
      type: String, // PARAMETRIC | STATIC
      id: ObjectId, // templateId or designId
      quantity: Number,
      parameters: Object 
    }>,
    materialPool: Array<{
      type: String, // PILE | SHEET | REMNANT | VIRTUAL
      id: ObjectId, 
      specs: [Standard Specs Block]
    }>
  }

### 3. `nesting_runs` (The Solution)
- `_id`, `origin`, `status`, `lineage`: { organizationId, projectId, queueId }
- `results`: { 
    efficiency: Number, 
    sheetCount: Number, 
    remnantArea: Number,
    layoutData: Object, // what's that? 
    artifactIds: Array<ObjectId>
  }

### 4. `sheet_designs` (Digital Layout)
- `_id`, `origin`, `status`, `lineage`: { organizationId, projectId, queueId, runId }
- `geometry`: { svgId, dxfId, data }
- `specs`: [Standard Specs Block]

### 5. `cassette_designs` (Baked Geometry)
- `_id`, `identity`, `origin`, `lineage`: { organizationId, projectId, queueId, templateId? }
- `geometry`: { data: Object, dxfId: ObjectId } 
- `parameters`: Object 

### 6. `cassette_instances` (Physical Tracking)
- `_id`, `identity`: { serial, reference }, `status`, `lineage`: { organizationId, projectId, queueId, runId, designId, sheetId, pileId }

---

## III. Material Entities

### 7. `material_piles` (Inventory Source)
- `_id`, `identity`, `origin`, `status`, `lineage`: { organizationId, warehouseId, catalogId, colorId }
- `specs`: [Standard Specs Block]
- `stock`: { total: Number, used: Number }

### 8. `sheets` (Work Units)
- `_id`, `identity`: { serial }, `origin`, `status`, `lineage`: { organizationId, warehouseId, pileId, queueId, runId, sheetDesignId }
- `specs`: [Standard Specs Block] // Optional overrides

### 9. `remnants` (Scrap)
- `_id`, `identity`: { serial }, `origin`, `status`, `lineage`: { organizationId, warehouseId, parentSheetId, pileId, colorId, runId }
- `geometry`: { dxfId, data }
- `specs`: { area: Number }

---

## IV. Master Data & System Logic

### 10. `cassettes` (The Templates)
- `_id`, `identity`, `origin`, `status`, `lineage`: { organizationId }
- `definition`: { 
    type: String, // PARAMETRIC | STANDARD
    data: Object, // The JSON Graph or Logic
    parameters: Array<String>
  }

### 11. `layer_standards` (CNC Logic)
- `_id`, `code`, `category`, `identity`, `lineage`: { organizationId? }
- `i18n`: { 
    en: { nameTemplate: String }, 
    ru: { nameTemplate: String } 
  }
- `parameters`: Array<String>
- `defaultPenId`: ObjectId

### 12. `catalogs` (Brands)
- `_id`, `manufacturerId`, `identity`, `material`, `pricing`: { pricePerSqm: Number }, `options`: { sheetThicknesses, foilThicknesses, widths, lengths }

### 13. `colors` (Finish SKUs)
- `_id`, `identity`: { name, code }, `visuals`: { hexCode }, `lineage`: { catalogId }

---

## V. Identity & Access

### 14. `memberships` (Org Participation)
- `_id`, `lineage`: { organizationId, userId }, `role`, `permissions`, `status`

### 15. `users`
- `_id`: String (OAuth ID), `identity`: { name, email, avatarUrl }, `status`: [StatusBlock]

### 16. `organizations` & `warehouses`
- `organizations`: { _id, identity, type, billing, settings }
- `warehouses`: { _id, identity, type, lineage: { organizationId }, address }

### 17. `status_events` (Historical Log)
- `_id`: ObjectId, `targetId`: ObjectId, `targetType`: String, `fromState`: String, `toState`: String, `status`: [Standard Status Block]

### 18. `artifacts` (Storage)
- `_id`, `type`, `fileId`, `lineage`: [Standard Lineage Block], `status`: [Standard Status Block], `metadata`: Object
