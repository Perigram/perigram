# COMPONENT: Project Scripts

Project maintenance scripts for architecture checks, seed data, diagnostics,
and local debugging. These scripts run outside Nuxt page/component resolution,
so imports should be direct package names or filesystem-relative paths unless a
script explicitly installs its own resolver.

Vitest uses the shared alias map from `vitest.config.js` and loads
`@vitejs/plugin-vue`, so focused specs may import Vue SFCs directly when they
stub Nuxt/PrimeVue app plugins that are not active in the node test runner.

## Core Files

- `check-arch.js`: Architecture guardrail for v24 backend features, API layer
  boundaries, canonical DTO blocks, command/task/status/UI boundary leaks,
  retired vocabulary, portable-runtime import rules, concrete CNC domain leaks
  in generic modules, duplicate object keys in domain registries, concrete
  entity-name branches in `@cutkit/processes`, runtime legacy-process bridges,
  cross-feature repository imports, and source-assertion test practices. Every
  finding is blocking; there is no non-blocking migration inventory.
- `check-agent-scope.js`: Diff guard for top-layer composition agents. It
  compares committed, staged, unstaged, and untracked files against
  `.agents/app-layer.allowlist` and fails if an agent touched core/runtime/shared
  paths outside the allowed app-layer surface.
- `check-docs.js`: Documentation integrity guardrail for the README tree. It
  fails on broken internal markdown links (relative targets that do not resolve
  to an existing file) and on duplicated canonical-contract passages — both
  verbatim paragraphs and fenced code blocks of meaningful length repeated
  across more than one README. Canonical contracts and examples must live in a
  single canonical README and be linked, not restated. Run as
  `npm run docs:validate`.
- `framework-inspect.js`: Framework/package inspection utility used during
  extraction checks.
- `ui-visual-inventory.js`: Derives the canonical Vue visual inventory from
  current source and rewrites the component matrix in
  `docs/UI_COMPONENT_AUDIT.md`. It classifies typography, arbitrary layout,
  chrome, state, important-override, scoped-style, and inline-style findings
  under the same dispositions consumed by `shared/design-system.spec.js`.
  Inline exceptions are exact file/category/count entries, so adding another
  binding requires explicit classification. Component ownership is derived
  from the domain primitive registry: exact registered paths are shared/domain
  primitives and every other Vue file is derived usage.
- `migrate-status-state-v2.js`: One-shot status migration. Converts legacy
  string `status.state` / `origin.state` values and `status_events` records to
  the v2 structured status shape. Supports `--dry-run`.
- `server/scripts/migrate-process-update-actions.js`: Rewrites legacy
  `changeStatus` process actions into canonical `updateEntity` actions with a
  status mutation input and recompiles active runtime contracts. Run before
  relying on the unified process action protocol.
- `server/scripts/migrate-process-command-output-statuses.js`: Active-process
  data migration for command outputs. It reads graph edges from `runCommand`
  action nodes into downstream status-mutating `updateEntity` nodes, builds
  proper process status snapshots from the compiled workflow, inserts status
  events, and updates existing output entities that are outside the active
  process status window. Supports `--dry-run`.
- `server/scripts/migrate-entity-reference-contracts.js`: Moves legacy entity
  reference fields into canonical `relations` and `provenance` blocks,
  including cassette-design derived-from data.
- `server/scripts/migrate-queue-nesting-contracts.js`: Converts legacy queue
  nesting params/items into the current `data.nestingSettings` and
  `cassette_design` job-item contract, seeding the default machine id where
  needed.
- `server/scripts/migrate-sheet-design-compositions.js`: Non-destructively
  backfills sheet-design composition metadata, sheet counts, and missing
  physical sheet twins. It reports duplicate cassette-design multisets for
  review but does not delete historical sheet designs, revisions, or layout
  references.
- `server/scripts/migrate-artifact-sources.js`: Backfills artifact source
  relations and cassette upload provenance for records created before artifact
  sources were canonical entity refs.
- `server/scripts/migrate-artifact-template-command-inputs.js`: Reprojects
  stored `generateAttachment` action inputs from the current command contract,
  removing the inert `pdfTemplateId` copy and adding typed template/value
  sockets. It is a dry run unless `APPLY=1` is set.
- `server/scripts/migrate-process-compiled-runtime.js`: Recompiles stored
  `data.compiled` contracts after process compiler changes. Use this after
  generated-screen synthesis changes so active organizations drop stale
  compiler-projected home and navigation manifests.
- `server/scripts/migrate-process-dataflow-v4.js`: Migrates stored v3 process
  graphs to the universal v4 data-tree contract. It is a dry run by default and
  writes only with `--apply`. The write pass aborts if any legacy relation
  append/remove operation requires an explicit list-dataflow rewrite.
- `server/scripts/migrate-process-transition-role-access.js`: Compiled-process
  cleanup for status transitions. It removes stale workflow
  `access.permissions` from transitions that already have `processRoleIds`, so
  process role assignment remains the transition authority and target-status
  grants remain post-transition entity access windows. Supports `--dry-run`.
- `server/scripts/migrate-organization-owner-admins.js`: Tenant safety
  migration. It marks one active membership per organization as `owner: true`,
  preferring the creator, then an active admin, then the first active member,
  and materializes permanent organization/user admin recovery grants.
- `server/scripts/migrate-profile-template-fillets.js`: Profile-template data
  migration. Rewrites legacy multi-vertex sketch fillets and normalized OCCS
  snapshots into per-corner `{ vertexId, radius }` fillet modifiers. Supports
  `--dry-run`.
- `seed-*.js`: Local seed helpers for layer standards and tool profiles.
- `test-*.js`, `debug_*.js`, `check-data.js`, `check-jobs.js`: Manual
  diagnostics for local database, auth, jobs, and data shape investigations.

## Guardrail Scope

`check-arch.js` is the mandatory backend architecture check. It validates
server feature structure against `server/features/_template/README.md`, keeps
repositories/services/API routes on their assigned layers, rejects Nuxt
root-alias imports inside portable runtime modules under `shared/`,
`test-data/`, and `packages/`, and rejects parent-relative cross-root imports
from `shared/` and non-spec `test-data/` modules. Cross-root portable imports
should use the package imports declared in `package.json` (`#shared/...`,
`#packages/...`, `#utils/...`) so direct Node loaders and Nuxt/Nitro SSR builds
resolve the same graph.
Entity feature directories are derived from domain entity metadata. Use an
explicit `feature` field on a domain entity when English pluralization is
irregular, such as `library -> libraries`; do not add script-local exceptions.
Non-entity capability directories must be added to the explicit capability list
in `check-arch.js` and documented in `server/features/README.md`.

The checker also blocks live entity UI that passes local `:status-actions`
instead of relying on server-provided `EntityStatus` workflow actions.

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
boundary. It rejects arbitrary typography, raw palette/surface borders,
nonsemantic radii and shadows, non-allowlisted scoped CSS, duplicated runtime
theme overrides, direct global PrimeVue selectors or variable declarations,
`!important` runtime rules, and global focus suppression. It also reconciles source-derived
visual concern counts with the canonical audit. Scoped-style exceptions name one
exact category per file; every exception category is limited to an exact set of
properties rather than granting whole-file visual ownership. Aura-owned padding
is excluded from general layout exceptions. Inline style bindings are rejected
unless their exact file, visual category, and occurrence count are registered;
the allowed categories remain data, geometry/process, integration, and semantic
interaction motion rather than generic component chrome.

## Related

- [root system README](../README.md) - Project-wide commands and container map.
- [backend feature template](../server/features/_template/README.md) - Golden
  path enforced for server feature modules.
