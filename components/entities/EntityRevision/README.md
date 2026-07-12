# COMPONENT: Entity Revision UI

Renders immutable content revisions created by the backend `entity-revisions`
feature.

## Files

| File | Purpose |
|---|---|
| `EntityRevisionCard.vue` | EntityCard wrapper showing revision scope, number, short hash, and source entity relation. |

## Contract

- Expects an `entity_revision` DTO with canonical blocks and revision metadata
  under `data`.
- Source entity relationships use `EntityInlineRef`; cassette source revisions
  render as `cassetteTemplate` references because templates are stored in the
  `cassettes` collection.
- Revision cards are read-only and hide status actions because revisions are
  immutable provenance records.

## Related

- [server/features/entity-revisions](../../../server/features/entity-revisions/README.md)
- [shared](../../shared/README.md)
