# COMPONENT: Entity Revisions

`entity_revision` is an immutable, normal v24 entity used for reproducible
content scopes. It versions cassette/sheet geometry and terminal queue nesting
attempts; it is not a mutable execution record.

## Data Contract

```js
{
  identity,
  origin,
  status,
  lineage,
  data: {
    entityType,
    entityId,
    scope,
    number,
    contentHash,
    outcome?,
    taskRunId?,
    snapshot,
    sourceStatus,
    reason
  }
}
```

The unique content key is `(entityType, entityId, scope, contentHash)`.
Ordinary geometry saves reuse identical content. Terminal task revisions also
have a deterministic id derived from `taskRunId`, so task retries cannot create
duplicate attempts.

Queue nesting uses `scope: "nesting"`, `outcome: "SUCCESS" | "FAILURE"`, and
a snapshot containing settings, result/error, layout data, and output refs.
Revision listing may be filtered by source entity and scope. Queue selection
accepts successful nesting revisions only.

Revision records are read-only provenance. Domain lineage references may point
to them through an optional `revisionId`, and UI renders that revision as a
separate trace/detail link.

## Related

- [Queues](../queues/README.md)
- [Cassettes](../cassettes/README.md)
- [Sheet designs](../sheet-designs/README.md)
