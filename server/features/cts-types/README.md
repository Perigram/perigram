# COMPONENT: CTS Types

Organization-scoped storage for `@perigram/cts` type declarations —
strangler layer 0 of the designer rebuild (see
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §4, §11, §13).

## Responsibility

- `repository.js` persists org-authored declarations in `cts_types`
  (never system types — those compile from the domain packs at runtime).
- `service.js` builds one registry per organization view: strangler-converted
  system types first, the org's stored declarations overlaying (shadowing a
  system id is refused). `defineType` validates the declaration through the
  real CTS registry, refuses breaking redefinitions (diff per SPEC §11,
  version bump on compatible change), and compiles the whole org view before
  acknowledging the write — cross-type breakage (R2) rolls a new type back.
  `removeType` deletes org declarations only.
- `describeOrganizationTypes` returns the compiled client bundle (types,
  states, operators, render policy, JSON Schemas) plus attachment-kind
  payload traits.

## API

`GET /api/admin/cts/types` — merged org view (the designer types pane and
the process designer's registry read this). `POST /api/admin/cts/types` —
author/evolve a declaration. `DELETE /api/admin/cts/types/:id` — remove an
org type.

## Related

- [packages/cts](../../../packages/cts/README.md) — the type system itself.
- [pages/organization/README.md](../../../pages/organization/README.md) —
  the consuming designer surfaces.
