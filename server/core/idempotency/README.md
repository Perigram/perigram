# COMPONENT: Idempotency Runtime

Dedupe registry for replayed offline mutations (the client outbox contract is
documented in the root README PWA section and `composables/README.md`).

## Contract

- Mutating `/api/**` requests (POST/PUT/PATCH/DELETE) may carry an
  `Idempotency-Key` header (a client-generated UUID).
- `server/middleware/idempotency.js` checks the `idempotency_keys` collection
  before the route handler runs. If the key was already executed, the handler
  is skipped and `{ duplicate: true, firstSeenAt }` is returned with 200.
- `server/plugins/idempotency.js` registers the key on the Nitro
  `beforeResponse` hook only for 2xx responses, so rejected or failed requests
  can be retried without false-positive dedupe.
- Keys expire after 7 days (TTL index declared in `server/db/indexes.js`).
- Replay responses carry only the duplicate marker: the frontend treats
  `duplicate: true` as success and emits snapshot-less entity events so
  open screens refetch through their normal APIs.
- Known race: two concurrent requests with the same not-yet-registered key can
  both execute. The outbox flush loop is sequential per browser tab, so this
  window is not reachable through the normal client flow.

## Files

- `service.js` - Mongo lookup/registration for `idempotency_keys`.
- `../middleware/idempotency.js` - request pre-check and short-circuit.
- `../plugins/idempotency.js` - success registration hook.

## Related

- [API conventions](../../api/README.md)
- [Command runtime](../commands/README.md)
