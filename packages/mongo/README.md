# COMPONENT: @perigram/mongo

MongoDB adapter helpers for the framework extraction. The package contains factory functions only; the app still owns the actual connection setup.

## Public API

- `createMongoRepository({ connectDB, collection, toFlexibleId })`
- `createStatusEventStore({ connectDB })`
- `createSummarySync({ connectDB, pluralize, toFlexibleId })`
