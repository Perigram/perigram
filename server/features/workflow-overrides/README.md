# COMPONENT: Workflow Overrides

Organization-scoped lifecycle override storage for entity status machines.

## Responsibility

- Persists active and archived workflow definitions in `workflow_overrides`.
- Validates submitted definitions with `@perigram/workflows` normalization before
  activation.
- Enforces organization-scoped admin access for the target entity domain.
- Resolves the active machine for the status engine. Machines are
  graph-derived (SPEC §7): the active compiled process is the lifecycle
  source, an explicit organization override is the escape hatch for types
  the process does not govern, and the registered domain's hand-authored
  workflows keep serving the legacy pack types. Resolution order for an
  organization: the producer output the caller names (`producerOutputId`),
  then the first producer of the type in the active compiled process (the
  plain transition channel carries no producer context — without the
  by-type lookup, org-authored stateful types would resolve no machine at
  all), then the organization override, then the domain workflow. A type
  none of these covers resolves to no machine.

## Data Contract

- `organizationId`: tenant that owns the override.
- `typeId`: normalized entity type such as `project` or `queue`.
- `workflow`: normalized v2 workflow definition.
- `status`: `ACTIVE`, `DRAFT`, or `ARCHIVED`; runtime uses only `ACTIVE`.
- `createdBy` / `updatedBy`: authenticated user ids.

Only one active override should exist for `{ organizationId, typeId}`.
Activation archives previous active records before inserting the new active
definition.

## Related

- [server/core/machines](../../core/machines/README.md)
- [packages/workflows](../../../packages/workflows/README.md)
