# COMPONENT: API Endpoints

This directory contains the Nitro server API routes for the Nuxt application. Endpoints are organized by resource and use file-based routing.

## Structure
Routes are grouped into sub-directories corresponding to features:
- `artifacts/`: CRUD and streaming for generated files.
- `batch/`: Detailed batch operations.
- `cassettes/`: Upload and management of templates.
- `project/`: Main project orchestration and nesting triggers.
- `user/`: Profile and credit management.

## Conventions
- **Method Suffixes:** Files are named `[action].[method].js` (e.g., `index.get.js`, `create.post.js`).
- **Thin Wrappers:** API handlers should be minimal, delegating all business logic to the corresponding [Server Features](../features/NEOLIT.md).
- **Authentication:** Most routes require authentication, which is handled by the `server/middleware/auth.js`. The user ID is accessible via `event.context.auth.userId`.

## Example Handler
```javascript
export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  if (!userId) throw createError({ statusCode: 401 });
  
  const body = await readBody(event);
  return await service.create(body, userId);
});
```
