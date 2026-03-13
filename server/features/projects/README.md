# COMPONENT: Projects

The root entity for Contractor operations, managing the high-level production context.

## v24 Architecture
Refactored to use standardized blocks and the centralized State Machine engine.

- **Status**: Governed by `ProjectMachine` (DRAFT -> ACTIVE -> CLOSED).
- **Lineage**: Always contains `organizationId` for multi-tenant scoping.
- **Summary**: Stores a cached `stateDistribution` map for instant dashboard rendering.

## Core Services
- `create()`: Initializes project identity, origin, and organization lineage.
- `update()`: Handles basic field updates and routes status changes through the `Status Engine`.
- `getBySlug()`: Uses lineage-aware permissions to verify access.

## Data Structure
```typescript
{
  identity: { name, slug },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId },
  summary: { stateDistribution, totalArea, totalWeight }
}
```
