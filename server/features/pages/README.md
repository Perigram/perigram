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
| `fields.content` | Markdown block source; sections carry the empty string. |
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
`content`, `section`, and the self `children` edge keyed `pageId`. The
`page` id is reserved for this default class and stays out of the class
library.

## Legacy migration

The first page operation in an organization adopts rows from the former
`pages` collection into `items` Page instances and deletes the old rows.
Ids, names, content, parent refs, and provenance are preserved;
`kind: 'section'` becomes `fields.section: true`.

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

Service seam: `listTree`, `getById`, `create`, `update`, `remove`.

| Endpoint | Responsibility |
|---|---|
| `GET /api/pages` | The organization's rows in the tree projection, `createdAt` ascending. |
| `POST /api/pages` | Create (`{ kind?, name?, parentId?, classTypeId?, content? }`, org member). |
| `GET /api/pages/:id` | One full page (content included). |
| `PATCH /api/pages/:id` | Rename / move / save content (`{ name?, parentId?, content? }`, any subset). |
| `DELETE /api/pages/:id` | Delete; children become roots. |

## Related

- [The page surface](../../../components/generated/README.md) — the workspace page that authors these documents
- [The block vocabulary](../../../workers/documents/README.md) — the authoring grammar that surface mounts
- [packages/cts](../../../packages/cts/README.md) — the Page declaration
