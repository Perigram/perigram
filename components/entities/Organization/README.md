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
- The card exposes `context` and `actions` slots for membership state and
  caller-owned system-screen actions. Profile organization membership surfaces
  use these slots instead of rebuilding organization identity/data panels.
- Organization management actions come from the active generated system-screen
  manifest; invitations and permissions still use their custom endpoints.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/organizations/README.md](../../../server/features/organizations/README.md)
