# COMPONENT: @cutkit/core

Reusable entity kernel for industrial apps. This package owns block DTOs, entity definition registration, entity service contracts, and service action contracts. It does not depend on MongoDB, Nuxt, Vue, or CNC-specific concepts.

`server/core/blocks/index.js` now wraps this package to preserve the existing
application import path while extraction continues.

## Public API

- `BaseEntity`, `Identity`, `Status`, `Lineage`, `Specs`
- `defineEntity()`, `getEntityDefinition()`, `listEntityDefinitions()`
- `defineEntityServiceContract()`, `registerEntityService()`, `getService()`, `clearServices()`
- `defineServiceContract()`, `getServiceContract()`, `listServiceContracts()`
- `defineServiceAction()`, `getServiceActionDefinition()`, `listServiceActionDefinitions()`
- `registerServiceActionHandler()`, `getServiceActionHandler()`, `clearServiceActionHandlers()`
- `createEntityRef()`, `createServiceActionResult()`
- `createIdentity()`, `createStatus()`, `createSpecs()`, `createData()`, `inheritLineage()`, `createAttachment()`

Service contracts describe processing services available to a domain package.
Service actions describe callable units of work on those services: typed entity
inputs, typed `parameters`, access requirements, triggers, and outputs
(`entities`, `artifacts`, `jobs`, `transitions`, `events`, and scalar `data`).
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
