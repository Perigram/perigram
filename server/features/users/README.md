# COMPONENT: Users

User authentication and permission management. Built on the v24 BaseEntity architecture.

## Core Files
- `model.js`: User entity extending `BaseEntity` with migration logic
- `repository.js`: Database operations on `users` collection
- `service.js`: Register, login, session management
- `permission-templates.js`: Default permissions by role
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

## Permission System
- Global role check (e.g. `SuperAdmin`)
- Organization context via `user.lineage.organizationId`
- Per-organization permissions in `memberships`

## Related Components
- [organizations](../organizations/README.md) - Users belong to organizations via memberships and current lineage context
