# COMPONENT: Cassette Template UI

Card surface for cassette template DTOs stored in the `cassettes` collection
and rendered through the `cassetteTemplate` design-system contract.

## Files

| File | Purpose |
|---|---|
| `CassetteTemplateCard.vue` | InstanceCard wrapper for template identity, thumbnail, actions, and current geometry revision. |

## Contract

- Expects a v24 cassette template DTO with `identity`, `status`, `lineage`, and
  `data`.
- Renders geometry through `CassetteThumbnail`, using the same template sources
  as cassette cards.
- Does not render a parameter count. Template parameters are symbolic
  constructor inputs; exact values such as `A=600` belong to the derived
  cassette design card and generated design surfaces.
- Shows `data.revisions.geometry.currentId` through `InstanceInlineRef` when the
  backend current-geometry revision pointer exists.
- Create/download actions remain footer actions and do not replace entity
  relation rows.
- Create-design action sends concrete parameter values. When `data.parameters`
  only lists parameter names, defaults are read from OCCS
  `data.definition.parameters` instead of falling back to `1`.

## Related

- [shared components](../../shared/README.md)
- [entity revisions](../EntityRevision/README.md)
- [server/features/cassettes](../../../server/features/cassettes/README.md)
