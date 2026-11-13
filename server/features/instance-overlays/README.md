# COMPONENT: Instance Overlays

The framework instance-overlays collection (SPEC §26): per-organization
record-page customization. An overlay is the authored arrangement of one
instance's record document — custom blocks composed around the declared
content, plus the authored order of the document's sections. It is user
presentation data over a record the generic instance machinery serves.

Parent: [server/features](../README.md).

## Document

One `instance_overlays` document per instance, keyed uniquely by
`(organizationId, typeId, instanceId)`:

| Field | Shape |
|---|---|
| `organizationId` | Owning organization (flexible id). |
| `typeId` / `instanceId` | The record whose page carries the overlay. |
| `blocks` | The authored custom blocks (below). |
| `order` | The authored arrangement: an ordered list of section keys mixing declared keys and block ids. |
| `createdBy` / `updatedBy` / `createdAt` / `updatedAt` | Provenance. |

### blocks

| Kind | Payload |
|---|---|
| `text` | `text` — markdown source through the one editor engine. |
| `view` | `view: { id?, typeId?, name }` — a saved-view reference (`id` + `typeId`) or a collection entry (`typeId` alone) rendering the type's live view; the same shape the page view fence carries. |

Every block carries a client-authored unique `id`; block ids are the
overlay's own namespace, distinct from the declared keys by shape
(`properties`, `editor`, `relation:<key>`, `children:<lineageKey>:<typeId>`).

### order

The overlay addresses the record document's top-level sections:
`properties` (the property block), `editor` (the payload/editor band and
the declared structural open sections riding beneath it), and each
child/relation section — `relation:<key>` for a relation (the inline chip
section or its relation-scoped child collection, whichever renders it),
`children:<lineageKey>:<typeId>` for a lineage-scoped child collection
(one edge key may carry several child types; the key addresses each
section apart), `children:<typeId>` for a lineage-less child. The record
header, the comments section (SPEC §22.17's trailing section), and inert
empty-child stubs sit outside the order.

**Declared content is never deleted by the overlay.** Composition at read
applies the authored order and keeps every declared section rendering: a
declared key the order omits appends in derivation order, an order entry
naming no current section or block drops, and a stored block its order
omits appends. A new declared section therefore renders after the
authored arrangement until re-authored — the arrangement survives type
changes.

## Access

Reads require organization membership (the pages/views precedent): every
operation resolves the caller's active organization (`auth.organizationId`)
and scopes by it; requests without an active organization fail with 403.
An overlay of another organization answers 404.

Writes are gated by **the record's own write grant** — the same seam the
instance patch transport and the client's editor mounts take: the feature
resolves the declaration through `writeGrantTarget` (`access.inherits`,
else the class collection) and the shared access evaluator
(`hasInstanceAccess`, level `write`) decides against the loaded instance,
fail-closed. A record that does not exist in the caller's organization
answers 404 before any grant evaluation.

## API

Service seam: `getOverlay`, `upsert`, `remove`.

| Endpoint | Responsibility |
|---|---|
| `GET /api/instance-overlays/:type/:id` | The instance's overlay, or `null` when nobody authored one. |
| `PATCH /api/instance-overlays/:type/:id` | Create or replace the whole overlay (`{ blocks, order }` — one write replaces the whole document). |
| `DELETE /api/instance-overlays/:type/:id` | Delete the overlay (404 when none exists). |

## Related

- [The composed record page](../../../components/ui-mapping/README.md) — the document composition that applies the order and renders the blocks.
- [The views feature](../views/README.md) — the saved lenses a view block embeds.
- [The pages feature](../pages/README.md) — the custom pages carrying the same block vocabulary.
