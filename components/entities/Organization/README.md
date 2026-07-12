# COMPONENT: Organization UI

Organization card surface for tenant/manufacturer records.

## Files

| File | Purpose |
|---|---|
| `OrganizationCard.vue` | Entity card wrapper for organization identity and contact/role facts. |

## Contract

- Expects an `organization` DTO with `identity` and organization data under
  `data`.
- Status and trace are hidden for organization cards unless a future workflow is
  added to the domain contract.
- Shared entity-card navigation routes organization cards to
  `/organization/users`, which is the existing organization management surface.
  The card itself remains a read-oriented summary; invitations and permissions
  still use custom endpoints.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/organizations/README.md](../../../server/features/organizations/README.md)
