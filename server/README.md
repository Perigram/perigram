# CONTAINER: Server

Nuxt/Nitro backend for the Perigram modular monolith.

## Architecture

| Area | Path | Responsibility |
|---|---|---|
| API routes | `server/api/` | HTTP boundary, auth extraction, request/response shaping. |
| Feature modules | `server/features/` | Entity services, repositories, models, and command handlers. |
| Blocks | `server/core/blocks/` | Server import surface for `@perigram/core` block DTOs/helpers. |
| Access | `server/core/access/` | Permission checks for entity services, workflows, and commands. |
| Workflows | `server/core/machines/` | Status transitions and hook dispatch. |
| Commands | `server/core/commands/` | Command execution and `command_runs`. |
| Tasks | `server/core/tasks/` | Async queue and `task_runs`. |
| Effects | `server/core/effects/` | Declared cross-entity effect execution and domain-event validation. |
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
- Cross-module work goes through service calls or registered effects.
- Entity services do not self-register; `server/runtime/app-registry.js`
  performs explicit registration.
- Authenticated user ids are OAuth/string identifiers; MongoDB ObjectIds
  belong to documents.

`toFlexibleId()` is also the route-param normalization point: this Nitro
version hands handlers percent-encoded params, so flexible string ids with
URL-encodable characters (spaces, parentheses, non-ASCII) are decoded there
before matching — every `[id]` lookup inherits the behavior without
per-route decoding.

## Runtime Flow

Commands are synchronous business intent boundaries. Tasks are asynchronous
execution boundaries. Both are domain-agnostic runtimes backed by explicit
registry definitions (framework tables plus installed-plugin services).

Command, task, and status handlers may return declared effects. Those effects
are executed by the centralized effect runtime after validation so handlers
can stay focused on local state and emitted intent.

Workers reach `task_runs` only through `/api/tasks/*`.

Server modules that need shared root utilities should import them through
configured aliases such as `#utils/...`, not relative paths that climb out of
`server/`. Nitro dev chunks resolve those aliases through `nuxt.config.js`.

## Entity Synchronization

Entity synchronization is owned by
[instance-events](./features/instance-events/README.md): server-side
producers publish `{ type, id, change, reason, source }` invalidation
events, and browser clients that receive them refresh through the normal
entity APIs so read access, generated process scopes, and field redaction
stay centralized in feature services. The runtime bus is process-local,
for live app synchronization; `status_events` and feature collections
remain the durable data sources.

## Access Context

Access rules are owned by [core/access](./core/access/README.md). Two rules
are server-level:

- List endpoints return only entities their matching detail endpoint would
  allow: the organization lineage filter is a coarse database prefilter, so
  services apply the same grant evaluator to each loaded entity before
  serializing response DTOs.
- Server modules imported by Nitro dev must import shared contracts through
  the package import alias, such as `#shared/access-control.js` and
  `#shared/public-entities.js`: `~/shared/...` compiles to
  `file:///src//shared/...`, and deep relative paths survive inside
  `.nuxt/dev/index.mjs`, where they can escape the workspace to
  `/shared/...`.

System catalogue entities can be public-read without grants. Materials, system
layer standards, system pens, system tools, and system machines carry
`lineage.scope: "system"`, `lineage.public: true`, and
`data.visibility.public: true`; `hasInstanceAccess()` and field redaction
allow read-level access to those marked records directly. Write/admin access
still requires explicit grants or ownership.

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
