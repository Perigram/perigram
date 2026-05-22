# COMPONENT: @cutkit/core

Reusable entity kernel for industrial apps. This package owns block DTOs,
explicit app registries, entity service contracts, service action contracts,
process contracts, artifact type contracts, and aggregate domain registration.
It does not depend on MongoDB, Nuxt, Vue, or CNC-specific concepts.

`server/core/blocks/index.js` now wraps this package to preserve the existing
application import path while extraction continues.

## Public API

- `BaseEntity`, `Identity`, `Status`, `Lineage`, `Specs`
- `createCutkitRegistry()`
- `defineEntity()`, `getEntityDefinition()`, `listEntityDefinitions()`
- `defineDomain()`, `getDomain()`, `listDomains()`
- `defineEntityServiceContract()`, `registerEntityService()`, `getService()`, `clearServices()`
- `defineServiceContract()`, `getServiceContract()`, `listServiceContracts()`
- `defineServiceAction()`, `getServiceActionDefinition()`, `listServiceActionDefinitions()`
- `defineProcess()`, `getProcessDefinition()`, `listProcessDefinitions()`
- `defineArtifactType()`, `getArtifactTypeDefinition()`, `listArtifactTypeDefinitions()`
- `registerServiceActionHandler()`, `getServiceActionHandler()`, `clearServiceActionHandlers()`
- `createEntityRef()`, `createServiceActionResult()`, `createProcessResult()`
- `createIdentity()`, `createStatus()`, `createSpecs()`, `createData()`, `inheritLineage()`, `createAttachment()`

Service contracts describe processing services available to a domain package.
Service actions describe callable units of work on those services: typed entity
inputs, typed `parameters`, access requirements, triggers, and outputs
(`entities`, `artifacts`, `jobs`, `transitions`, `events`, and scalar `data`).
Process definitions describe asynchronous work that may be executed by server
adapters, HTTP workers, or polling workers. Artifact type definitions describe
generated files without binding to GridFS or HTTP streaming implementation.
`createCutkitRegistry()` creates an isolated registry for a running app or test.
The legacy `define*`, `register*`, `get*`, and `list*` exports delegate to a
default compatibility registry, but server runtime code should use an explicit
registry from `server/runtime/cutkit-registry.js`.

Core stores definitions and handler registrations only; application adapters own
authorization, persistence, worker execution, and file generation.

`Status` includes normalized `lifecycle` facts in addition to event-local
`metadata`. Missing lifecycle data is emitted as
`{ actors: [], attachments: {}, data: {} }`.

`BaseEntity.toJSON()` is strict: it emits root `_id` plus canonical blocks only.
Entity identity fields stay under `identity`; feature fields stay under `data`,
`specs`, `attachments`, or `summary`. The core package does not provide root
aliases such as `id`, `name`, `slug`, `serial`, `type`, or `parameters`, and
constructors do not migrate legacy root fields.

## Related

- [server/core/blocks/README.md](../../server/core/blocks/README.md)
- [@cutkit/domain-cnc](../domain-cnc/README.md)
