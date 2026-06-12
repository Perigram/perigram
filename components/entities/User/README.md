# COMPONENT: User UI

User card surface for admin and organization membership views.

## Files

| File | Purpose |
|---|---|
| `UserCard.vue` | Entity card wrapper for user identity, email/role facts, and admin actions. |

## Contract

- Expects a `user` DTO with identity/contact fields and permission-related data.
- Status and trace are hidden; permission changes are handled by admin page
  endpoints, not by the entity card.
- Card click behavior is owned by the wrapper where parent pages need user
  selection, and nested actions remain protected by interactive-target
  handling.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/users/README.md](../../../server/features/users/README.md)
