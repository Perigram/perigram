# COMPONENT: Server Runtime Registry

Builds the explicit CutKit app registry used by backend runtimes.

`cutkit-registry.js` creates one `createCutkitRegistry()` instance for the Nuxt
server process, binds `@cutkit/domain-cnc` through `server/adapters/cnc-domain.js`,
and copies registered feature services from the compatibility service registry.

Consumers should call `getCutkitRegistry()` instead of importing domain packages
or relying on endpoint-local registration side effects. The registry is the
source for operation definitions, process definitions, entity services, hook
handlers, artifact types, workflows, and domain summaries.

## Related

- [Core package](../../packages/core/README.md)
- [CNC domain adapter](../adapters/cnc-domain.js)
- [Operations runtime](../core/operations/README.md)
- [Process queue runtime](../core/processes/README.md)
