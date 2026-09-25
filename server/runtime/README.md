# COMPONENT: Server Runtime Registry

Builds the explicit application registry used by backend runtimes.

`app-registry.js` creates one `createRegistry()` instance, defines
`@perigram/domain-cnc`, registers entity services, command handlers, and workflow
hook handlers. Backend runtimes consume this registry instead of importing
domain packages or feature modules directly.

`entities.js` resolves entity type aliases and collection names from the active
registry/domain metadata. Runtime code such as status transitions, hooks, and
summary aggregation must use these helpers instead of hardcoded pluralization
rules.

`perigram-registry.js` is a compatibility re-export for older imports; new code
should call `getAppRegistry()`.

## Registered Bindings

- Five framework entity services (`organization`, `user`, `artifact`,
  `process_definition`, `entity_revision`), each with explicit
  `processList`/`processGetById` bindings, `processCapabilities`, and
  construction handlers (`artifact` keeps the `uploadArtifact` typed
  constructor).
- Transitional legacy entity services mounted by their pack: the cnc pack
  registers `queue` (with process bindings, capabilities, and the
  `genericCreate` construction handler) because its queue production flow
  drives transition-hook effects that resolve the queue service from the
  registry. The binding is deleted with that flow's legacy cut.
- The generic instance-service resolver (SPEC §13 of the CTS spec): every
  type without a framework or pack service resolves to its per-class
  instance service — pack types and org-authored types are executable
  without hand-written services, resolving their declarations per call
  (framework and pack types from static declarations, org types from the
  `cts_types` store, cached and invalidated on type writes). Types with no
  declaration in the registry view fail loudly (`Unknown type`) — that is
  the intended contract: the registry view is the whole catalog. Instance
  documents are stored in the CTS §3 shape (flat `fields`, `states.main`,
  `name`); the service boundary owns the §3 ⇄ wire-DTO (block vocabulary)
  mapping for screens and compiled contracts.
- Command handlers from the mounted packs (the CNC pack registers
  `saveCassetteTemplate`, `solveNestingValue`, `convertArtifact`) plus the
  framework's `generateAttachment`, `generateConfigBotDraft`,
  `reindexConfigBotKnowledge`.
- Workflow transition hook handlers: the framework core handlers plus any
  `hookHandlers` a pack mounts.
- Polling workers claim task definitions such
  as `vision.extractGeometry` through the worker protocol.
- Effect policies and hook-returned effects are executed through the core
  effect runtime after the registry resolves the relevant services.
- Workflow hook handlers from `server/core/machines/hooks.js` and explicitly
  registered feature hook handlers.
- Domain definitions (commands, tasks, hooks, the canonical block
  vocabulary, UI metadata) are mounted from the packs; the legacy entity/
  workflow/construction tables in `@perigram/domain-cnc` are pack-internal
  content for non-process surfaces and are not registry services.
- Process definition services are registered as persisted entities. Active
  process compiled workflows are resolved by the workflow runtime before
  organization workflow overrides and domain defaults.

## Related

- [Core package](../../packages/core/README.md)
- [Commands](../core/commands/README.md)
- [Tasks](../core/tasks/README.md)
