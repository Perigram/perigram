# COMPONENT: @cutkit/core

Framework-neutral contract kernel. It owns canonical entity block DTOs, isolated
registries, domain definition helpers, and normalized result helpers. It must not
import Vue, Nuxt, MongoDB, workers, or CNC-specific code.

## Public Contract

- DTOs: `BaseEntity`, `Identity`, `Status`, `Lineage`, `Relations`,
  `Provenance`, `Specs`
- Registry: `createRegistry()` and `createCutkitRegistry()`
- Definitions: `defineDomain`, `defineEntity`, `defineWorkflow`,
  `defineCommand`, `defineTask`, `defineHook`, `defineAttachmentKind`
- Runtime bindings: `registerEntityService`, `registerCommandHandler`,
  `registerTaskExecutor`, `registerHookHandler`, `registerAdapter`
- Result refs: `createEntityRef`, `normalizeEntityRef`, `createProvenance`,
  `createAttachmentRef`,
  `createCommandResult`, `createTaskResult`
- Block helpers: `createIdentity`, `createStatus`, `createStatusState`,
  `normalizeStatusState`, `getPrimaryState`, `getRegionState`,
  `getStatusRegions`, `createSpecs`, `createData`, `inheritLineage`,
  `createAttachment`

## Vocabulary

| Term | Definition |
|---|---|
| Entity | Persisted business object described by canonical blocks. |
| Command | Synchronous business intent and access boundary. It validates entity refs and permissions, invokes one registered handler, and records `command_runs`. |
| Task | Async execution boundary for worker/server work. It is queued in `task_runs`, claimed by a worker or executor, and completed with a normalized task result. |
| Workflow | Entity lifecycle machine: region states, transitions, access requirements, hooks, and lifecycle data policy. |
| Hook | Transition side-effect contract plus app-registered handler. |
| AttachmentKind | File/blob content contract: kind, bucket, MIME type, preview mode. |
| Adapter | Application binding that connects pure domain definitions to infrastructure. |

Commands and tasks are intentionally separate: a command expresses user/system
intent, while a task is retryable asynchronous execution. A command may enqueue
zero or more tasks.

## Boundaries

Core stores definitions and handler references only. Authorization, persistence,
HTTP routes, MongoDB repositories, worker protocols, and file IO belong to app
runtime packages and server modules.

`BaseEntity.toJSON()` is strict: it emits root `_id` plus canonical blocks only.
Identity fields stay under `identity`; containment ancestry stays under
`lineage`; non-owning links stay under `relations`; immutable derivation facts
stay under `provenance`; feature-specific data stays under `data`, `specs`,
`attachments`, or `summary`.

`Status.state` is a v2 structured object with `primary`, `active`, and
`regions`; compare states through `getPrimaryState()` or `getRegionState()`
rather than reading `status.state` as a string.

## Related

- [server/core/blocks](../../server/core/blocks/README.md)
- [@cutkit/domain-cnc](../domain-cnc/README.md)
