# COMPONENT: Requisitions (v24 Standardized)

Material procurement system connecting contractors and manufacturers using v24 standard blocks.

## Core Files
- `repository.js`: `requisitions` collection operations.
- `service.js`: Workflow logic, price snapshotting, and state transitions.

## Data Structure (v24)
- **`identity`**: `{ name, serial }` (e.g., REQ-000451).
- **`status`**: Managed by `requisition` state machine.
- **`lineage`**: structured owning `organization` and optional containing
  `project` references.
- **`relations.manufacturer`**: non-owning typed link to the supplier
  organization; the manufacturer is not a parent of the requisition.
- **`items`**: Array of ordered sheets with `specs` and `priceSnapshot`.

## Workflow & States
Governed by `server/core/machines/definitions.js`:
- **DRAFT**: Initial creation.
- **SENT**: Visible to manufacturer.
- **APPROVED**: Manufacturer committed to fulfilling.
- **REJECTED**: Cancelled or declined.
- **FULFILLED**: Material Piles created and added to inventory.

## Key Operations
- **`create`**: Contractor-only operation. Snapshots prices from `catalogs` and `colors` to prevent historical price drift.
- **`transition`**: Moves requisition through lifecycle via `statusService`.
- **`list`**: Uses a dual relationship filter: either
  `lineage.organization.entityId` matches the buyer or
  `relations.manufacturer[].entityId` matches the seller.

## ID Handling

- Requisition entity references normalize ids to strings. Organization,
  manufacturer, and project inputs may originate as string UIDs or Mongo
  `ObjectId` values
  depending on how the organization and process were bootstrapped.
- Build ownership through `Lineage` and non-owning supplier links through
  `createRelationRef()`. Do not cast authenticated organization ids to
  `ObjectId` in this feature.

## Related
- [catalogs](../catalogs/README.md) - Pricing source.
- [material-piles](../material-piles/README.md) - Target for fulfillment.
