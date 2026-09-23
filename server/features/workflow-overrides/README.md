# COMPONENT: Workflow Overrides

Organization-scoped lifecycle override storage for entity status machines.

## Responsibility

- Persists active and archived workflow definitions in `workflow_overrides`.
- Validates submitted definitions with `@perigram/workflows` normalization before
  activation.
- Enforces organization-scoped admin access for the target entity domain.
- Resolves the active organization override for the status engine, falling back
  to the domain workflow when no override exists.
- The type declaration is itself a machine source: when neither an override
  nor a process workflow exists and the registered domain carries no
  workflow for the type, resolution derives a normalized v2 machine from
  the type's registry declaration (`states.main` + declared transitions)
  through `@perigram/cts` `declarationWorkflow`. Organization context
  resolves the declaration through the instances feature's cached
  per-organization lookup (tenancy: system view first, the org's stored
  declarations overlay); without an organization the synchronous fallback
  serves static pack/framework declarations only. A type with no
  declaration and no domain workflow still resolves to no machine.
- When an active process supplies a workflow, runtime resolution merges
  domain-owned system intent transitions into that process workflow. Process
  statuses remain user-authored, but hidden service intents such as
  `nestingSolveCompleted` cannot disappear from entities that are produced by
  commands/tasks.
- Process workflow lookup is entered only with an explicit `producerOutputId`.
  Status callers without producer context use the organization override or
  domain workflow; they never select a process producer by entity type.

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
