# COMPONENT: Entity Revisions

Stores immutable content snapshots for versioned entity scopes such as cassette
template geometry, artifact-template layouts, and generated artifact
layouts.

## Data Contract

Revision records are normal v24 entities with immutable revision metadata under
`data`:

- `data.source.type`: source entity type, for example `cassette`.
- `data.source.id`: source entity id.
- `data.scope`: versioned content scope, for example `geometry`.
- `data.number`: monotonically increasing number within
  `(typeId, instanceId, scope)`.
- `data.contentHash`: `sha256:` hash of canonicalized content for dedupe.
- `data.snapshot`: source identity and scoped content used to reproduce the
  revision.
- `data.sourceStatus`: source entity status at revision creation.
- `data.reason`: creation reason such as `template-created`, `template-updated`,
  or `migration`.

The unique content index is `(data.source.type, data.source.id, data.scope,
data.contentHash)`. Re-saving identical content reuses the existing revision.
Revision entity identity is also source-scoped:
`revision:<typeId>:<instanceId>:<scope>:<number>`. Two source entities may
therefore both own revision 1 of the same scope without colliding on `_id`.
Hash, latest, and per-source delete lookups, DTO serialization, and derived
provenance read both `data.source` and the stored `data.typeId`/
`data.instanceId` shape, emitting current `EntityRef` provenance; new
records are written with `data.source` only.
Revision status is resolved through the registered `entity_revision`
workflow; with no registered workflow a revision carries no status. An
organization process remains free to register its own active revision
workflow.

## Workflows

- `ensureForEntitySnapshot()` creates or reuses a revision from canonical scoped
  content and stores the source snapshot.
- `getCurrentForEntity()` returns the latest revision for a source entity and
  scope.
- `derivedFromRevision()` builds the canonical provenance fact for
  derived entities, such as revision provenance for cassette geometry
  revisions.
- Sheet designs declare the same `geometry` scope; the type carries no
payload, so layout edits persist as field patches and no path writes a
sheet-design revision.
- Artifact templates use the `layout` scope for page/item placement and typed
  variables. Generated artifacts use their own `layout` scope for placed-item
  edits and values applied to the pinned template revision.

Revisions are immutable after creation; per-source deletion
(`removeForEntity`) rides the owning feature's cascade. Read access checks
the source type's feature permission first, with a cassette/project
lineage-read fallback.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/instance-revisions` | List revisions (filters `typeId`, `instanceId`, `scope`), access-serialized. |
| `GET /api/instance-revisions/:id` | One revision DTO. |
| `GET /api/instance-revisions/:id/file` | Streams the revision's primary GridFS attachment (404 when it has none). |

## Related

- [facade plugin](../../../workers/facade/README.md) — cassette geometry revisions and the sheet-design editor.
