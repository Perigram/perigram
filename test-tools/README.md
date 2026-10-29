# CODE: Test Tools

The page SSR smoke harness: real page SFCs mounted through
`vue/server-renderer` outside Nuxt, with the Nuxt auto-import globals
(`$fetch`, `definePageMeta`, `#app`/`#imports`) stubbed.

- `nuxt-app-stubs.mjs` — the `#app`/`#imports` specifier stubs.
- `*.ssr-smoke.js` — smoke cases (named outside the default
  `*.spec.js` glob so the normal suite does not pick them up): whole
  pages (`chats-page`, `process-page`, `screens-page`,
  `ui-mapping-page` — each boots an assembled surface),
  `ui-mapping-refcolumns.ssr-smoke.js` for the generated collection
  columns over the SPEC §6 relation grammar (ref-field chip column,
  structural summary column, the table floor for identifier-only types),
  `ui-mapping-relation-actions.ssr-smoke.js` for the SPEC §22.12
  placement law (no link on class lists, section link toolbar, row
  unlink menus, children sections on the record detail), and
  `chat-content.ssr-smoke.js` for the chat content components (message
  body modes, attached refs, the agent chronology, the inline-ref chip
  branches).
- `facade-plugin.js` — shapes the facade plugin listing
  (`workers/facade/listing.json`) for the specs and e2e fixtures that
  seed registries, projections, and demo processes.
- `fixture-surface-plugin.js` — the fixture plugin whose editor and
  preview surfaces exercise the whole plugin-surface mount path
  (publish, install, endpoint-resolved module URL, loader, host
  context, persistence callbacks) with zero app-side code for its
  surfaces.
- Run with `npx vitest run --config vitest.ssr.config.js` from the repo
  root (see the root README development section).

Why it exists: script-only identifier checks and composable behavior tests
cannot see a setup binding that a template still references, or a computed
that explodes inside a rarely-rendered tab. Rendering the whole page to
string catches both before they ship as a runtime 500. The stubs are
deliberately minimal — the page's real composables, registry projection,
and component tree all execute; only the Nuxt runtime shell is faked.

Parent: [root README](../README.md).
