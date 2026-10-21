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
  pack type of its own). The consumers are type `glyph` declarations: the packs'
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
- `migrate-llm-settings-profiles.js`: one-way rewrite of the retired
  single-provider `data.settings.llm` shape into named profiles with
  capability routing (`{ provider, baseUrl, model, apiKey? }` becomes
  profile `default` routed to `chat`; orgs already on profiles are
  skipped). Run once after deploying the profiles contract.
- `migrate-retire-custom-bots.js`: one-way retirement of the created-bots
  scheme (owner direction 2026-10-16) — deletes custom bot members and
  their subscriptions, removes them from role assignments and group
  participants, strips the retired `tokenHash`/`profile` bot-marker
  fields from the remaining per-org assistants, and drops subscription
  rows of group rooms deleted before deletion cleaned up after itself.
  Run once after deploying the delegation scheme.
- `retire-process-runs.js`: drops the retired process execution record
  collections (`execution_runs`, `execution_step_invocations`,
  `execution_waits`, `execution_outputs`, `execution_steps`,
  `execution_receipts`). Run once after deploying the in-process action
  evaluation.
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
- `check-agent-scope.js`: Diff guard comparing committed, staged, unstaged,
  and untracked files against a glob allowlist file. Two allowlists exist:
  `.agents/app-layer.allowlist` for top-layer composition agents
  (default-deny — surfaces are added by the repository owner), and
  `.agents/design-layer.allowlist` for design-scoped contributors
  (see Guardrail Scope).
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
- `station-documents-types.js`: Operator tool that stations the mounted
  packs' starter constructs (the documents pack's markdown-first set,
  `packages/documents/src/index.js`) into existing organizations'
  processes as an additive ACTIVE definition through the real
  definition API (validation + compilation + activation exactly as the
  designer runs them; existing definitions are never mutated —
  activation is additive). New organizations carry the starters from
  creation (`createActiveEmptyProcess`); this script repairs orgs
  created before that. Mints a short-lived session for each org's
  process owner to post the draft. Usage:
  `node server/scripts/station-documents-types.js [--dry-run] [--org <id> ...]`
  (no `--org` = every org holding an ACTIVE definition).
- `framework-inspect.js`: Framework/package inspection utility used during
  extraction checks.
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

The SPEC §8 species purity seam (value services are pure V→V; a `ref`
input is the projection's job) lives in the plugin SDK's listing contract
now: `parseListing` rejects `ref` inputs on service signatures, and
service-resolved projections carry the compute to the executors. The pack
layer that once hosted these checks retired (owner decision 2026-10-17).

`npm run agent:scope-check -- --base origin/local` is the mandatory guard for
external top-layer agents before they commit or push. It is intentionally
allowlist-based: new composition surfaces must be added to
`.agents/app-layer.allowlist` by the repository owner instead of letting the
agent edit core files ad hoc.

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
