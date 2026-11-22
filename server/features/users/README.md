# COMPONENT: Users

User authentication and permission management.

Parent: [server/features](../README.md).

## Core Files
- `model.js`: User entity extending `BaseEntity`; exposes stored copied
  grants, presets unexpanded
- `repository.js`: Database operations on `users` collection
- `service.js`: Register, login, session management
- `organization-owner.js`: The owner-recovery seam — `ORGANIZATION_OWNER_PERMISSIONS`, `ownerMembership`, `isOwnerMembership`, `ensureOwnerMembership`, and `applyOwnerPermissionsToAuth`, the auth merge process auth hydration consumes
- API endpoints in `server/api/auth/` and `server/api/users/`

## Data Structure
Collection: `users`
Inherits all `BaseEntity` fields.

The process plane reads users through the registered party bindings
(`server/runtime/party-wire.js`): the §3 wire shape (identity slots plus
the declared rows — name, email, and the `roles` derived from the active
organization's authoritative `roleAssignments`), membership-gated (self
always readable). Users are readable principals on the process plane;
user mutation stays on the feature routes below.

**Identity Block:**
- `uid`: `user-XXXX` format

**Data Block:**
- `email`: User's email (lowercase)
- `passwordHash`: Argon2id hash
- `permissions`: Tenant recovery grants; ordinary process access resolves from compiled roles.
- `memberships`: Array of organization memberships `{ organizationId, permissions, status, owner? }`; memberships establish tenant relationship and approval state only
- `bot`: Marker for the AI's attribution identity, the per-organization
  assistant (`{ createdAt }` persisted; DTOs carry the same bare shape).
  The assistant has no password (no login) and an internal placeholder
  email; the membership carries only the narrow `organizations` recovery
  grant. `registerBot` (used by the [agent bots](../agent-bots/README.md)
  feature to bootstrap the assistant) creates the marker without a token
  or profile — the assistant holds no grants of its own: AI runs execute
  delegated to the chatting user's access.

## Membership Machine

Membership is the tenant state; the user record carries no separate account
active flag.

| From | Event / guard | To |
|---|---|---|
| `pending` | organization admin approves (`confirmMembership`) | `active` |
| `pending` | organization admin rejects | membership removed |
| `pending` | invitee cancels from account settings | membership removed |
| `active` | organization admin removes the member | membership removed |
| `active` | member leaves from account settings | membership removed |

Only `active` memberships enter the request auth context or permit an
organization switch. `pending` and any other explicit non-active status grant
no tenant access; legacy memberships with no status remain active for
compatibility. Rejection removes the membership and the organization role
assignment; the invitation keeps its own terminal state.

## Authentication Flow
1. Login → `usersService.login(email, password)`
2. Verify → `argon2.verify(user.data.passwordHash, password)`
3. Session → `sessionsRepository.create({ sessionId, userId, ... })`
4. Token → `generateAccessToken(userId)` (JWT, 15m)
5. Middleware → `server/middleware/auth.js` populates `event.context.auth` from active memberships only; a stale lineage pointer cannot preserve access to a pending or inactive tenant.

## User administration

`POST /api/users` creates an organization member and requires the active
organization's `users:admin` grant. The service repeats that check before
creating a membership or assigning process roles; callers cannot supply an
arbitrary organization id or role assignment.

## Public Signup
`POST /api/auth/register` creates a password-backed user from credentials
only — name, email, and password. The account starts orgless, and orgless
accounts use the home workspace as their normal post-signup state. Users
join an organization by invitation (`/invitation/:token` creates the pending
membership after login) or create their own organization through the
authenticated organizations API from account settings, which grants the
creator the owner membership with permanent tenant-management grants.

`leaveOrganization(userId, organizationId)` removes the caller's membership
and organization role assignment. Leaving the active organization selects
another active membership or no organization. The last active member and
the last active owner cannot leave (`assertCanRemoveMembership`).

## Persistence Notes
- `User.toJSON()` strips `data.passwordHash` and is safe for API responses.
- `repository.create()` restores `data.passwordHash` from the model instance before inserting into MongoDB — the public JSON shape omits sensitive fields.
- Existing users lacking `data.passwordHash` must have their password reset or the account recreated to log in.
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
  active users by display name only for the
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
- An active membership counts as owner recovery when it carries the
  explicit `owner` flag (`isOwnerMembership`). User mutation
  paths reject removing the last active organization user or the last
  active owner. Canonical owner recovery grant semantics live in
  [organizations](../organizations/README.md).
- When `server/middleware/auth.js` resolves an active process, it combines the
  organization's `data.roleAssignments[userId]` with compiled process roles to
  produce effective permissions, navigation, screens, and actions.
- User management checks use the compiled `users:admin` grant first, then a
  narrow recovery path for active membership `users:admin` grants. Membership
  role labels and sole-member status carry no management access.
- Default access presets live in [shared permission templates](../../../shared/README.md)
  so browser dev tools and server user creation read the same grant contract.
- Organization role ids and bindings live on the organization record,
  outside users and memberships. Ordinary permissions stay unexpanded on
  `User` model reads; persisted memberships carry the explicit recovery
  grant object used by tenant-management authorization.

## Related Components
- [organizations](../organizations/README.md) - Users belong to organizations via memberships and current lineage context
