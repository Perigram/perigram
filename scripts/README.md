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
- `framework-inspect.js`: Framework/package inspection utility used during
  extraction checks.
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

The checker also prints a non-blocking migration inventory with file, line,
symbol, and rule id for legacy `createStatus(...)`, raw target-state
`statusService.transition(...)`, feature-service `db.collection(...)`, and
hardcoded UI lifecycle literals. These entries document remaining refactor
scope; only categories already migrated to a strict boundary fail the command.

## Related

- [root system README](../README.md) - Project-wide commands and container map.
- [backend feature template](../server/features/_template/README.md) - Golden
  path enforced for server feature modules.
