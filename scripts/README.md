# COMPONENT: Project Scripts

Project maintenance scripts for architecture checks, seed data, diagnostics,
and local debugging. These scripts run outside Nuxt page/component resolution,
so imports should be direct package names or filesystem-relative paths unless a
script explicitly installs its own resolver.

Vitest uses the shared alias map from `vitest.config.js` and loads
`@vitejs/plugin-vue`, so focused specs may import Vue SFCs directly when they
stub Nuxt/PrimeVue app plugins that are not active in the node test runner.

## Core Files

- `build-entity-icons.js`: Builds the `ck-entity-icons` font from the CNC
  domain SVGs in `public/icons/data-model/cnc-domain/` via fantasticon,
  writes `public/fonts/cnc-domain/ck-entity-icons.{woff2,ttf}`, and rewrites
  the marked `ck-entity-icons` block in `assets/css/main.css` so icon
  codepoints never drift from the class definitions. Run as
  `npm run icons:build` after adding or editing source SVGs.
- `check-arch.js`: Architecture guardrail for v24 backend features, API layer
  boundaries, canonical DTO blocks, command/task/status/UI boundary leaks,
  retired vocabulary, portable-runtime import rules, concrete CNC domain leaks
  in generic modules, duplicate object keys in domain registries, concrete
  entity-name branches in `@perigram/processes`, runtime legacy-process bridges,
  cross-feature repository imports, and source-assertion test practices. Every
  finding is blocking; there is no non-blocking migration inventory. Entity
  registry entries marked `instanceService: true` resolve through the generic
  instance feature (`server/features/instances`) and declare no feature
  directory of their own; the guard skips their feature-directory checks.
- `check-agent-scope.js`: Diff guard for top-layer composition agents. It
  compares committed, staged, unstaged, and untracked files against
  `.agents/app-layer.allowlist` and fails if an agent touched core/runtime/shared
  paths outside the allowed app-layer surface.
- `check-docs.js`: Documentation integrity guardrail for the README tree. It
  fails on broken internal markdown links (relative targets that do not resolve
  to an existing file) and on duplicated canonical-contract passages — both
  verbatim paragraphs and fenced code blocks of meaningful length repeated
  across more than one README. Canonical contracts and examples must live in a
  single canonical README and be linked, not restated. It also reports an
  advisory contract-homing backlog: long, normative code comments that state
  authoring/compilation semantics without citing a canonical home (a README or
  a SPEC section). Advisory findings do not fail the guard; each is resolved
  by moving the contract into its owning README (leaving the comment as a
  pointer) or consciously keeping it as tracked debt. Run as
  `npm run docs:validate`.
- `framework-inspect.js`: Framework/package inspection utility used during
  extraction checks.
- `ui-visual-inventory.js`: Derives the canonical Vue visual inventory from
  current source and rewrites the component matrix in
  `docs/UI_COMPONENT_AUDIT.md`. It classifies typography, arbitrary layout,
  chrome, state, important-override, scoped-style, inline-style, and render-style
  findings
  under the same dispositions consumed by `shared/design-system.spec.js`.
  Inline exceptions are exact file/category/binding-expression entries, so
  adding or changing a binding requires explicit classification.
  Template findings are extracted from `class` and `:class` values so PrimeVue
  boolean props such as `rounded` are not mistaken for utility styling.
  Render-function style bindings are replacement debt rather than an enforcement
  bypass. Utility classes assembled in Vue script string literals are classified
  with template utilities, so moving visual ownership into script does not bypass
  the inventory. Component
  ownership is derived from the domain primitive registry: exact registered
  paths are shared/domain primitives and every other Vue file is derived usage.
- `migrate-status-state-v2.js` (root): One-shot legacy status migration.
  Converts string `status.state` / `origin.state` values and `status_events`
  records to the v2 structured status shape. Supports `--dry-run`.
- One-shot migrations, seeds, and repair helpers under `server/scripts/`
  (tech-drawing instance migration, §3 tenancy, state-tree flattening,
  CutKit→Perigram rename, call-channel unification, owner admins, and the
  rest) are documented in their canonical home:
  [server/scripts/README.md](../server/scripts/README.md).
- `test-*.js`, `debug_*.js`: Manual diagnostics for local database, auth,
  and data-shape investigations.

## Guardrail Scope

`check-arch.js` is the mandatory backend architecture check. It validates
server feature structure against `server/features/_template/README.md`, keeps
repositories/services/API routes on their assigned layers, rejects Nuxt
root-alias imports inside portable runtime modules under `shared/`,
`test-data/`, and `packages/`, rejects parent-relative cross-root imports
from `shared/` and non-spec `test-data/` modules, and verifies every relative
dynamic `import()` under `server/` resolves to a real file (a bad relative
specifier passes vite-node until its code path runs but fails the whole Nitro
bundle, which serves 503 on every route). Cross-root portable imports
should use the package imports declared in `package.json` (`#shared/...`,
`#packages/...`, `#utils/...`) so direct Node loaders and Nuxt/Nitro SSR builds
resolve the same graph.
Entity feature directories are derived from domain entity metadata. Use an
explicit `feature` field on a domain entity when English pluralization is
irregular, such as `library -> libraries`; do not add script-local exceptions.
Non-entity capability directories must be added to the explicit capability list
in `check-arch.js` and documented in `server/features/README.md`.

The checker also blocks live entity UI that passes local `:state-actions`
instead of relying on server-provided `InstanceState` workflow actions.

`npm run agent:scope-check -- --base origin/local` is the mandatory guard for
external top-layer agents before they commit or push. It is intentionally
allowlist-based: new composition surfaces must be added to
`.agents/app-layer.allowlist` by the repository owner instead of letting the
agent edit core files ad hoc.

`npm run docs:validate` is the mandatory documentation guardrail. It resolves
every internal relative link in the README tree against the repository and
flags verbatim paragraphs that appear in more than one README, so canonical
contracts stay in one canonical file instead of being restated in several.

`npx vitest run shared/design-system.spec.js` enforces the PrimeVue-first visual
boundary. It rejects raw font-size, weight, line-height, tracking, and family
utilities outside the eight semantic typography aliases, raw palette/surface borders,
nonsemantic radii and shadows, non-allowlisted scoped CSS, duplicated runtime
theme overrides, direct global PrimeVue selectors or variable declarations,
`!important` runtime rules, and global focus suppression. It also reconciles source-derived
visual concern counts with the canonical audit. Token-backed aliases such as
`bg-content`, `rounded-ui`, `shadow-card`, and `shadow-overlay` are consumers of
Aura/application tokens, not generic chrome overrides. Scoped-style exceptions name one
exact category per file; every exception category is limited to an exact set of
properties rather than granting whole-file visual ownership. Aura-owned padding
is excluded from general layout exceptions. Allowlisted inline style bindings
pin their exact file, visual category, and normalized binding expressions;
every other inline or render-function style is recorded as replacement debt and
must move to PrimeVue or declarative classified contracts.
Reusable layout and derived semantic composition are compliant application
usage; only data-driven visuals are narrowly allowlisted. None of
these categories may own generic component chrome or states.

## Related

- [root system README](../README.md) - Project-wide commands and container map.
- [backend feature template](../server/features/_template/README.md) - Golden
  path enforced for server feature modules.
