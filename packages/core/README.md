# COMPONENT: @cutkit/core

Reusable entity kernel for industrial apps. This package owns block DTOs, entity definition registration, and the service registry. It does not depend on MongoDB, Nuxt, Vue, or CNC-specific concepts.

`server/core/blocks/index.js` now wraps this package to preserve the existing
application import path while extraction continues.

## Public API

- `BaseEntity`, `Identity`, `Status`, `Lineage`, `Specs`
- `defineEntity()`, `getEntityDefinition()`, `listEntityDefinitions()`
- `registerService()`, `getService()`, `clearServices()`
- `createIdentity()`, `createStatus()`, `createSpecs()`, `createData()`, `inheritLineage()`, `createAttachment()`

## Related

- [server/core/blocks/README.md](../../server/core/blocks/README.md)
- [@cutkit/domain-cnc](../domain-cnc/README.md)
