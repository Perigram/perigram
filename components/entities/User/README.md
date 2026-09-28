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
- The popup is the card's directory face: the `#popup-identity` slot
  replaces the generic instance chrome (type label, icon row, trace) with
  the avatar-forward header — large avatar, name, email when the redacted
  DTO carries it, role/membership context tags. The `#expanded` body
  carries only the `DataBlock` fact rows; the action row (chat, open)
  stays owned by `InstanceCard`.
- Card click behavior is owned by the wrapper where parent pages need user
  selection, and nested actions remain protected by interactive-target
  handling.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/users/README.md](../../../server/features/users/README.md)
