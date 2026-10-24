# COMPONENT: Server Runtime Registry

Builds the explicit application registry used by backend runtimes.

`app-registry.js` creates one `createRegistry()` instance and registers the
framework entity services, command handlers, and the workflow hook handler
seam. Backend runtimes resolve domain services through this registry. The
facade domain installs per
organization as the facade plugin; its compute runs in the external
executor.

`entities.js` resolves entity type aliases and collection names from the
active registry/domain metadata. Runtime code — status transitions, hooks,
summary aggregation — resolves names and collections through these helpers.

`perigram-registry.js` re-exports the registry under both names:
`getAppRegistry()` and `getPerigramRegistry()` return the same instance.

## Registered Bindings

- Five framework entity services (`organization`, `user`, `artifact`,
  `process_definition`, `entity_revision`), each with explicit
  `processList`/`processGetById` bindings, `processCapabilities`, and
  construction handlers (`artifact` keeps the `uploadArtifact` typed
  constructor). The party services' process bindings speak the §3 wire
  shape with their own membership read gates and the derived user rows
  (`roles` from the org's assignments, `bot`, `avatarUrl`;
  `party-wire.js` — the single party translation home);
  party mutation stays on the feature routes.
- The generic instance-service resolver (SPEC §13 of the CTS spec): every
  type without a framework or pack service resolves to its per-class
  instance service — pack types and org-authored types are executable
  without hand-written services, resolving their declarations per call
  (framework and pack types from static declarations, org types from the
  `cts_types` store, cached and invalidated on type writes). Types with no
  declaration in the registry view fail loudly (`Unknown type`) — that is
  the intended contract: the registry view is the whole catalog. Instance
  documents are stored in the CTS §3 shape (flat `fields`, the flat
  `state` string, `name`); the service boundary owns the §3 ⇄
  wire-DTO (block vocabulary) mapping for screens and compiled contracts.
- Framework command handlers (`generateAttachment`, `convertArtifact`);
  plugin value services execute as `plugin.<pluginId>.<serviceId>` commands
  through the connector path.
- The framework domain (`defineDomain`) declares the framework command and
  task tables; the framework task table is empty today
  (`frameworkTaskDefinitions = {}`), and task contracts arrive at enqueue
  time as runtime-declared definitions (plugin connector services compose
  theirs from the install snapshot).
- Workflow hook handlers register through `registry.registerHookHandler`,
  with the engine falling back to hooks exported by the owning instance
  service; zero handlers are registered today.
- Effect policies and hook-returned effects are executed through the core
  effect runtime after the registry resolves the relevant services.
- Process definition services are registered as persisted entities. Active
  process compiled workflows are resolved by the workflow runtime ahead of
  organization workflow overrides.

## Related

- [Server](../README.md)
- [Core package](../../packages/core/README.md)
- [Commands](../core/commands/README.md)
- [Tasks](../core/tasks/README.md)
