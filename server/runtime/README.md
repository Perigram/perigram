# COMPONENT: Server Runtime Registry

Builds the explicit application registry used by backend runtimes.

`app-registry.js` creates one `createRegistry()` instance, defines
`@cutkit/domain-cnc`, registers entity services, command handlers, and workflow
hook handlers. Backend runtimes consume this registry instead of importing
domain packages or feature modules directly.

`entities.js` resolves entity type aliases and collection names from the active
registry/domain metadata. Runtime code such as status transitions, hooks, and
summary aggregation must use these helpers instead of hardcoded pluralization
rules.

`cutkit-registry.js` is a compatibility re-export for older imports; new code
should call `getAppRegistry()`.

## Registered Bindings

- Entity services for every persisted domain entity declared in
  `@cutkit/domain-cnc`. Registration adds an explicit
  `processList(filters, auth)` and `processGetById(id, auth)` bindings for each
  feature's concrete list/detail signatures; process entity nodes use those
  uniform boundaries instead of guessing positional service arguments.
- Command handlers: `saveCassetteTemplate`, `solveNesting`,
  `generateAttachment`, `convertArtifact`, `generateConfigBotDraft`,
  `reindexConfigBotKnowledge`.
- Task executors: `nesting.solve`, which bridges queued task runs to the
  FastAPI nesting worker. Polling workers claim other task definitions such as
  `vision.extractGeometry` through the worker protocol.
- Effect policies and hook-returned effects are executed through the core
  effect runtime after the registry resolves the relevant services.
- Workflow hook handlers from `server/core/machines/hooks.js` and explicitly
  registered feature hook handlers such as queue physical-cut processing.
- Domain definitions: entities, workflows, commands, tasks, hooks,
  attachment kinds, summaries, and UI metadata.
- Process definition services are registered as persisted entities. Active
  process compiled workflows are resolved by the workflow runtime before
  organization workflow overrides and domain defaults.

## Related

- [Core package](../../packages/core/README.md)
- [Commands](../core/commands/README.md)
- [Tasks](../core/tasks/README.md)
