# AGENTS.md

Architecture constraints for Cutkit-Demo (Nuxt.js 3 + Vue 3 + MongoDB).

## Stack

- Nuxt.js 3 SSR (frontend + backend)
- MongoDB with Mongoose
- Tailwind CSS
- Session-based auth (cookies) + OAuth (GitHub/Google)
- Python workers for CPU-intensive tasks

## Structure

- `components/` - Vue components
- `pages/` - Nuxt pages (routing)
- `layouts/` - Vue layouts
- `server/api/` - API endpoints (auth, files, nest, payment, project, user)
- `composables/` - State management (authStore, filesStore, etc.)
- `server/middleware/auth.js` - Server auth middleware (all API requests)
- `middleware/auth.js` - Client route protection
- `workers/` - Python workers (fileprocessing, nesting)

## Patterns

**API calls:** Use `useFetch` or `$fetch` from frontend to `/api/*` endpoints

**Auth:** Session-based. Server middleware adds user to request context. Client middleware protects routes.

**State:** Composables in `composables/` using `reactive()` + `computed()` + `readonly()` pattern (like Pinia).
