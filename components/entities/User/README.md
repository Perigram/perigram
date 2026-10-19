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
- The record popup is the shared entity popup (`useEntityPopup`): the user's
  directory profile (`DirectoryDetailSurface`), which carries the
  avatar-forward face. The card owns only the inline face; nested actions
  remain protected by interactive-target handling.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/users/README.md](../../../server/features/users/README.md)
