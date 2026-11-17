# COMPONENT: Database Layer

MongoDB connection and collection index management.

Parent: [server](../README.md).

## Files

- `mongo.js`: singleton connection manager using the native MongoDB driver
  (`connectDB()`; URI from `NUXT_MONGODB_URI` / `MONGODB_URI`, falling back
  to Nuxt runtime config). File storage rides the files feature's own
  GridFS bucket.
- `indexes.js`: the collection index manifest and its CLI.
- `transactions.js`: `withMongoSnapshotTransaction(callback)` runs the callback in a Mongo session with snapshot read concern, majority write concern, and primary read preference. It closes the session after completion and returns `503` when the deployment lacks transaction support.

## Index Management

Indexes are defined per collection in `indexes.js`:

- `node server/db/indexes.js create` — apply all defined indexes.
- `node server/db/indexes.js drop [collection...]` — drop custom indexes.

Unique indexes: `cassettes.identity.slug`, memberships
`organizationId+userId`, `users.identity.email`, `idempotency_keys.key`
(with a 7-day TTL on `createdAt`), and `push_subscriptions.endpoint`. The
remaining manifest collections carry lookup indexes: `cassettes` by lineage,
`status_events` by target and
timestamp, `workflow_overrides` by organization/type/status,
`organizations` by type, `pages` by organization and by
organization+parent, `push_subscriptions` by user.
