# COMPONENT: Route Middleware

Nuxt route middleware for browser-facing page access.

## Auth Middleware

`auth.js` protects pages that declare `middleware: 'auth'`.

- Skips `/` because `pages/index.vue` owns the landing redirect.
- Allows `/auth/*` and `/invitation/*` when the user is not authenticated.
- On direct SSR page loads, forwards the incoming `cookie` header into the auth
  store fetches so `/api/auth/me` can see the existing session.
- Redirects unauthenticated protected routes to `/`.

Related server-side request authentication lives in
[`server/middleware/auth.js`](../server/middleware/auth.js).
