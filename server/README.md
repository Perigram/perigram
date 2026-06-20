# CONTAINER: Server

Nuxt/Nitro backend for the CutKit modular monolith.

## Architecture

| Area | Path | Responsibility |
|---|---|---|
| API routes | `server/api/` | HTTP boundary, auth extraction, request/response shaping. |
| Feature modules | `server/features/` | Entity services, repositories, models, and command handlers. |
| Blocks | `server/core/blocks/` | Compatibility exports for `@cutkit/core` DTOs/helpers. |
| Access | `server/core/access/` | Permission checks for entity services, workflows, and commands. |
| Workflows | `server/core/machines/` | Status transitions, hook dispatch, summaries. |
| Commands | `server/core/commands/` | Command execution and `command_runs`. |
| Tasks | `server/core/tasks/` | Async queue and `task_runs`. |
| Effects | `server/core/effects/` | Declared cross-entity effect execution. |
| Runtime registry | `server/runtime/` | Explicit app registry binding domain contracts to services/handlers. |

## Golden Path

Feature modules follow `server/features/_template/README.md`:

- `model.js` extends `BaseEntity`.
- `repository.js` owns MongoDB access and uses `toFlexibleId()`.
- `service.js` owns orchestration and returns serialized DTOs.
- Services do not call `db.collection` directly.
- Feature services do not read or write another feature collection directly;
  cross-module work goes through service calls or registered effects.
- Entity services do not self-register; `server/runtime/app-registry.js`
  performs explicit registration.
- Authenticated user ids are OAuth/string identifiers, not MongoDB ObjectIds.

## Runtime Flow

Commands are synchronous business intent boundaries. Tasks are asynchronous
execution boundaries. Both are domain-agnostic runtimes backed by explicit
registry definitions from `@cutkit/domain-cnc`.

Command, task, and status handlers may return declared effects. Those effects
are executed by the centralized effect runtime after validation so handlers
can stay focused on local state and emitted intent.

Workers must use `/api/tasks/*` and must never write `task_runs` directly.

Server modules that need shared root utilities should import them through
configured aliases such as `#utils/...`, not relative paths that climb out of
`server/`. Nitro dev chunks resolve those aliases through `nuxt.config.js`.

## Access Context

Server access checks delegate to `shared/access-control.js`. Entity lineage IDs
are always available from the checked entity, but lineage entity trait rules
such as `lineage.project.status.primary` require resolved ancestors in the
access context. Command access passes its related `entities` map as
`context.lineageEntities`; services that need ancestor status/type based access
must pass the relevant ancestor DTOs instead of expecting the evaluator to load
them implicitly.

## Required Checks

```bash
node scripts/check-arch.js
npm run framework:validate
```

## Related

- [Feature template](./features/_template/README.md)
- [Commands](./core/commands/README.md)
- [Tasks](./core/tasks/README.md)
- [Effects](./core/effects/README.md)
- [Runtime registry](./runtime/README.md)
