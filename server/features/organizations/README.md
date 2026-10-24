# COMPONENT: Organizations

Multi-tenant organization management. Organization records are abstract tenant
roots; runtime behavior comes from the active process definitions
compiled per organization.

Parent: [server/features](../README.md).

## Core Files
- `repository.js`: Database operations on `organizations` collection
- `service.js`: Business logic, type validation, permissions
- API endpoints in `server/api/organizations/`

The registered organization instance service exposes
`getProcessConfiguration(id)` for the process-definition feature (auth
hydration and activation read organization configuration through it).
Process features reach organizations through this boundary, keeping the
organization repository feature-internal.

## Data Structure
Collection: `organizations`
The process plane reads organizations through the registered party
bindings (`server/runtime/party-wire.js`): the §3 wire shape, readable by
members only. Organizations are readable principals on the process
plane; every mutation stays on the feature routes below.

Key fields:
- `roles`: Stable role identity record `{ [roleId]: { id, label, exclusive?, agentChat? } }`.
  A role marked `exclusive` is single-seat: exactly one member holds it
  at a time, and assigning it MOVES the seat — the previous holder keeps
  their other roles, and an emptied assignment row disappears. The move
  runs at the one assignment write seam (`repository.setRoleAssignment`),
  so every path (signup, invitations, the org API) enforces it
  identically. Turning exclusivity on is refused with the holder list
  while more than one member holds the role; turning it off is free. A
  role marked `agentChat` grants its holders the organization AI's chat
  surfaces (see [agent bots](../agent-bots/README.md)) —
  `canUseAgentChats(organizationId, userId)` is the one check every AI
  gate reads; members without a flagged role see no AI at all.

Activation is additive: the active definition set is queried from the
process-definitions collection ([process-definitions](../process-definitions/README.md)).
- `roleAssignments`: Authoritative user mapping
  `{ [userId]: { userId, roleIds, bindings } }`.
- `settings`: Organization settings outside the role/type planes.

## ID Handling
- Organization `_id` values may be Mongo ObjectIds or string UIDs such as `org-xxxxxxxx`.
- Repository lookups use `toFlexibleId()` for `findById`, `updateById`, `deleteById`, and `findByIds` so auth middleware can resolve `user.organizationId` without assuming ObjectId format.

## Access Control
- Organization access is grant-based through `organizations` permissions.
- `write` can create/update organization records.
- `admin` can delete organization records.
- List queries are scoped by membership lineage.
- `directorySearch(query, limit)` is the one cross-tenant read: it matches
  organizations by name for the [directory feature](../directory/README.md),
  which owns the directory card projection; ordinary list queries stay
  membership-scoped.
- Every organization must retain at least one active owner membership. The
  organization creator receives `membership.owner: true` plus permanent
  `organizations:admin` and `users:admin` grants. Process roles may change
  operational access, but they must not remove or weaken this tenant owner
  recovery authority. Owner recovery grants are membership state and are not
  organization role capabilities.
- Organization management UI is exposed as system generated screens during auth
  hydration, not as hardcoded page buttons. `system-screens.js` emits an
  overview screen at `/organization`, a billing screen at
  `/organization/billing` when the caller has `organizations:read`, a
  partners screen at `/organization/partners` when the caller has
  `organizations:read` (see
  [partnerships](../partnerships/README.md)), a plugins route screen at
  `/organization/plugins` under the same `organizations:read` gate
  (the installed-plugin management surface — see
  [plugins](../plugins/README.md)), a team
  route screen at `/organization/users` when the caller has `users:admin`,
  an AI models route screen at `/organization/models` under the same gate
  (provider administration — see
  [LLM](../llm/README.md)), and
  a process-designer route screen at `/organization/process` when the caller
  has `organizations:admin`. Billing checkout remains an action on the billing
  screen and requires `organizations:admin`. When an active process exists,
  those checks use the compiled effective permissions.
- `createInitialForUser()` is the narrow public-signup helper. It creates the
  first organization for a newly registered user, seeds the organization's
  `role_admin` identity and creator assignment, creates and activates the
  organization's starter process (the installed plugins' starter constructs —
  see
  [process definitions](../process-definitions/README.md)), and writes the
  user's initial owner
  membership/lineage. The creator
  membership stores explicit `organizations:admin` and `users:admin` grants so
  tenant management remains reachable even if the active process graph later
  removes operational organization screens. Active process assignments provide
  runtime app access.

## Organization role API

Role identity management is immediate and independent of process draft Save or
Apply. `GET/POST /api/organizations/:id/roles` lists and creates identities
(creation accepts `exclusive: true` for a single-seat role and
`agentChat: true` for the AI-chat capability);
`PATCH /api/organizations/:id/roles/:roleId` renames and/or flips the
`exclusive` or `agentChat` flags (on is refused with holder data while
multiple members hold the role); `DELETE /api/organizations/:id/roles/:roleId` deletes them.
Role ids are immutable and generated server-side. Deletion is rejected while a
role is referenced by an organization assignment, active invitation, active
process, or draft process. Archived compiled process history is exempt.
`GET /api/organizations/:id/role-assignments` and
`PATCH /api/organizations/:id/role-assignments/:userId` manage authoritative
assignments without recompiling a process (single-seat roles move on write,
see the data structure above).

## API Behavior
- `GET /api/organizations/:id` returns the serialized organization when found.
- A missing organization returns 404.
- Organization billing is exposed under `/api/organizations/:id/billing/*`.
  The active organization owns its prepaid token account, invoices, payment
  errors, and ledger entries; user profiles carry no spendable balances.

## Related Components
- [users](../users/README.md) - Users belong to organizations
