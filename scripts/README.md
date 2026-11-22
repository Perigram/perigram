# COMPONENT: Project Scripts

Project maintenance scripts for architecture checks, seed data, diagnostics,
and local debugging. These scripts run outside Nuxt page/component resolution,
so imports should be direct package names or filesystem-relative paths unless a
script explicitly installs its own resolver.

Vitest uses the shared alias map from `vitest.config.js` and loads
`@vitejs/plugin-vue`, so focused specs may import Vue SFCs directly when they
stub Nuxt/PrimeVue app plugins that are not active in the node test runner.

## Core Files

- `build-icon-fonts.js`: Builds the app's icon fonts and syncs each
  generated CSS block into `assets/css/main.css`. Two families, one font,
  one marker block each:
  - `ck-entity-icons` from the hand-drawn CNC domain SVGs in
    `public/icons/data-model/cnc-domain/` (24-grid sources; the
    owner-authored icon family — treat them as authored assets, never
    as orphaned files), fonts in
    `public/fonts/cnc-domain/`;
  - `ck-file-type-icons` from `public/icons/file-types/`, fonts in
    `public/fonts/file-types/` — one source per mounted-pack CTS file
    type, named by type id. Sources are Google Material Symbols Outlined
    SVGs (Apache-2.0), the "Material Outline" style whose icons8 CDN
    serving is PNG-with-attribution only (SVG is paid), so the upstream
    Google sources are vendored instead. Type → icon: image→image,
    pdf-document→picture_as_pdf, text-document→description,
    csv-table→table, xlsx-workbook→table_chart, docx-document→article,
    pen-template→edit, color→palette, dxf-source→architecture,
    svg-file→polyline, layer-standard→layers, sketch→draw. New sources
    must land on the plain 24 grid (`viewBox="0 0 24 24"`, absolute
    leading `M`): the stock Material Symbols 960-unit shifted viewBox
    with a leading relative `m` corrupts the build.
  Both build via fantasticon and rewrite their `/* <font>:start */` block
  in `assets/css/main.css`, so icon codepoints never drift from the class
  definitions, and rewrite the marker block in
  `shared/icon-fonts.js` — the generated authoring palette listing every
  glyph class string the families offer (the process designer's
  declaration glyph row consumes it; glyph vocabulary never requires a
  pack type of its own). The script also generates
  `shared/primeicons.js` from `node_modules/primeicons/raw-svg`; that
  list is the other half of the declaration glyph picker's searchable
  palette. `--palette-only` refreshes the PrimeIcons list without
  rebuilding the fonts. The consumers are type `glyph` declarations: the packs'
  file types carry `ck-file-type-icon ck-file-type-icon-<typeId>`, and
  the facade plugin's listing (`workers/facade/listing.json`) carries
  `ck-entity-icon ck-entity-icon-<name>` — both consumed exactly like a
  `pi pi-*` PrimeIcon string. `shared/icon-fonts.spec.js` guards the
  listing-side drift: every `ck-*` glyph class a documents/tech-drawing
  listing declares must
  resolve in the generated CSS. Run as `npm run icons:build` after adding
  or editing source SVGs — nothing outside the marked CSS blocks is
  hand-editable (hand-written rules parked inside the markers are deleted
  on rebuild).
- `check-arch.js`: Architecture guardrail for backend features, API layer
  boundaries, canonical DTO blocks, command/task/status/UI boundary leaks,
  retired vocabulary, portable-runtime import rules, concrete CNC domain leaks
  in generic modules, concrete
  entity-name branches in `@perigram/processes`, runtime legacy-process bridges,
  cross-feature repository imports, and source-assertion test practices. Every
  finding is blocking; there is no non-blocking migration inventory. Entity
  registry entries marked `instanceService: true` resolve through the generic
  instance feature (`server/features/instances`) and declare no feature
  directory of their own; the guard skips their feature-directory checks.
- `check-plugin-deps.js`: Plugin executor dependency guard (`npm run
  plugin-deps:check`). A plugin's executor image installs from the plugin's
  own `workers/<plugin>/package.json` (`workers/plugin-executor.Dockerfile`),
  so every bare import the plugin's code carries must be declared there —
  undeclared imports run on dev boxes (the root `node_modules` bleeds through
  the bind mount) and die on a hosted executor. The guard scans each
  `workers/<plugin>` (spec files excluded, `assets`/`surfaces` skipped) and
  fails naming the plugin and the missing specifier.
