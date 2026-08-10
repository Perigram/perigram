---
name: cutkit-backend-v24
description: Apply the CutKit Demo v24 Golden Path when creating, modifying, reviewing, or debugging backend feature code under server/features, server/api, server/runtime, server/core/machines, access, command/task runtimes, or package domain registrations that must follow the repository backend architecture.
---

# CutKit Backend v24

Use this skill for backend work that touches feature services, repositories,
models, API routes, command/task handlers, status hooks, runtime registration, or
domain package bindings.

## First Reads

1. `AGENTS.md`
2. `README.md`
3. `server/README.md`
4. `server/features/README.md`
5. `server/features/_template/README.md`
6. The target feature README, if one exists

For command, task, access, status, or runtime work, also read the corresponding
local README before editing.

## Golden Path

- Keep data access inside repositories; services must not call `db.collection`.
- Use `toFlexibleId()` for repository lookups that accept entity ids.
- Build entities through `BaseEntity` and standardized blocks.
- Return serialized DTOs from services with `Model.toJSON()`.
- Register services and handlers through the runtime registry.
- Keep workflow side effects decoupled: register feature hooks in the service
  layer and do not add business logic to `server/core/machines/hooks.js`.
- Treat authenticated `userId` values as strings, not MongoDB ObjectIds.
- Use service calls for cross-module behavior instead of direct database access.
- When changing stored data, API payloads, permissions, process definitions, or
  runtime protocols, remove the old contract and migrate existing records in
  the same task. Do not add compatibility bridges, legacy fallbacks, dual-read
  paths, or adapter shims.

## API And Runtime Boundaries

- API routes should authenticate/authorize as existing routes do, normalize
  request input, and delegate business behavior to services.
- Command handlers represent synchronous business intent and should enqueue tasks
  only through the task runtime when async work is required.
- Task handlers should own retryable execution details and report through the
  task runtime.
- Keep domain package definitions pure; bind app-specific infrastructure in
  `server/runtime/app-registry.js`.

## Validation

- Run `node scripts/check-arch.js` before considering backend work complete.
- Add or run focused Vitest coverage for changed services, repositories,
  command/task handlers, or architecture guards.
- Do not run `npm run build` or start dev servers unless the user asks.

## Documentation

Update the local feature README, parent component README, and `TODO.md` Agent
Notes whenever backend behavior, contracts, registration, or workflows change.
