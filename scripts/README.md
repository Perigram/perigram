# COMPONENT: Project Scripts

Project maintenance scripts for architecture checks, seed data, diagnostics,
and local debugging. These scripts run outside Nuxt page/component resolution,
so imports should be direct package names or filesystem-relative paths unless a
script explicitly installs its own resolver.

## Core Files

- `check-arch.js`: Architecture guardrail for v24 backend features, API layer
  boundaries, canonical DTO blocks, command/task/status/UI boundary leaks,
  retired vocabulary, portable-runtime import rules, and non-blocking migration
  inventory output for legacy lifecycle/service/UI hotspots.
- `check-agent-scope.js`: Diff guard for top-layer composition agents. It
  compares committed, staged, unstaged, and untracked files against
  `.agents/app-layer.allowlist` and fails if an agent touched core/runtime/shared
  paths outside the allowed app-layer surface.
- `framework-inspect.js`: Framework/package inspection utility used during
  extraction checks.
- `migrate-status-state-v2.js`: One-shot status migration. Converts legacy
  string `status.state` / `origin.state` values and `status_events` records to
  the v2 structured status shape. Supports `--dry-run`.
- `server/scripts/migrate-process-command-output-statuses.js`: Active-process
  data migration for command outputs. It reads graph edges from `runCommand`
  action nodes into downstream `changeStatus` nodes, builds proper process
  status snapshots from the compiled workflow, inserts status events, and
  updates existing output entities that are outside the active process status
  window. Supports `--dry-run`.
- `server/scripts/migrate-process-transition-role-access.js`: Compiled-process
  cleanup for status transitions. It removes stale workflow
  `access.permissions` from transitions that already have `processRoleIds`, so
  process role assignment remains the transition authority and target-status
  grants remain post-transition entity access windows. Supports `--dry-run`.
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

The checker also blocks live entity UI that passes local `:status-actions`
instead of relying on server-provided `EntityStatus` workflow actions. It prints
a non-blocking migration inventory with file, line, symbol, and rule id for
legacy `createStatus(...)`, raw target-state `statusService.transition(...)`,
feature-service `db.collection(...)`, and hardcoded UI lifecycle literals.
These entries document remaining refactor scope; only categories already
migrated to a strict boundary fail the command.

`npm run agent:scope-check -- --base origin/local` is the mandatory guard for
external top-layer agents before they commit or push. It is intentionally
allowlist-based: new composition surfaces must be added to
`.agents/app-layer.allowlist` by the repository owner instead of letting the
agent edit core files ad hoc.

## Related

- [root system README](../README.md) - Project-wide commands and container map.
- [backend feature template](../server/features/_template/README.md) - Golden
  path enforced for server feature modules.
