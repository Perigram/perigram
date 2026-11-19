# COMPONENT: Custom Pages

Per-organization pages and the sidebar sections that group them are
Page-class instances (`page` organization type, `items` collection)
authored through the one editor engine. The page API is the
organization-member surface over those instances.

Parent: [server/features](../README.md).

## Document

One `items` document of type `page` per page or section:

| Slot | Shape |
|---|---|
| `organizationId` | Owning organization (flexible id). |
| `fields.name` | String, the Page identifier; may be empty. |
| `fields.blocks` | Ordered block records: `{ id, kind: 'text', text }`, `{ id, kind: 'view', view }`, `{ id, kind: 'reference', ref: { typeId, instanceId, revisionId? } }`, `{ id, kind: 'collection', collection: { source, parameters, resultPolicy } }`, or `{ id, kind: 'file', file }`; sections carry an empty list. File blocks point to immutable `files`-bucket blobs by id and keep a safe page-relative path plus revision history. |
| `fields.order` | Block ids in document order. |
| `fields.section` | Boolean; sections are `true`, pages `false`. |
| `fields.classTypeId` | Optional class binding; a class page is the one page bound to that organization class. |
| `lineage.pageId` | Parent page or section id; absent at the root. |
| `createdBy` / `createdAt` / `updatedAt` | Provenance. |

A class page is an ordinary Page instance: it carries blocks and the
editor vocabulary like every page, and the class page surface renders the
class's collection above them. Creating a page with an already-bound
`classTypeId` returns the bound page, so opening a class panel is
idempotent. Class pages stay out of the sidebar page tree; the class
panel owns their navigation.

A section is a Page instance with `fields.section: true`. Sections are
root-only: create and move refuse a section with a parent. Pages nest
freely under sections and under other pages.

The Page declaration (`pageTypeDeclaration` in
[packages/cts](../../../packages/cts/README.md)) is seeded as an
organization type on the first page operation: `name` (identifier),
`blocks`, `order`, `section`, and the self `children` edge keyed
`pageId`. The `page` id is reserved for this default class and stays out
of the class library.

## Legacy migration

The first page operation in an organization adopts rows from the former
`pages` collection into `items` Page instances and deletes the old rows.
Ids, names, parent refs, and provenance are preserved;
`kind: 'section'` becomes `fields.section: true`, and markdown `content`
splits into ordered text and collection blocks through
`blocksFromMarkdown`. The Page declaration lands at version 2 with a
declared `remove-field content` migration, so the legacy field is gone
from stored instances.

## Access

Organization members read and write their organization's pages (the
chats precedent for org-scoped user data): every operation resolves the
caller's active organization (`auth.organizationId`) and scopes by it;
membership is the only gate, and no grant machinery applies. Requests
without an active organization fail with 403. A page of another
organization answers 404.

## Tree Semantics

- The list projection is the tree: `{ _id, name, parentId, kind, classTypeId }`
  per row, content excluded; clients nest rows through `parentId`.
- Move is a `lineage.pageId` change. The service walks the ancestor chain
  from the new parent and refuses a move that would create a cycle
  (400).
- Delete detaches: children of a deleted row become roots
  (`lineage.pageId` removed) — containment's detach semantics, one
  update, no cascade.
- A parent that does not exist in the organization refuses with 400.

## API

Service seam: `listTree`, `getById`, `create`, `update`, `remove`; `retractBakedFile` is the internal rollback used when Bake provenance persistence fails.

