# Perigram Demo

Process programming platform demo: organizations author typed CTS
declarations, the process compiler turns process graphs into runtime
contracts, and generic instance services run every declared type. Nuxt/Nitro
modular monolith + MongoDB + a FastAPI nesting worker + self-hosted LiveKit.
Facade fabrication is the exercised domain pack.

Docs model (see AGENTS.md): `SPEC.md` is desired state (human-authored),
`TODO.md` is the operational delta, READMEs describe real architecture only.

## Commands

```bash
npm install
npx vitest run shared/framework-packages.spec.js shared/design-system.spec.js
npx vitest run --config vitest.ssr.config.js   # SSR smoke, needs .nuxt (npx nuxi prepare in fresh worktrees)
node scripts/check-arch.js                      # architecture guard
npm run framework:validate                      # definitions + arch + UI contracts
E2E_BASE_URL=http://localhost:3000 npm run test:e2e   # stack must be running
```

Do not run `npm run build` or start dev servers from agent tasks unless a
human asks.

## Operational facts

- Global stylesheets ride `plugins/global-styles.js`, never the Nuxt `css:`
  array (vite builder drops css-array entries in production browsers).
- Dev compose: `node_modules` is a container volume (reinstall inside the
  container); the container writes `.nuxt` as root (chown once if host tools
  need it); network is external `perigram-network`.
- Agent session worktrees live under `.agent-worktrees/` (+ `.agent-wt*`
  scratch); `nuxt.config.js` excludes them from scanning and watchers.
- Server-side `xlsx` imports must target `xlsx/xlsx.mjs` (CJS main breaks
  nitro externalization).
- PWA: hand-rolled `public/sw.js` registered in production only; offline
  mutations queue in an IndexedDB outbox and replay with `Idempotency-Key`
  (server/core/idempotency).
- E2E assumes the app stack is already running and uses Playwright against
  `E2E_BASE_URL`.
