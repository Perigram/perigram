# COMPONENT: Cassette Template UI

Card surface for cassette template DTOs stored in the `cassettes` collection
and rendered through the `cassetteTemplate` design-system contract.

## Files

| File | Purpose |
|---|---|
| `CassetteTemplateCard.vue` | EntityCard wrapper for template identity, thumbnail, parameter count, actions, and current geometry revision. |

## Contract

- Expects a v24 cassette template DTO with `identity`, `status`, `lineage`, and
  `data`.
- Renders geometry through `CassetteThumbnail`, using the same template sources
  as cassette cards.
- Shows `data.revisions.geometry.currentId` through `EntityInlineRef` when the
  backend current-geometry revision pointer exists.
- Create/download actions remain footer actions and do not replace entity
  relation rows.

## Related

- [shared components](../../shared/README.md)
- [entity revisions](../EntityRevision/README.md)
- [server/features/cassettes](../../../server/features/cassettes/README.md)
