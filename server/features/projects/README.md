# COMPONENT: Projects

The root entity for Contractor operations, managing the high-level production context.

## v24 Architecture
Refactored to use standardized blocks and the centralized State Machine engine.

- **Status**: Governed by `ProjectMachine` (DRAFT -> ACTIVE -> CLOSED).
- **Lineage**: Always contains `organizationId` for multi-tenant scoping.
- **Summary**: Stores a cached `stateDistribution` map for instant dashboard rendering.
  The `/api/project` list route augments the project DTO summary with
  `queuePreview` for the project browser, while preserving canonical identity
  and status blocks for shared entity-card rendering.

## Core Services
- `create()`: Initializes project identity, origin, and organization lineage.
  The permission check asks the shared access engine for the explicit
  `create` action on `projects`, so process action grants can authorize entity
  creation before the created project has a status-scoped read/write grant.
- `update()`: Handles basic field updates and routes status changes through the `Status Engine`.
- `getBySlug()`: Uses lineage-aware permissions to verify access.
  Project create/read/delete checks pass the full auth context into lineage
  access so membership-scoped grants and top-level permission fallbacks behave
  consistently between `/api/project` list and single-project routes.
- `list()`: Accepts `primaryStatus` for one status or comma-separated
  `primaryStatuses` for generated process screens that aggregate several
  role-local status windows. The database filter narrows the collection before
  the shared access evaluator performs the final per-project read check.

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

Projects have no built-in Library relation. Like every canonical entity, they
may persist generic non-owning references in `relations`; the service preserves
those entries without assigning containment or cassette-specific semantics.
