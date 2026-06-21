# COMPONENT: Users

User authentication and permission management. Built on the v24 BaseEntity architecture.

## Core Files
- `model.js`: User entity extending `BaseEntity`; exposes stored copied grants without preset expansion
- `repository.js`: Database operations on `users` collection
- `service.js`: Register, login, session management
- `permission-templates.js`: Re-export of shared access preset templates
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
- `role`: Compatibility label. When an active organization process exists,
  runtime authorization uses the process assignment instead of this label.
- `permissions`: Per-entity access levels (none/read/write/admin)
- `memberships`: Array of organization memberships `{ organizationId, role, roleIds?, permissions, status }`; memberships establish tenant relationship and approval state
- `isActive`: Boolean flag

## Authentication Flow
1. Login → `usersService.login(email, password)`
2. Verify → `argon2.verify(user.data.passwordHash, password)`
3. Session → `sessionsRepository.create({ sessionId, userId, ... })`
4. Token → `generateAccessToken(userId)` (JWT, 15m)
5. Middleware → `server/middleware/auth.js` populates `event.context.auth`

## Public Signup
`POST /api/auth/register` creates a password-backed user and, when
`organizationName` is supplied, creates the first organization through the
organizations service. The new user receives an active membership, lineage
organization, and an active process assignment in the selected starter process.
Invitation signup intentionally omits
organization fields: the account is created without a membership, then the user
logs in and accepts `/invitation/:token` to create a pending membership for the
inviting organization. `recoverSignupWithoutOrganization()` is the narrow
recovery path for pre-fix accounts that have a password hash but no organization
membership; it verifies the submitted password before the register route can
attach the first organization.

## Persistence Notes
- `User.toJSON()` strips `data.passwordHash` and is safe for API responses.
- `repository.create()` restores `data.passwordHash` from the model instance before inserting into MongoDB; persistence must not rely on the public JSON shape for sensitive fields.
- Existing users without `data.passwordHash` cannot log in until their password is reset or the account is recreated.
- `repository.findByIds()` is the batch lookup used by status history actor
  enrichment. It accepts the same flexible string/ObjectId ids as `findById()`.

## Permission System
- Organization context via `user.lineage.organizationId`
- Per-organization permissions in `memberships` are compatibility fallback data.
- When `server/middleware/auth.js` resolves an active process, the user's
  `effectivePermissions`, navigation, field policies, and role assignment come
  from the compiled process definition.
- Default access presets live in [shared permission templates](../../../shared/README.md)
  so browser dev tools and server user creation read the same grant contract.
- Presets are materialized when registering users or accepting invitations.
  `User` model reads do not expand permissions from `data.role`; persisted
  memberships must carry the explicit grant object used by authorization.
- All presets guarantee at least `read` access to `materials` and
  `layer_standards`, which keeps system tools, pens, and layer catalogs
  available for basic app use.
- Existing accounts created before a preset change need a repair pass to copy
  the current template floor into stored `data.permissions` and
  `data.memberships[*].permissions`; see
  [server/scripts/repair-system-data-permissions.js](../../../server/scripts/repair-system-data-permissions.js).

## Related Components
- [organizations](../organizations/README.md) - Users belong to organizations via memberships and current lineage context
