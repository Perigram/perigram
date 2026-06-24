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
| Process definitions | `server/features/process-definitions/` | Organization-owned process graph drafts and compiled active runtime contracts. |

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

Server access checks delegate to `shared/access-control.js`. Entity read,
write, and admin checks must pass the loaded entity DTO/model to
`hasLineagePermission()` or `hasEntityAccess()` whenever the entity is already
available. Passing only `entity.lineage` is allowed only before the target
entity exists or when the check intentionally supports lineage-id predicates
only; status, entity-id, and property predicates need the full entity. Lineage
entity trait rules such as `lineage.project.status.primary` require resolved
ancestors in the access context. Command access passes its related `entities`
map as `context.lineageEntities`; services that need ancestor status/type based
access must pass the relevant ancestor DTOs instead of expecting the evaluator
to load them implicitly.

List endpoints must not return entities that their matching detail endpoint
would deny. Organization lineage filters are only a coarse database prefilter;
services that return entity lists must also apply the same grant evaluator to
each loaded entity before serializing response DTOs.

Active organization process definitions can provide `auth.effectivePermissions`
and navigation for the current user. The access engine still evaluates the same
shared grant shape; process activation changes the grant source, not the
permission evaluator.

System catalogue entities can be public-read without grants. Materials, system
layer standards, system pens, and system tools carry
`lineage.scope: "system"`, `lineage.public: true`, and
`data.visibility.public: true`; `hasEntityAccess()` and field redaction allow
read-level access to those marked records directly. Write/admin access still
requires explicit grants or ownership.
Server modules that are imported by Nitro dev must import shared contracts with
repository-relative paths. Do not use `~/shared/...` from those files, because
the generated dev server can resolve it to `/shared/...` instead of the
workspace path.

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
