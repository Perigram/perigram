# COMPONENT: Users

User authentication and permission management.

## Core Files
- `repository.js`: Database operations on `users` collection
- `service.js`: Register, login, permission management
- `permission-templates.js`: Default permissions by role
- API endpoints in `server/api/auth/` and `server/api/users/`

## Data Structure
Collection: `users`

Key fields:
- `passwordHash`: Argon2id
- `role`: SuperAdmin, ManufacturerAdmin, ContractorAdmin, CustomerAdmin, IndividualUser
- `permissions`: Per-entity access levels (none/read/write/admin)
- `restrictedTo`: Optional entity ID restrictions for IndividualUser
- `sessions`: Array of session objects

## Authentication Flow
1. Login → Verify password → Generate session + JWT
2. Session stored in cookie (30 days)
3. JWT in Authorization header (15 min expiry)
4. Middleware populates event.context.auth

## Permission System
- Permission levels: none < read < write < admin
- Checked via hasPermission(user, entity, level)
- Filtered by organizationId in queries

## Related Components
- [organizations](../organizations/NEOLIT.md) - Users belong to organizations
