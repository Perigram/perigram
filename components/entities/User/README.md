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
- The inline variant is used by `InstanceInlineRef` in status-history actor rows;
  keep the avatar compact in that variant so audit rows stay dense.
- The expanded popup body (`#expanded` slot) is the avatar-forward directory
  presentation: large avatar, name, email when the redacted DTO carries it, the
  membership count, then the same `DataBlock` fact rows as the full card. The
  popup chrome above it (type label, identity row, trace, chat/open actions)
  stays owned by `InstanceCard`.
- Card click behavior is owned by the wrapper where parent pages need user
  selection, and nested actions remain protected by interactive-target
  handling.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/users/README.md](../../../server/features/users/README.md)
