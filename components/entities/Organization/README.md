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
  caller-owned navigation. These footer actions render visibly instead of being
  collapsed into the generic entity-card ellipsis menu.
- Profile uses one action per membership: switch to an inactive organization or
  open the active generated organization overview. Billing, team, and process
  screens are children of that overview rather than flat profile-card actions.
- The expanded popup body (`#expanded` slot) is the avatar-forward directory
  presentation: large initial avatar, name, the type tag, then the same
  `DataBlock` fact rows as the full card. The popup chrome above it (type
  label, identity row, trace, chat/open actions) stays owned by
  `InstanceCard`.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/organizations/README.md](../../../server/features/organizations/README.md)
