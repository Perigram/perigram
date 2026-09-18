# COMPONENT: Instances

Generic per-class instance services (CTS SPEC §13):
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §21/§13). One service
serves every type that has no hand-registered feature service — pack types
and org-authored types — so the type system is executable without
hand-written services.

## Contract

- Storage: per-class collections (`files`, `items`, `groups`, `processes`)
  with the type id as discriminator; documents carry type, typeVersion,
  identity/origin/status/lineage/data blocks, org-scoped lineage.
- Declaration resolution per call: framework and pack types from static
  declarations, org types from `cts_types` (cached;
  `invalidateInstanceDeclarations` on writes).
- Service surface: the feature-service shape (getById/list/create/
  processUpdate/remove) plus the process bindings (processList,
  processGetById, processDelete, processCapabilities, genericCreate
  construction handler).
- Registration: the core registry's entity-service resolver consults
  `instanceServiceResolver`; explicit feature services always win.

## Related

- [server/runtime/README.md](../../runtime/README.md) — resolver registration.
- [server/features/cts-types/README.md](../cts-types/README.md) — org type storage.
