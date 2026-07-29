# COMPONENT: Domain Event Dispatch

This module is the in-process dispatch boundary for validated registered
domain events. Effect processing publishes an event only after normalizing it
against the runtime domain registry. The process orchestration plugin registers
one handler that starts matching effect nodes whose start mode is
`domainEvent` in the active organization process.

The dispatcher does not own persistence, policies, or entity mutation. Domain
effect policies remain in `server/core/effects`; durable process state remains
in `server/features/process-definitions`. Automatic handler failures are logged
without changing the already-completed command or effect result.

## Related

- [Effect runtime](../effects/README.md)
- [Process definitions](../../features/process-definitions/README.md)
