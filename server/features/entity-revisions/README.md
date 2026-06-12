# COMPONENT: Entity Revisions

Stores immutable content snapshots for versioned entity scopes such as cassette
template geometry.

## Core Files

| File | Purpose |
|---|---|
| `model.js` | Normalizes `entity_revision` DTOs through `BaseEntity`. |
| `repository.js` | MongoDB access for `entity_revisions`, including hash and latest lookups. |
| `service.js` | Canonical hash creation, revision dedupe, read access, and list APIs. |
| `index.js` | Public service namespace export. |

## Data Contract

Revision records are normal v24 entities with immutable revision metadata under
`data`:

- `data.entityType`: source entity type, for example `cassette`.
- `data.entityId`: source entity id.
- `data.scope`: versioned content scope, for example `geometry`.
- `data.number`: monotonically increasing number within
  `(entityType, entityId, scope)`.
- `data.contentHash`: `sha256:` hash of canonicalized content for dedupe.
- `data.snapshot`: source identity and scoped content used to reproduce the
  revision.
- `data.sourceStatus`: source entity status at revision creation.
- `data.reason`: creation reason such as `template-created`, `template-updated`,
  or `migration`.

The unique content index is `(data.entityType, data.entityId, data.scope,
data.contentHash)`. Re-saving identical content reuses the existing revision.

## Workflows

- `ensureForEntitySnapshot()` creates or reuses a revision from canonical scoped
  content and stores the source snapshot.
- `getCurrentForEntity()` returns the latest revision for a source entity and
  scope.
- `derivedFromRevision()` builds the provenance block stored on derived entities
  such as `cassette_design.data.derivedFrom`.

Revisions are read-only provenance records. They are not updated or deleted by
standard entity APIs.
Read access checks use the source `data.entityType` permission first, with
legacy cassette/project fallbacks for existing cassette-derived records.

## Related

- [cassettes](../cassettes/README.md) - owns current geometry revision pointers.
- [cassette-designs](../cassette-designs/README.md) - stores derivation refs.
