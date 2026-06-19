# COMPONENT: Workflow Overrides

Organization-scoped lifecycle override storage for entity status machines.

## Responsibility

- Persists active and archived workflow definitions in `workflow_overrides`.
- Validates submitted definitions with `@cutkit/workflows` normalization before
  activation.
- Enforces organization-scoped admin access for the target entity domain.
- Resolves the active organization override for the status engine, falling back
  to the domain workflow when no override exists.

## Data Contract

- `organizationId`: tenant that owns the override.
- `entityType`: normalized entity type such as `project` or `queue`.
- `workflow`: normalized v2 workflow definition.
- `status`: `ACTIVE`, `DRAFT`, or `ARCHIVED`; runtime uses only `ACTIVE`.
- `createdBy` / `updatedBy`: authenticated user ids.

Only one active override should exist for `{ organizationId, entityType}`.
Activation archives previous active records before inserting the new active
definition.

## Related

- [server/core/machines](../../core/machines/README.md)
- [packages/workflows](../../../packages/workflows/README.md)
