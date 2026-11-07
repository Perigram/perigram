# COMPONENT: Saved Views

The framework views collection (SPEC §26): per-organization saved
collection views. A view is a saved lens — the per-type view state
(search, filters, sort, projection) plus its type, named, embeddable as
a block on pages. It is user presentation data over collections the
ordinary read paths serve.

Parent: [server/features](../README.md).

## Document

One `views` document per saved view:

| Field | Shape |
|---|---|
| `organizationId` | Owning organization (flexible id). |
| `name` | String, required, trimmed. |
| `typeId` | The lensed collection's type id, required. |
| `viewState` | The persisted per-type view state, verbatim (below). |
| `createdBy` / `createdAt` / `updatedAt` | Provenance. |

### viewState

Exactly the persisted per-type view state the collection header's view
popover edits (`utils/ui-view-state.js` plus the region-owned search
model):

```json
{
  "search": "wall",
  "filters": { "and": [{ "field": "state", "op": "eq", "value": "active" }] },
  "sort": { "name": "due", "order": -1 },
  "projection": "board"
}
```

- `filters` is the canonical instance-filter tree
  ([shared/instance-filters](../../../shared/instance-filters/README.md));
  `null` when the view saved no conditions.
- `sort` is a `listControls.sortKeys` entry plus order; `null` when the
  popover carried no sort model (tables sort by column natively).
- `projection` is `'board'` or `'table'` inside the projection-switch
  pair, or `null`.

The service stores `viewState` verbatim and serves it verbatim: no
normalization, no synthesis. Readers re-validate — the filter tree
through `normalizeFilter`, the projection and sort through the
switchable/sortKeys bounds — so stale entries drop to no-ops the same
way localStorage revivals do.

## Access

Organization members read and write their organization's views (the
pages precedent for org-scoped user data): every operation resolves the
caller's active organization (`auth.organizationId`) and scopes by it;
membership is the only gate, and no grant machinery applies. Requests
without an active organization fail with 403. A view of another
organization answers 404.

## The lens law

A view queries through the ordinary read paths and carries no access of
its own: the embed renders whatever the current member can read through
the instances list transport (org scoping and grants ride it), so a
view shared organization-wide shows each member their own readable
subset. A type the member cannot read renders the denied state.

## API

Service seam: `list`, `getById`, `create`, `update`, `remove`.

| Endpoint | Responsibility |
|---|---|
| `GET /api/views?typeId=` | The organization's views as `{ _id, name, typeId }`, `createdAt` ascending; `typeId` filters. |
| `POST /api/views` | Create (`{ name, typeId, viewState? }`; name and typeId required, 400 otherwise). |
| `GET /api/views/:id` | One full view (viewState included). |
| `PATCH /api/views/:id` | Rename / replace the state (`{ name?, viewState? }`, any subset). |
| `DELETE /api/views/:id` | Delete. |

## Related

- [The save affordance and the lens rendering](../../../components/ui-mapping/README.md) — the collection header's view popover saves the current state; a provided view state renders the lens.
- [The page view embed](../../../components/generated/README.md) — the fence grammar and the live region composition.
- [The views store](../../../stores/README.md) — the client transport.
