# COMPONENT: Workflow Overrides

Organization-scoped lifecycle override storage for entity status machines.

Parent: [server/features](../README.md).

## Responsibility

- Persists active and archived workflow definitions in `workflow_overrides`.
- Resolves the active machine for the status engine. Machines are
  graph-derived (SPEC §7): the active compiled process is the lifecycle
  source, an explicit organization override is the escape hatch for types
  outside the active process's governance. Resolution order for an organization: the
  producer output the caller names (`producerOutputId`), then the first
  producer of the type in the active compiled process (the plain
  transition channel carries zero producer context, so the by-type lookup
  is the machine source for org-authored stateful types), then the
  organization override. A type none of these covers resolves to no
  machine, by design.

Workflow normalization and transition semantics are owned by
[`@perigram/core`](../../../packages/core/README.md); this feature owns only
organization-scoped persistence and resolution.

`resolveActiveWorkflow` is the module's whole public service surface; the
repository owns row writes. A unique partial index on
`{ status, organizationId, typeId }` with `status = 'ACTIVE'` enforces one
active override per organization and type.

## Data Contract

- `organizationId`: tenant that owns the override.
- `typeId`: normalized entity type id (registry-canonicalized).
- `workflow`: normalized v2 workflow definition.
- `status`: `ACTIVE` or `ARCHIVED`; resolution reads only `ACTIVE`.
- `createdBy` / `updatedBy`: authenticated user ids.

## Related

- [server/core/machines](../../core/machines/README.md)
- [packages/core](../../../packages/core/README.md)