- `check-agent-scope.js`: Diff guard comparing committed, staged, unstaged, and untracked files against a glob allowlist file. Two allowlists exist:
  `.agents/app-layer.allowlist` for top-layer composition agents
  (default-deny — surfaces are added by the repository owner), and
  `.agents/design-layer.allowlist` for design-scoped contributors
  (see Guardrail Scope).
- `check-docs.js`: Documentation integrity guardrail for the README tree. It
  fails on broken internal markdown links (relative targets that do not resolve
  to an existing file) and on duplicated canonical-contract passages — both
  verbatim paragraphs and fenced code blocks of meaningful length repeated
  across more than one README. Vendored and submodule trees leave the scan;
  a link into a submodule resolves by its pinned commit. Canonical contracts
  and examples must live in a
  single canonical README and be linked, not restated. It also reports an
  advisory contract-homing backlog: long, normative code comments that state
  authoring/compilation semantics without citing a canonical home (a README or
  a SPEC section). Advisory findings do not fail the guard; each is resolved
  by moving the contract into its owning README (leaving the comment as a
  pointer) or consciously keeping it as tracked debt. Run as
  `npm run docs:validate`.
- `docs-map.js`: README tree map printer (`npm run docs:map`). Whole-tree
  mode prints every README's H1, H2s, and outbound markdown links;
  `--near <path>` prints one README's outline plus its outbound and inbound
  links (the contract neighborhood for task scoping). Walking and link
  parsing import from `check-docs.js`, so the map and the guard share one
  tree definition.
- `framework-inspect-lib.js`: pure read-only projections and validators used by the framework inspection CLI; this is app tooling, not an independently reusable framework package.
- `mcp-handlers.js`: read-only MCP transport handlers used by the local inspection smoke command; this is an application adapter, not a framework package.
- `framework-inspect.js`: builds `framework.manifest.json` from the live
  framework declarations. `npm run framework:write-manifest` writes the
  committed copy, `npm run framework:manifest` checks it, `npm run
  framework:validate` runs definitions, architecture, and UI-contract
  validation, and the `framework:list-*` scripts print live inventories
  (entities, workflows, routes, commands, UI primitives).
- `ui-visual-inventory.js`: Derives per-file visual findings through its
  `analyzeVueVisuals(file, source)` export. It classifies typography, arbitrary layout,
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
`#packages/...`, `#utils/...`, `#workers/...`) so direct Node loaders and
Nuxt/Nitro SSR builds resolve the same graph.
Entity feature directories are derived from domain entity metadata — the
feature key is the entity type id plus `s`; the single irregular alias
(`entity-revisions` → `instance-revisions`) rides
`FEATURE_DIRECTORY_ALIASES` in `check-arch.js`.
Non-entity capability directories must be added to the explicit capability list
in `check-arch.js` and documented in `server/features/README.md`.

The checker also blocks live entity UI that passes local `:state-actions` —
workflow actions come from the server-provided `InstanceState`.

The SPEC §8 species purity seam (value services are pure V→V; a `ref`
input is the projection's job) lives in the
[plugin SDK's listing contract](../packages/plugin-sdk/README.md):
`parseListing` rejects `ref` inputs on service signatures, and
service-resolved projections carry the compute to the executors.

`npm run agent:scope-check -- --base origin/local` is the mandatory guard for
external top-layer agents before they commit or push. It is intentionally
allowlist-based: new composition surfaces must be added to
`.agents/app-layer.allowlist` by the repository owner.

`npm run design:scope-check -- --base origin/local` is the same guard bound
to `.agents/design-layer.allowlist` — the designer write surface; the
allowlist file is the canonical list of design-scoped paths. `local` is the
owner's personal trunk with no branch protection: the owner performs every
merge personally, and this guard is the review verdict on a designer's
branch, not an access wall. Run it from the primary checkout on the
designer's branch, or let `.forgejo/workflows/design-scope.yml` produce the
same verdict on pull requests authored by a login in its `DESIGNER_LOGINS`
env (PRs from other authors pass through). Onboarding a designer is
replacing the `designer-placeholder` login in the workflow; repository
access stays the owner's choice (a fork with pull requests gives zero
write access), since every merge is the owner's anyway.

`npm run docs:validate` is the mandatory documentation guardrail. It resolves
every internal relative link in the README tree against the repository and
flags verbatim paragraphs that appear in more than one README, so each
canonical contract stays in exactly one file.

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
