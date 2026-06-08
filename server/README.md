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
| Runtime registry | `server/runtime/` | Explicit app registry binding domain contracts to services/handlers. |

## Golden Path

Feature modules follow `server/features/_template/README.md`:

- `model.js` extends `BaseEntity`.
- `repository.js` owns MongoDB access and uses `toFlexibleId()`.
- `service.js` owns orchestration and returns serialized DTOs.
- Services do not call `db.collection` directly.
- Entity services do not self-register; `server/runtime/app-registry.js`
  performs explicit registration.

## Runtime Flow

Commands are synchronous business intent boundaries. Tasks are asynchronous
execution boundaries. Both are domain-agnostic runtimes backed by explicit
registry definitions from `@cutkit/domain-cnc`.

Workers must use `/api/tasks/*` and must never write `task_runs` directly.

Server modules that need shared root utilities should import them through
configured aliases such as `#utils/...`, not relative paths that climb out of
`server/`. Nitro dev chunks resolve those aliases through `nuxt.config.js`.

## Required Checks

```bash
node scripts/check-arch.js
npm run framework:validate
```

## Related

- [Feature template](./features/_template/README.md)
- [Commands](./core/commands/README.md)
- [Tasks](./core/tasks/README.md)
- [Runtime registry](./runtime/README.md)