| Endpoint | Responsibility |
|---|---|
| `GET /api/pages` | The organization's rows in the tree projection, `createdAt` ascending. |
| `POST /api/pages` | Create (`{ kind?, name?, parentId?, classTypeId?, blocks?, order? }`, org member). |
| `GET /api/pages/:id` | One full page (`blocks` and `order` included). |
| `GET /api/pages/:id/references` | Resolve typed reference blocks through the target's authorized read boundary; pinned references require the exact retained revision. |
| `GET /api/pages/backlinks/:typeId/:instanceId` | Discover derived page backlinks from the owning organization's page documents. |
| `PATCH /api/pages/:id` | Rename / move / save the block document (`{ name?, parentId?, blocks?, order? }`, any subset); removing file blocks retracts page-owned blobs that no longer have references. |
| `POST /api/pages/:id/files` | Attach a baked file to this exact page at a validated relative path, with explicit conflict policy (`fail`, `create-revision`, admin-only `replace`, or `create-distinct-name`); GridFS bytes and page document references are updated with a compare-and-swap write. |
| `DELETE /api/pages/:id` | Delete; children become roots. |

## Related

- [The page surface](../../../components/generated/README.md) — the workspace page that authors these documents
- [The block vocabulary](../../../workers/documents/README.md) — the authoring grammar that surface mounts
- [packages/cts](../../../packages/cts/README.md) — the Page declaration

## Baked page files

A file block is a page-owned artifact reference, not a path on the application host. Its logical path is relative to the exact Page id and rejects absolute paths, traversal segments, backslashes, control characters, empty segments, and paths longer than 240 characters. The blob is stored in the organization-scoped `files` bucket with SHA-256 content addressing and provenance metadata (graph identity/revision, execution id, and output id). A path collision must select an explicit policy: fail, append an immutable file revision, replace (organization admin only), or generate a distinct sibling name. Page writes use an `updatedAt` compare-and-swap and the organization's durable change sequence; a race removes the just-uploaded blob and returns 409. Removing a file block or page retracts its page-owned current and historical blobs.


## Typed references and collections

A reference block stores stable type and instance identity plus an optional retained revision id. Target fields are resolved at read time through the ordinary authorized instance read service. Pinned targets pass the current-source authorization check, then resolve the exact retained revision and verify its source identity. Missing, deleted, cross-tenant, or inaccessible targets share an explicit unavailable response.

Backlinks are derived from reference blocks in the organization's pages. They are rebuildable discovery data; the page document owns each forward reference.


A graph-output collection block pins a successful graph execution instance, graph document revision, and output id. The graph-executions feature validates the saved graph and output contract, then resolves referenced CTS items through their ordinary read grants. The execution fixes output membership; referenced item projections use current authorized reads.

A collection block carries an optional `parameters` record bound against the pinned graph's declared inputs at resolution time; re-evaluation passes them as input bindings, revalidated against the saved graph revision. A declared input with no bound value renders the shared unavailable state. `resultPolicy: 'frozen'` stores the resolved collection snapshot (label, item count, truncated flag, and the first 100 items) inside the block; frozen blocks produce no resolution entry, and the page serve applies the record-item serving rule below. Pinned blocks re-resolve through the live execution.

`resultPolicy: 'live'` is the graph-first embed: the block carries the graph document, graph id, pinned graph revision, and declared output — with `parameters` as its input bindings — and carries no execution anchor. Each page resolution evaluates the pinned revision's frozen payload through the managed server evaluator (the same boundary as `POST /api/graph-executions/evaluate`) and returns the declared output's items; evaluation failure, an unreadable document, or a revision the document no longer carries renders the shared unavailable state. A live embed refreshes on every page load; a pinned embed re-serves its recorded execution; a frozen embed never refreshes.

A snapshot item is record-shaped when it carries type and instance identity (a CTS instance projection), and stores the captured projection beside the reference. Every page serve re-checks each record item against the current viewer:

| Item | Shape | Serving rule |
|---|---|---|
| record | `{ kind: 'record', typeId, instanceId, instance }` | The current viewer's read grant on the source instance is re-checked through the ordinary instance read service; an authorized viewer receives the captured projection verbatim, a denied or deleted source serves `{ kind: 'unavailable' }` for that item. |
| value | `{ kind: 'value', value }` — plain computed output | Served verbatim. |
| unavailable | `{ kind: 'unavailable' }` | Served verbatim. |

A stored snapshot is write-immutable: a page update that round-trips an existing frozen block keeps the stored snapshot; a new freeze is a new block.
