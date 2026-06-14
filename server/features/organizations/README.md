# COMPONENT: Organizations

Multi-tenant organization management with type-specific settings.

## Core Files
- `repository.js`: Database operations on `organizations` collection
- `service.js`: Business logic, type validation, permissions
- API endpoints in `server/api/organizations/`

## Data Structure
Collection: `organizations`

Key fields:
- `type`: "Manufacturer" | "Contractor" | "Customer" | "ServiceProvider"
- `settings`: Type-specific object (contractor.canCut, contractor.balance, etc.)

## ID Handling
- Organization `_id` values may be Mongo ObjectIds or string UIDs such as `org-xxxxxxxx`.
- Repository lookups use `toFlexibleId()` for `findById`, `updateById`, `deleteById`, and `findByIds` so auth middleware can resolve `user.organizationId` without assuming ObjectId format.

## Access Control
- Organization access is grant-based through `organizations` permissions.
- `write` can create/update organization records.
- `admin` can delete organization records.
- List queries are scoped by membership lineage.
- `createInitialForUser()` is the narrow public-signup helper. It creates the
  first organization for a newly registered user, assigns the type-specific
  admin role, and writes the user's initial membership/lineage.

## API Behavior
- `GET /api/organizations/:id` returns the serialized organization when found.
- Missing organizations return 404 instead of attempting to serialize `null`.

## Related Components
- [users](../users/README.md) - Users belong to organizations
