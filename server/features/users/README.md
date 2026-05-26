# COMPONENT: Users

User authentication and permission management. Built on the v24 BaseEntity architecture.

## Core Files
- `model.js`: User entity extending `BaseEntity` with migration logic
- `repository.js`: Database operations on `users` collection
- `service.js`: Register, login, session management
- `permission-templates.js`: Re-export of shared default permissions by role
- API endpoints in `server/api/auth/` and `server/api/users/`

## Data Structure
Collection: `users`
Inherits all `BaseEntity` fields.

**Identity Block:**
- `uid`: `user-XXXX` format
- `name`: User's full name

**Data Block:**
- `email`: User's email (lowercase)
- `passwordHash`: Argon2id hash
- `role`: SuperAdmin, ManufacturerAdmin, ContractorAdmin, CustomerAdmin, IndividualUser
- `permissions`: Per-entity access levels (none/read/write/admin)
- `memberships`: Array of organization memberships `{ organizationId, role, permissions, status }`
- `isActive`: Boolean flag

## Authentication Flow
1. Login → `usersService.login(email, password)`
2. Verify → `argon2.verify(user.data.passwordHash, password)`
3. Session → `sessionsRepository.create({ sessionId, userId, ... })`
4. Token → `generateAccessToken(userId)` (JWT, 15m)
5. Middleware → `server/middleware/auth.js` populates `event.context.auth`

## Persistence Notes
- `User.toJSON()` strips `data.passwordHash` and is safe for API responses.
- `repository.create()` restores `data.passwordHash` from the model instance before inserting into MongoDB; persistence must not rely on the public JSON shape for sensitive fields.
- Existing users without `data.passwordHash` cannot log in until their password is reset or the account is recreated.

## Permission System
- Global role check (e.g. `SuperAdmin`)
- Organization context via `user.lineage.organizationId`
- Per-organization permissions in `memberships`
- Default role templates live in [shared permission templates](../../../shared/README.md)
  so browser dev tools and server user creation read the same access contract.
- `User` materializes missing permission keys from the stored role preset when
  loading legacy records. Existing feature values are preserved, so an explicit
  custom `none` continues to deny access.

## Related Components
- [organizations](../organizations/README.md) - Users belong to organizations via memberships and current lineage context
