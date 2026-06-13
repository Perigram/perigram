# COMPONENT: API Endpoints

This directory contains the Nitro server API routes for the Nuxt application. Endpoints are organized by resource and use file-based routing.

## Structure
Routes are grouped into sub-directories corresponding to features:
- `artifacts/`: Metadata, deletion, and streaming for generated files.
- `batch/`: Detailed batch operations.
- `cassette-instances/`: Authenticated cassette instance listing, detail, and status routes.
- `cassettes/`: Upload and management of templates.
- `commands/`: Authenticated execution route for declared domain commands such
  as `saveCassetteTemplate` and `generateAttachment`.
- `tasks/`: Worker task queue protocol for claim, heartbeat, complete,
  fail, and cancel.
- `admin/commands/`: Authenticated command definition and run listing for
  `command_runs`.
- `config-bot/`: Admin draft generation, chat, and session routes for
  ConfigBot v0.1.
- `geometry-captures/`: Authenticated photo-to-polygon capture CRUD,
  preset-based recalculation, revision activation, review confirmation, and
  worker-result callback.
- `admin/config-bot/`: Admin knowledge reindex route for ConfigBot.
- `admin/tasks/`: Authenticated task definition and run listing for
  `task_runs`.
- `project/`: Main project orchestration and nesting triggers.
- `sheet-designs/`: Lineage-scoped sheet design list/detail and direct DXF
  export.
- `user/`: Profile and credit management.

## Conventions
- **Method Suffixes:** Files are named `[action].[method].js` (e.g., `index.get.js`, `create.post.js`).
- **Thin Wrappers:** API handlers should be minimal, delegating all business logic to the corresponding [Server Features](../features/README.md).
## Authentication
Most routes require authentication, which is handled by `server/middleware/auth.js`.
Responsibilities:
- Runs on ALL requests.
- Reads `sessionId` from cookies.
- Fetches user from the database.
- Attaches session info: `event.context.auth = { userId, isAdmin }`.

`auth/login.post.js` sets the `sessionId` cookie after password login. The cookie
is secure in production by default, but `SESSION_COOKIE_SECURE=false` can be set
for plain HTTP LAN deployments so browsers keep the session cookie.

## Example Handler
```javascript
export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  if (!userId) throw createError({ statusCode: 401 });
  
  const body = await readBody(event);
  return await service.create(body, userId);
});
```
