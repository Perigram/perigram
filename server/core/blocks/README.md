# COMPONENT: Core Blocks

Canonical class library for all entities: every feature model extends
`BaseEntity` and composes these blocks.

Implementation source is `@perigram/core`, imported through the
`#packages/core/src/index.js` package alias. This directory is the server
import surface for the classes and owns the server-specific helpers —
ObjectId attachment creation and flexible-ID lineage inheritance. The block
DTO contract (strict `toJSON()`, block placement, states round-trip) is
owned by [packages/core](../../../packages/core/README.md).

Parent: [server](../../README.md).

## Import path

```js
import { BaseEntity, Identity, Status, Lineage, Relations, Provenance, Specs,
         createIdentity, createStatus, createSpecs, createData, inheritLineage,
         createInstanceRef, createProvenance, createAttachment
       } from '~/server/core/blocks/index.js';
```

The index re-exports a fixed subset of the core package
(`createRegistry`, `createAttachmentRef`,
`createCommandResult`, `createTaskResult`,
`normalizeEntityOutputContracts`, `validateResultEntityOutputs`,
`createStatusState`, `getPrimaryState`, `getRegionState`,
`getStatusRegions`, `normalizeStatusState`).
`normalizeInstanceRef` is exported by the core package itself — import it
from `#packages/core/src/index.js`.

## Block rules

- **Identity** owns `name`, `slug`, `serial`, and `reference`. `serial` and
  `reference` live here exclusively, and all four render through `identity`
  (root DTO aliases emit none of them).
- **Status** is the immutable state snapshot, used for both `origin` and the
  current lifecycle state. Read the primary lifecycle through
  `getPrimaryState(status)` and scoped regions through
  `getRegionState(status, regionId)`; Mongo filters use `states.main` for
  the primary lifecycle. Current mutable facts — assigned actors,
  state-specific attachment refs, measured/captured state data, and current
  location in `lifecycle.data.location` (typed values such as
  `{ type: 'warehouse', warehouseId }`) — belong in `lifecycle`;
  `metadata` carries transition-local context (notes, reason codes,
  job/request ids) only.
- **Lineage** is the flat, cumulative ancestor map keyed `${type}Id`
  (e.g. `projectId`, `queueId`): every descendant carries its complete
  ancestry (`inheritLineage(parentEntity, 'queue')`), and lineage queries
  work at any depth (`{ 'lineage.projectId': id }`). Lineage holds
  containment ancestry exclusively.
- **Relations** hold typed non-owning cross-links, each value normalized
  through `normalizeInstanceRef()`. Process Relations composers derive the
  entry key and item/list cardinality from their connected entity socket.
- **Provenance** holds immutable derivation or pinned-source evidence
  (`createInstanceRef()` / `createProvenance()` for source documents,
  revisions, or parent snapshots that must remain reproducible); mutable
  workflow facts belong in `status.lifecycle`.
- **Specs** hold standardized physical dimensions (mm) and area (m²,
  auto-computed from `width * length / 1,000,000` when omitted); created
  with `createSpecs(rawObject)`.

## App Registry

Entity service lookup is bound explicitly in
[server/runtime/app-registry.js](../../runtime/README.md); features register
nothing on module load.

## Factory Functions (from index.js)

| Function | Returns | Notes |
|---|---|---|
| `createIdentity(name, slug, serial, reference)` | `Identity` | `uid` generated; use when creating new entities |
| `createStatus(state, userId, metadata, eventId, lifecycle)` | `Status` | `eventId` and `lifecycle` optional |
| `createSpecs(rawObject)` | `Specs` | |
| `createData(object)` | `object` | Shallow copy; documents intent |
| `inheritLineage(parentEntity, type)` | `Lineage` | Copies parent.lineage + adds `${type}Id` |
| `createInstanceRef(type, id, revisionId)` | `object` | Canonical typed reference |
| `createProvenance(source, facts)` | `object` | Source ref plus immutable derivation facts |
| `createAttachment(kind, fileId, name, metadata)` | `object` | Standard attachment entry for `attachments`; `fileId` coerced to ObjectId |

## Related

- [packages/core](../../../packages/core/README.md) — block DTO contract owner
- [server/features/README.md](../../features/README.md) — Feature public API contract
- [server/core/machines/README.md](../machines/README.md) — State machine engine
- [composables/README.md](../../../composables/README.md) — Frontend entity composable
