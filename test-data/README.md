# Test Data Factories

**Enterprise Pattern:** Reusable factory functions for consistent test data across the application and design-system demos.

Factories in this directory represent **API DTO shape**, not raw MongoDB documents. They preserve the strict v24 block contract: root `_id` plus `identity`, `origin`, `status`, `lineage`, `specs`, `attachments`, `data`, and `summary`.

Factories can be imported by Nuxt UI code and by server/runtime modules that run under plain Node ESM in production containers. Keep internal imports relative instead of Nuxt-only aliases such as `~/`.

## Why Factory Functions?

### ❌ Anti-Pattern (Inline Mocks):
```javascript
const mockProject = {
  name: 'Test',
  customer: 'Acme' // Inconsistent, duplicated everywhere
};
```

### ✅ Enterprise Pattern (Factories):
```javascript
import { createMockProject } from '~/test-data/factories';

const mockProject = createMockProject({
  name: 'Custom Name' // Override only what you need
});
```

## Benefits

1. **Single Source of Truth** - Schema changes happen in one place
2. **Consistent Test Data** - All tests use the same realistic structure
3. **Easy Overrides** - Customize only what you need
4. **Type Safety** - Can be easily typed with TypeScript
5. **Documentation** - Factory functions document the expected schema
6. **Reusability** - Use across tests and UI lab.

## Usage

### Basic Usage
```javascript
import { createMockProject } from '~/test-data/factories';

const project = createMockProject();
// Returns a complete project with all required fields
```

### With Overrides
```javascript
const customProject = createMockProject({
  identity: { name: 'My Custom Project' },
  data: { customer: 'Different Corp' }
});
// Merges your overrides with defaults
```

### Creating Multiple Items
```javascript
const projects = createMockProjectsList(5);
// Returns array of 5 projects
```

## Available Factories

- `createMockProject()` - Complete project object
- `createMockQueue()` - Queue with entries and history
- `createMockSheet()` - Physical material sheet
- `createMockBatch()` - Material batch with piles
- `createMockWarehouse()` - Warehouse with inventory counts
- `createMockRequisition()` - Requisition with items
- `createMockRemnant()` - Reusable material remnant
- `createMockCatalog()` - Material catalog with colors
- `createMockStatistics()` - Dashboard statistics
- `createMockHistory()` - Status change timeline
- `createMockMaterial()` - Material specifications
- `createMockProjectsList(count)` - Array of projects

## Extending

To add a new factory:

```javascript
export function createMockYourEntity(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { uid: 'your-entity-1', name: 'Your Entity' },
    status: { state: 'ACTIVE' },
    data: {},
    ...overrides // Always spread at the end
  };
}
```

## Design-System Alignment

Factories are built from:
- v24 block contract in `server/core/blocks/README.md`
- API DTO shapes emitted by feature models/services
- Entity design-system manifest in `@cutkit/domain-cnc` through the
  compatibility exports in `utils/design-system-contract.js`
- Workflow state definitions in `packages/domain-cnc/src/index.js`

This ensures mock data matches what your API actually expects/returns.
Factory modules use the Nuxt root alias for shared repo contracts when those
factories are imported by pages, because Nitro bundles page dependencies into
generated server chunks during production builds.

When a component needs a new field for display, update the relevant DTO factory and manifest entry together. Do not add flat compatibility fields.
When an entity type has a workflow, the factory `status.state` must be one of that workflow's canonical states; `shared/design-system.spec.js` enforces this for UI lab demos.
UI Lab/admin access examples use the same permission template and active
membership shape as the access model. `createMockUser()` includes role,
organization membership, and permissions so permission editors do not render a
fake role-only user contract.
Current mutable location examples belong in `status.lifecycle.data.location`, not in root `data` or `lineage`. Use typed shapes such as `warehouse`, `coordinates`, or `address` so `EntityStatus` can render the same location contract used by real DTOs.
Geometry previews for design/remnant cards belong under `data.geometry.preview` with layer paths or polygon points. Do not add UI-only filename fields when the card needs a visual preview.
`createMockPile()` represents a general/manual warehouse material pile. `createMockBatchPile()` represents a requisition-sourced pile and must include `lineage.requisitionId` so UI Lab keeps `materialPile` and `batchPile` visually distinct even though both use the `material_pile` backend entity type.

## Workbench Context

`workbench-context.js` is the admin workbench source of truth for generated
and runtime dev data. It stores entities as a type/id map, refs, relationships,
compiled workflows, access defaults, and typed command input bindings in
one context. Command outputs are upserted back into that same context before
they are rendered, so the UI does not create placeholder entity cards. Local
preview status transitions patch entity `status` blocks inside this same
context rather than calling persisted APIs for draft fixtures.
`workbench-manual-entities.js` owns the typed manual entity creation rules used
by the workbench. It creates minimal DTOs from v24 blocks instead of copying
factory demo payloads: lineage references are declared as `entityId` fields,
queues get only the typed cassette/quantity inputs needed for nesting, and
cassette designer output is stored in the backend `cassette` bucket while
previewing through the cassette-template UI surface. Default manual drafts only
fill name and workflow state; entity references must be selected explicitly.

`scenarios.js` still composes factory DTOs into the base coherent CNC graph.
The context helper projects that graph to a scenario shape only when the seed
endpoint needs collection arrays for persistence. Scenario generation owns
cross-entity consistency; individual factories remain low-level DTO
constructors and should not grow random/default entity methods.

Scenario statuses are derived from the compiled workflow draft passed by the
workbench. This keeps generated test data aligned with the status machine being
edited instead of static factory defaults.
