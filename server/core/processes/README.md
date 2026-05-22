# COMPONENT: Process Queue Runtime

Generic async process queue runtime backed by `process_runs`.

## Responsibilities

- Stores declared domain process executions with normalized `input.entities`
  and `input.parameters`.
- Provides canonical enqueue, claim, heartbeat, complete, fail, retry, cancel,
  and list operations.
- Uses claim tokens and lease expiry for worker-owned runs.
- Applies retry state (`RETRY_WAIT`) before terminal failure when attempts
  remain.
- Persists normalized process outputs with entity, artifact, job, event, and
  scalar data refs.

Process definitions come from the registered domain contract. The runtime is
domain-agnostic; CNC-specific executors and worker payloads live in server
adapters or feature modules.

## API

- `GET /api/admin/processes`: authenticated run listing with optional
  `processId`, `status`, and `limit` filters plus process definitions.
- `POST /api/processes/claim`: worker claim endpoint.
- `POST /api/processes/:id/heartbeat`: extend a worker lease.
- `POST /api/processes/:id/complete`: complete with a normalized result.
- `POST /api/processes/:id/fail`: fail or retry according to process policy.
- `POST /api/processes/:id/cancel`: cancel a non-terminal run.

All writes to `process_runs` go through this runtime. Compatibility polling
collections may still carry `processRunId`, but workers report lifecycle through
the process API instead of updating `process_runs` directly.

## Related

- [operations](../operations/README.md)
- [domain-cnc](../../../packages/domain-cnc/README.md)
