# COMPONENT: @cutkit/core

Reusable entity kernel for industrial apps. This package owns block DTOs, entity definition registration, entity service contracts, and operation contracts. It does not depend on MongoDB, Nuxt, Vue, or CNC-specific concepts.

`server/core/blocks/index.js` now wraps this package to preserve the existing
application import path while extraction continues.

## Public API

- `BaseEntity`, `Identity`, `Status`, `Lineage`, `Specs`
- `defineEntity()`, `getEntityDefinition()`, `listEntityDefinitions()`
- `defineEntityServiceContract()`, `registerEntityService()`, `getService()`, `clearServices()`
- `defineOperation()`, `getOperationDefinition()`, `listOperationDefinitions()`
- `registerOperationHandler()`, `getOperationHandler()`, `clearOperationHandlers()`
- `createEntityRef()`, `createOperationResult()`
- `createIdentity()`, `createStatus()`, `createSpecs()`, `createData()`, `inheritLineage()`, `createAttachment()`

Operations describe domain actions that process entities and produce entities,
artifacts, jobs, transitions, or scalar data. Core stores the definitions and
handler registry only; application adapters own authorization, persistence, and
worker/file integrations.

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
