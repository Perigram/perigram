# COMPONENT: Workbench Fixtures

Dev-only context persistence for the admin workbench.

## Responsibilities

- `service.js` validates the submitted live workflow draft, normalizes entity
  statuses against the compiled machines, upserts DTO-shaped entities, and
  returns both the persistence scenario projection and the normalized persisted
  workbench context consumed by the UI.
- `repository.js` performs collection upserts for generated DTO-shaped fixture
  entities. It is intentionally narrow and only used by the workbench seed
  endpoint.

The service does not define CNC data itself. The UI owns a single
`WorkbenchContext` from `test-data/workbench-context.js`; `contextToScenario()`
projects that context into collection arrays only at the seed boundary.
Workflow validation comes from `utils/workflow-compiler.js` and the existing
domain-builder/workflow package rules.

## Related

- [test-data](../../../test-data/README.md)
- [admin workbench](../../../pages/admin/README.md)
- [state machines](../machines/README.md)
