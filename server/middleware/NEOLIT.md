# CODE: Server Middleware

Middleware functions that run before every API request handling.

## Files
- `auth.js`: Handles authentication and context population.
- `log-requests.js`: Request logging for debugging.

## Auth Middleware (`auth.js`)
Parses JWT tokens or Session cookies to authenticate the user.

### Logic
1. Checks `Authorization: Bearer <token>` header (JWT).
2. Fallback to `sessionId` cookie.
3. Fetches fresh user data from DB.
4. Populates `event.context.auth` with:
    - `userId`
    - `role`
    - `permissions`
    - `organizationId`
    - `organizationData`: `{ _id, name, type }` (Crucial for service-level permission checks)
