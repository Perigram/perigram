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

The process plane reads users through the registered party bindings
(`server/runtime/party-wire.js`): the §3 wire shape (identity slots plus
the declared rows — name, email, and the `roles` derived from the active
organization's authoritative `roleAssignments`), membership-gated (self
always readable). Users are readable principals — never process-mutable;
user mutation stays on the feature routes below.

**Identity Block:**
- `uid`: `user-XXXX` format

**Data Block:**
- `email`: User's email (lowercase)
- `passwordHash`: Argon2id hash
- `permissions`: Tenant recovery grants; ordinary process access is not copied here.
- `memberships`: Array of organization memberships `{ organizationId, permissions, status, owner? }`; memberships establish tenant relationship and approval state only
- `isActive`: Boolean flag
- `bot`: Marker for the AI's attribution identity, the per-organization
  assistant (`{ createdAt }` persisted; DTOs carry the same bare shape).
  The assistant has no password (no login) and an internal placeholder
  email; the membership carries only the narrow `organizations` recovery
  grant. `registerBot` (used by the [agent bots](../agent-bots/README.md)
  feature to bootstrap the assistant) creates the marker without a token
  or profile — the assistant holds no grants of its own: AI runs execute
  delegated to the chatting user's access.

## Authentication Flow
1. Login → `usersService.login(email, password)`
2. Verify → `argon2.verify(user.data.passwordHash, password)`
3. Session → `sessionsRepository.create({ sessionId, userId, ... })`
4. Token → `generateAccessToken(userId)` (JWT, 15m)
5. Middleware → `server/middleware/auth.js` populates `event.context.auth`

## Public Signup
`POST /api/auth/register` creates a password-backed user from credentials
only — name, email, and password. It never creates organizations,
memberships, or processes: orgless accounts are the normal post-signup
state. Users join an organization by invitation (`/invitation/:token`
creates the pending membership after login) or create their own
organization through the authenticated organizations API from the profile
page, which grants the creator the owner membership with permanent
tenant-management grants.

## Persistence Notes
- `User.toJSON()` strips `data.passwordHash` and is safe for API responses.
- `repository.create()` restores `data.passwordHash` from the model instance before inserting into MongoDB; persistence must not rely on the public JSON shape for sensitive fields.
- Existing users without `data.passwordHash` cannot log in until their password is reset or the account is recreated.
- `repository.findByIds()` is the batch lookup used by status history actor
  enrichment. It accepts the same flexible string/ObjectId ids as `findById()`.
- `GET /api/users/:id` returns a redacted user DTO for inline references such
  as status-history actors and chat message entity tokens. The route grants
  full user-field visibility only for the same user or callers that can manage
  users in the active organization.
- User listing scopes by active `organizationId` as well as explicit
  membership records, and queries both string and `ObjectId` organization-id
  forms. Process-auth contexts that omit expanded memberships still return
  same-organization users for pickers and chat lists.
- `directorySearch(query, limit)` is the one cross-tenant read: it matches
  active users by display name only (never email) for the
  [directory feature](../directory/README.md), which owns the directory
  card projection and privacy contract. Ordinary list queries stay
  membership-scoped.
- User avatars are private GridFS files owned through the users service.
  `PUT/GET/DELETE /api/users/:id/avatar` updates, streams, or removes JPEG,
  PNG, and WebP images. Persisted `data.avatar` storage metadata is stripped
  from DTOs; readable user DTOs expose only a versioned `data.avatarUrl`.
  Avatar reads are authenticated-only (avatars render beside messages in
  cross-organization support conversations, so the image itself is shared
  profile chrome); users may edit their own avatar, and active-organization
  user administrators may edit member avatars.

## Permission System
- Organization context via `user.lineage.organizationId`
- Per-organization permissions in `memberships` are explicit stored grants used
  only by tenant-management recovery paths.
- Legacy active memberships or active user permission snapshots with both
  `organizations:admin` and `users:admin` are treated as owner recovery until
  `server/scripts/migrate-organization-owner-admins.js` writes the explicit
  `owner` flag. User mutation paths reject removing the last active
  organization user or the last active owner. Canonical owner recovery grant
  semantics live in [organizations](../organizations/README.md).
- When `server/middleware/auth.js` resolves an active process, it combines the
  organization's `data.roleAssignments[userId]` with compiled process roles to
  produce effective permissions, navigation, screens, and actions.
- User management checks use the compiled `users:admin` grant first, then a
  narrow recovery path for active membership `users:admin` grants. Membership
  role labels and sole-member status do not imply management access.
- Default access presets live in [shared permission templates](../../../shared/README.md)
  so browser dev tools and server user creation read the same grant contract.
- Organization role ids and bindings are never stored on users or memberships.
  `User` model reads do not expand ordinary permissions from persisted
  memberships; persisted memberships must carry the explicit recovery grant
  object used by tenant-management authorization.
- System materials, layer standards, pens, and tools are not exposed through
  copied user grants. They carry the public system catalogue marker documented
  in [server architecture](../../README.md), and read access is evaluated from
  that marker directly.

## Related Components
- [organizations](../organizations/README.md) - Users belong to organizations via memberships and current lineage context
