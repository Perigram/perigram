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

## Access Control
- SuperAdmin: Full CRUD on all organizations
- Org Admins: Read/Update own organization only
- Individual Users: No direct access

## Related Components
- [users](../users/README.md) - Users belong to organizations
