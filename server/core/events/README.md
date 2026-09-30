# COMPONENT: Domain Event Dispatch

This module is the in-process dispatch boundary for validated registered
domain events. Effect processing publishes an event only after normalizing it
against the runtime domain registry. Domain dispatch does not inspect
effect-node configuration; external subscriptions require an explicit
process-entry contract rather than a hidden effect start mode.

The dispatcher does not own persistence, policies, or entity mutation. Domain
effect policies remain in `server/core/effects`; durable process execution state
and transactional receipt ingestion remain owned by
`server/features/process-definitions`. Automatic handler failures are
logged without changing the already-completed command or effect result.

## Related

- [Effect runtime](../effects/README.md)
- [Process definitions](../../features/process-definitions/README.md)
