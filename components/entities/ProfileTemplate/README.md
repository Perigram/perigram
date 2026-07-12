# COMPONENT: Profile Template Card

Master-data entity card for reusable OCCS profile-section templates.

## Contract

- Expects a `profile_template` DTO with profile metadata under `data`.
- Renders through `EntityCard` and `DataBlock`.
- Hides trace and status because profile templates are reusable master data.

## Related

- [server/features/profile-templates/README.md](../../../server/features/profile-templates/README.md)
- [components/shared/README.md](../../shared/README.md)

