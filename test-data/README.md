# Test Data Factories

**Enterprise Pattern:** Reusable factory functions for consistent test data across the application and design-system demos.

Factories in this directory represent **API DTO shape**, not raw MongoDB documents. They preserve v24 blocks (`identity`, `origin`, `status`, `lineage`, `attachments`, `data`, `summary`) and add only real hoisted DTO aliases emitted by current models/services.

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
  name: 'My Custom Project',
  customer: 'Different Corp'
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
    // ... all required fields with realistic defaults
    createdAt: new Date(),
    ...overrides // Always spread at the end
  };
}
```

## Design-System Alignment

Factories are built from:
- v24 block contract in `server/core/blocks/README.md`
- API DTO shapes emitted by feature models/services
- Entity design-system manifest in `utils/design-system-contract.js`
- Workflow state definitions in `packages/domain-cnc/src/index.js`

This ensures mock data matches what your API actually expects/returns.

When a component needs a new field for display, update the relevant DTO factory and manifest entry together. Do not add flat compatibility fields unless the API actually returns them.
When an entity type has a workflow, the factory `status.state` must be one of that workflow's canonical states; `shared/design-system.spec.js` enforces this for UI lab demos.
