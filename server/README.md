# CONTAINER: Server

Nuxt/Nitro backend for the Perigram modular monolith.

## Architecture

| Area | Path | Responsibility |
|---|---|---|
| API routes | `server/api/` | HTTP boundary, auth extraction, request/response shaping. |
| Feature modules | `server/features/` | Entity services, repositories, models, and command handlers. |
| Blocks | `server/core/blocks/` | Compatibility exports for `@perigram/core` DTOs/helpers. |
| Access | `server/core/access/` | Permission checks for entity services, workflows, and commands. |
| Workflows | `server/core/machines/` | Status transitions, hook dispatch, summaries. |
| Commands | `server/core/commands/` | Command execution and `command_runs`. |
| Tasks | `server/core/tasks/` | Async queue and `task_runs`. |
| Domain events | `server/core/events/` | Validated in-process event dispatch to automatic consumers. |
| Effects | `server/core/effects/` | Declared cross-entity effect execution. |
| Runtime registry | `server/runtime/` | Explicit app registry binding domain contracts to services/handlers. |
| Process definitions | `server/features/process-definitions/` | Organization-owned process graph drafts and compiled active runtime contracts. |
| Agent bots | `server/features/agent-bots/` | Bot members, the shared agent tool catalog, the MCP transport, and the chat bot runtime. |
| LLM | `server/features/llm/` | Per-organization chat completions over a selectable provider table (Ollama, Anthropic Messages, OpenAI-shaped local servers). |
| Entity event bus | `server/features/instance-events/` | Authenticated in-memory SSE invalidation bus for cross-device entity updates. |

## Golden Path

Feature modules follow `server/features/_template/README.md`:

- `model.js` extends `BaseEntity`.
- `repository.js` owns MongoDB access and uses `toFlexibleId()`.
- `service.js` owns orchestration and returns serialized DTOs.
- Services do not call `db.collection` directly.

`toFlexibleId()` is also the route-param normalization point: this Nitro
version hands handlers percent-encoded params, so flexible string ids with
URL-encodable characters (spaces, parentheses, non-ASCII) are decoded there
before matching — every `[id]` lookup inherits the behavior without
per-route decoding.
- Feature services do not read or write another feature collection directly;
  cross-module work goes through service calls or registered effects.
- Entity services do not self-register; `server/runtime/app-registry.js`
  performs explicit registration.
- Authenticated user ids are OAuth/string identifiers, not MongoDB ObjectIds.

## Runtime Flow

Commands are synchronous business intent boundaries. Tasks are asynchronous
execution boundaries. Both are domain-agnostic runtimes backed by explicit
registry definitions (framework tables plus installed-plugin services).

Command, task, and status handlers may return declared effects. Those effects
are executed by the centralized effect runtime after validation so handlers
can stay focused on local state and emitted intent.

Workers must use `/api/tasks/*` and must never write `task_runs` directly.

Server modules that need shared root utilities should import them through
configured aliases such as `#utils/...`, not relative paths that climb out of
`server/`. Nitro dev chunks resolve those aliases through `nuxt.config.js`.

## Entity Synchronization

Entity synchronization uses a two-stage contract:

1. Server-side producers publish invalidation events through
   `server/features/instance-events/service.js`.
2. Browser clients receive those events from `GET /api/instance-events` and
   re-emit the shared browser-local event from `utils/instance-events.js`.

Events carry `{ type, id, change, reason, source }` and are intentionally not
full DTO replication payloads. Consumers refresh through normal entity APIs so
read access, generated process scopes, and field redaction stay centralized in
existing feature services. The current runtime bus is process-local; it is for
live app synchronization, while `status_events` and feature collections remain
the durable data sources.

## Access Context

Server access checks delegate to `shared/access-control.js`. Entity read,
write, and admin checks must pass the loaded entity DTO/model to
`hasLineagePermission()` or `hasInstanceAccess()` whenever the entity is already
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
layer standards, system pens, system tools, and system machines carry
`lineage.scope: "system"`, `lineage.public: true`, and
`data.visibility.public: true`; `hasInstanceAccess()` and field redaction allow
read-level access to those marked records directly. Write/admin access still
requires explicit grants or ownership.
Server modules that are imported by Nitro dev must import shared contracts with
the package import alias, such as `#shared/access-control.js` and
`#shared/public-entities.js`. Do not use `~/shared/...`, because that can
compile to `file:///src//shared/...`, and do not use deep relative paths,
because Nitro preserves them inside `.nuxt/dev/index.mjs` where they can escape
the workspace to `/shared/...`.

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
