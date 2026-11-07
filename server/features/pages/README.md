# COMPONENT: Custom Pages

The framework pages collection (SPEC §26): per-organization markdown
pages and the sidebar sections that group them. A page is user data —
a framework collection authored through the one editor engine, never a
process definition and never an instance payload.

Parent: [server/features](../README.md).

## Document

One `pages` document per page or section:

| Field | Shape |
|---|---|
| `organizationId` | Owning organization (flexible id). |
| `kind` | `page` or `section`. |
| `name` | String, may be empty (naming is the rename channel). |
| `parentId` | Flexible id of the parent page or section, `null` at the root. |
| `content` | Markdown source; sections carry the empty string. |
| `createdBy` / `createdAt` / `updatedAt` | Provenance. |

A section is a `kind: 'section'` row — the sidebar's root grouping
node. Sections are root-only: create and move refuse a section with a
`parentId`. Pages nest freely under sections and under other pages.

## Access

Organization members read and write their organization's pages (the
chats precedent for org-scoped user data): every operation resolves the
caller's active organization (`auth.organizationId`) and scopes by it;
membership is the only gate, and no grant machinery applies. Requests
without an active organization fail with 403. A page of another
organization answers 404.

## Tree Semantics

- The list projection is the tree: `{ _id, name, parentId, kind }` per
  row, content excluded; clients nest rows through `parentId`.
- Move is a `parentId` change. The service walks the ancestor chain
  from the new parent and refuses a move that would create a cycle
  (400).
- Delete detaches: children of a deleted row become roots
  (`parentId → null`) — containment's detach semantics, one update,
  no cascade.
- A parent that does not exist in the organization refuses with 400.

## API

Service seam: `listTree`, `getById`, `create`, `update`, `remove`.

| Endpoint | Responsibility |
|---|---|
| `GET /api/pages` | The organization's rows in the tree projection, `createdAt` ascending. |
| `POST /api/pages` | Create (`{ kind?, name?, parentId? }`, org member). |
| `GET /api/pages/:id` | One full page (content included). |
| `PATCH /api/pages/:id` | Rename / move / save content (`{ name?, parentId?, content? }`, any subset). |
| `DELETE /api/pages/:id` | Delete; children become roots. |

## Related

- [The page surface](../../../components/generated/README.md) — the workspace page that authors these documents
- [The block vocabulary](../../../workers/documents/README.md) — the authoring grammar that surface mounts
