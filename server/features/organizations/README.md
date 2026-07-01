# COMPONENT: Organizations

Multi-tenant organization management. Organization records are abstract tenant
roots; runtime behavior comes from the active process definition linked from
organization data, not from hardcoded organization type branches.

## Core Files
- `repository.js`: Database operations on `organizations` collection
- `service.js`: Business logic, type validation, permissions
- API endpoints in `server/api/organizations/`

## Data Structure
Collection: `organizations`

Key fields:
- `processTemplateId`: Starter process id used at creation time.
- `activeProcessDefinitionId`: Active compiled process definition id.
- `settings`: Organization settings that are not role/type branches.

## ID Handling
- Organization `_id` values may be Mongo ObjectIds or string UIDs such as `org-xxxxxxxx`.
- Repository lookups use `toFlexibleId()` for `findById`, `updateById`, `deleteById`, and `findByIds` so auth middleware can resolve `user.organizationId` without assuming ObjectId format.

## Access Control
- Organization access is grant-based through `organizations` permissions.
- `write` can create/update organization records.
- `admin` can delete organization records.
- List queries are scoped by membership lineage.
- Organization account UI is exposed as a system generated screen during auth
  hydration, not as hardcoded page buttons. `system-screens.js` emits the
  `/organization` screen with localized label keys, billing regions when the
  caller has `organizations:read`, checkout/process actions when the caller has
  `organizations:admin`, and team-management actions when the caller has
  `users:admin`. When an active process exists, those checks use the compiled
  effective permissions.
- `createInitialForUser()` is the narrow public-signup helper. It creates the
  first organization for a newly registered user, creates and activates a
  starter process definition, assigns the creator to the process admin role,
  and writes the user's initial membership/lineage. The creator membership
  stores explicit `organizations:admin` and `users:admin` grants so tenant
  management remains reachable even if the active process graph later removes
  operational organization screens. Active process assignments provide runtime
  app access.

## API Behavior
- `GET /api/organizations/:id` returns the serialized organization when found.
- Missing organizations return 404 instead of attempting to serialize `null`.
- Organization billing is exposed under `/api/organizations/:id/billing/*`.
  The active organization owns its prepaid token account, invoices, payment
  errors, and ledger entries. User profiles do not contain spendable credit
  balances.

## Related Components
- [users](../users/README.md) - Users belong to organizations
