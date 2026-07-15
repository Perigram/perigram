# COMPONENT: @cutkit/mongo

MongoDB adapter helpers for the framework extraction. The package contains factory functions only; the app still owns the actual connection setup.

## Public API

- `createMongoRepository({ connectDB, collection, toFlexibleId })`
- `createStatusEventStore({ connectDB })`
- `createSummarySync({ connectDB, pluralize, toFlexibleId })`

Summary synchronization consumes the domain summary contract directly:
`sourceType` identifies the aggregated entity, `targetType` identifies the
entity receiving the summary, `lineageRole` identifies its structured lineage
reference, and an optional `filter` narrows the source rows. The adapter matches
`lineage.<role>.entityId`; it does not accept flat id fields.
