# COMPONENT: Requisitions (v24 Standardized)

Material procurement system connecting contractors and manufacturers using v24 standard blocks.

## Core Files
- `repository.js`: `requisitions` collection operations.
- `service.js`: Workflow logic, price snapshotting, and state transitions.

## Data Structure (v24)
- **`identity`**: `{ name, serial }` (e.g., REQ-000451).
- **`lineage`**: `{ organizationId, manufacturerId, projectId? }`.
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
- **`list`**: Uses a dual-lineage filter (either `organizationId` matches as buyer, or `manufacturerId` matches as seller).

## ID Handling

- Requisition lineage references use flexible ids (string UIDs or Mongo
  `ObjectId`, depending on how the organization and process were bootstrapped).
- Store lineage fields through `toFlexibleId()` and list by matching both the
  flexible value and its string form. Do not cast authenticated organization
  ids to `ObjectId` in this feature.

## Related
- [catalogs](../catalogs/README.md) - Pricing source.
- [material-piles](../material-piles/README.md) - Target for fulfillment.
