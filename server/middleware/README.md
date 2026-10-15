# CODE: Server Middleware

Middleware functions that run before every API request handling.

## Files
- `auth.js`: Handles authentication and context population.
- `log-requests.js`: Request logging for debugging.

## Auth Middleware (`auth.js`)
Parses JWT tokens, bot tokens, or session cookies to authenticate the user.

### Logic
1. Checks `Authorization: Bearer <token>` header (JWT).
1b. A JWT verify failure on a `pb_…` token is a bot-token lookup
   (SHA-256 hash against `data.bot.tokenHash`) instead.
2. Fallback to `sessionId` cookie.
3. Fetches fresh user data from DB.
4. Populates `event.context.auth` with the canonical auth context (userId, memberships, role, restrictedTo) — assembled through `usersService.buildAuthContext` — widened by `resolveProcessAuth`. See [server/utils/README.md](../utils/README.md#auth-context-object) for the exact shape.
