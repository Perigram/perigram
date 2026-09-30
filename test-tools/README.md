# CODE: Test Tools

The page SSR smoke harness: real page SFCs mounted through
`vue/server-renderer` outside Nuxt, with the Nuxt auto-import globals
(`$fetch`, `useAuthStore`, `definePageMeta`, `#app`) stubbed.

- `nuxt-app-stubs.mjs` — the `#app`/`#imports` specifier stubs.
- `*.ssr-smoke.js` — page smoke cases (named outside the default
  `*.spec.js` glob so the normal suite does not pick them up).
- Run with `npx vitest run --config vitest.ssr.config.js` from the repo
  root (see the root README development section).

Why it exists: script-only identifier checks and composable behavior tests
cannot see a setup binding that a template still references, or a computed
that explodes inside a rarely-rendered tab. Rendering the whole page to
string catches both before they ship as a runtime 500. The stubs are
deliberately minimal — the page's real composables, registry projection,
and component tree all execute; only the Nuxt runtime shell is faked.

Parent: [root README](../../README.md).
