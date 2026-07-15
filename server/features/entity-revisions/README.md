# COMPONENT: Entity Revisions

Stores immutable content snapshots for versioned entity scopes such as cassette
template geometry and manually edited sheet layouts.

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

- `data.source.type`: source entity type, for example `cassette`.
- `data.source.id`: source entity id.
- `data.scope`: versioned content scope, for example `geometry`.
- `data.number`: monotonically increasing number within
  `(entityType, entityId, scope)`.
- `data.contentHash`: `sha256:` hash of canonicalized content for dedupe.
- `data.snapshot`: source identity and scoped content used to reproduce the
  revision.
- `data.sourceStatus`: source entity status at revision creation.
- `data.reason`: creation reason such as `template-created`, `template-updated`,
  or `migration`.

The unique content index is `(data.source.type, data.source.id, data.scope,
data.contentHash)`. Re-saving identical content reuses the existing revision.
Runtime index creation drops and recreates the named content/latest indexes
when an older database still has the same index names on the pre-source-key
shape, so entity revision creation is idempotent across migrated development
databases.
Hash/latest lookups, DTO serialization, and derived provenance also accept
existing pre-source-key records with `data.entityType` and `data.entityId`,
then emit current `EntityRef` provenance. New records are always written with
`data.source`.

## Workflows

- `ensureForEntitySnapshot()` creates or reuses a revision from canonical scoped
  content and stores the source snapshot.
- `getCurrentForEntity()` returns the latest revision for a source entity and
  scope.
- `derivedFromRevision()` builds the canonical provenance fact stored on
  derived entities such as `cassette_design.provenance.derivedFrom`.
- Sheet designs use the same `geometry` scope. Their snapshot contains the
  nesting result/preview, cassette placement counts, nesting parameters, and
  sheet specs needed to reproduce the saved layout.

Revisions are read-only provenance records. They are not updated or deleted by
standard entity APIs.
Read access checks use the source `data.entityType` permission first, with
legacy cassette/project fallbacks for existing cassette-derived records.

## Related

- [cassettes](../cassettes/README.md) - owns current geometry revision pointers.
- [cassette-designs](../cassette-designs/README.md) - stores derived-from
  provenance refs.
- [sheet-designs](../sheet-designs/README.md) - stores revision-backed layouts.
