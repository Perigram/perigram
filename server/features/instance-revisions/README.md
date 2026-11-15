# COMPONENT: Entity Revisions

Stores immutable content snapshots for versioned entity scopes such as
cassette geometry and instance payload files.

Parent: [server/features](../README.md).

## Data Contract

Revision records are normal entities with immutable revision metadata under
`data`:

- `data.source.type`: source entity type, for example `cassette`.
- `data.source.id`: source entity id.
- `data.scope`: versioned content scope, for example `geometry`.
- `data.number`: monotonically increasing number within
  `(typeId, instanceId, scope)`.
- `data.contentHash`: `sha256:` hash of canonicalized content for dedupe.
- `data.createdAt`: ISO creation stamp.
- `data.snapshot`: source identity and scoped content used to reproduce the
  revision.
- `data.sourceStatus`: source entity status at revision creation.
- `data.reason`: creation reason such as `created`, `payload-replaced`,
  `rederived`, `payload-restored`, or `content-change` (the direct-caller
  default).
- `data.actor`: the minting principal stamp `{ id, label?,
  principalType }` (the status-events stamp shape) when the caller
  supplies one.
- `data.restoredFrom`: `{ id, number }` naming the prior revision a
  restore re-entered (restore-minted revisions alone).

The unique content index is `(data.source.type, data.source.id, data.scope,
data.contentHash)`. Re-saving identical content reuses the existing revision.
Revision entity identity is also source-scoped:
`revision:<typeId>:<instanceId>:<scope>:<number>`. Two source entities may
therefore both own revision 1 of the same scope without colliding on `_id`.
Hash, latest, and per-source delete lookups, DTO serialization, and derived
provenance read `data.source` only.
Revision status is resolved through the registered `entity_revision`
workflow; with no registered workflow a revision carries no status. An
organization process remains free to register its own active revision
workflow.

A revision always inherits its source's organization from the source's
top-level `organizationId`, lineage, or origin. The stored revision lineage
therefore preserves tenant ownership even when the source DTO carries
organization scope outside its lineage block; organization-less revisions
remain the deliberate system-wide case.

## Workflows

- `ensureForEntitySnapshot()` creates or reuses a revision from canonical scoped
  content and stores the source snapshot.
- `getCurrentForEntity()` returns the latest revision for a source entity and
  scope.
- `pinnedRevisionFile(revisionId)` resolves a pinned ref's frozen bytes: the
  revision's primary attachment `{ fileId, bucket, mime, name }` — the
  construction seam reads it when a stored ref carries a revision pin
  (SPEC §24).
- `derivedFromRevision()` builds the canonical provenance fact for
  derived entities, such as revision provenance for cassette geometry
  revisions.
- Sheet designs declare the same `geometry` scope; the type carries no
  payload, so layout edits persist as field patches and no path writes a
  sheet-design revision.

Revisions are immutable after creation; per-source deletion
(`removeForEntity`) rides the owning feature's cascade. Revision reads are
not an independent visibility domain: the revision's tenant scope is checked,
then each single-revision, list, and file response resolves the source through
the ordinary instance read boundary. Thus both tenant ownership and the
source's compiled read grant apply; organization-less source rows are visible
only where the ordinary source read policy permits them.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/instance-revisions` | List revisions visible through each source record's read grant. |
| `GET /api/instance-revisions/:id` | One revision DTO, gated by its source record. |
| `GET /api/instance-revisions/:id/file` | Streams the revision's primary GridFS attachment after source authorization. |

Revision DTOs serialize like their source records (owner decision
2026-10-11): the stored document verbatim, org-scoped by the service —
the §24 picker reads `data.number`, `data.reason`, `data.createdAt`, and
`attachments.primary` (the frozen bytes reference that resolves through
the shared payload download URL). Payload revision restore rides the
instances transport:
`POST /api/instances/:type/:id/restore-revision`
([instances](../instances/README.md)).

## Related
