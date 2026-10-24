# CODE: Server Middleware

Middleware functions that run before every API request handler.

## Files

- `auth.js`: authentication and auth-context population.
- `idempotency.js`: `Idempotency-Key` pre-check for mutating `/api/**`
  requests (contract: [core/idempotency](../core/idempotency/README.md)).
- `log-requests.js`: request logging for debugging.
- `tracking.ts`: sets the anonymous tracking cookie.

## Auth Middleware (`auth.js`)

Authenticates the user via JWT bearer token or session cookie.

1. Verifies `Authorization: Bearer <token>` (`verifyAccessToken`) and loads
   the user by the token's `userId` payload.
2. Falls back to the `sessionId` cookie (`getUserBySessionId`).
3. Builds the canonical auth context (`usersService.buildAuthContext`),
   attaches organization data, and widens the context through
   `resolveProcessAuth` into `event.context.auth` — see
   [server/utils/README.md](../utils/README.md#auth-context-object) for the
   exact shape.
