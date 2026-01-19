# COMPONENT: Requisitions

Material requisition system for contractors to order sheets from manufacturers.

## Core Files
- `repository.js`: Database operations on `requisitions` collection
- `service.js`: Business logic, status transitions, price snapshotting
- API endpoints in `server/api/requisitions/`

## Data Structure
Collection: `requisitions`

Key fields:
- `requisitionNumber`: Unique identifier (e.g., "REQ-000001")
- `contractorId`: Requesting contractor (ObjectId)
- `manufacturerId`: Target manufacturer (ObjectId)
- `projectId`, `queueId`: Optional project/queue associations (ObjectId)
- `items`: Array of ordered items (with price snapshots)
  - `catalogId`, `sheetTypeId`: References to catalog
  - `sizeIndex`: Which size from sheet type
  - `quantity`: Number of sheets
  - `material`, `color`, `thickness`, etc.: Snapshotted details
  - `pricePerSqm`, `totalPrice`: Snapshotted pricing
- `totalAmount`: Total order value
- `status`: "draft" | "sent" | "approved" | "fulfilled" | "canceled"
- `statusHistory`: Array of status transitions with timestamps
- `notes`: Additional information
- `createdAt`, `createdBy`: Audit fields

## Access Control
- Contractors: Create requisitions, send to manufacturers
- Manufacturers: Approve/fulfill requisitions sent to them
- Both parties: View requisitions they're involved in

## Status Flow
1. **draft** → **sent**: Contractor sends requisition to manufacturer
2. **sent** → **approved**: Manufacturer approves the order
3. **approved** → **fulfilled**: Manufacturer marks as fulfilled (creates material batch)
4. Any status → **canceled**: Either party cancels (except fulfilled)

## Key Operations
- `create()`: Create requisition with price snapshotting from catalog
- `list()`: List requisitions (filtered by organization)
- `send()`: Contractor sends draft requisition
- `approve()`: Manufacturer approves sent requisition
- `fulfill()`: Manufacturer marks as fulfilled
- `cancel()`: Cancel requisition (except fulfilled)
- `remove()`: Delete draft requisition (contractor only)

## Business Rules
- Prices are snapshotted at creation time from catalog
- Only contractors can create requisitions
- Only manufacturers can approve/fulfill
- Status transitions follow strict workflow
- Fulfilled requisitions cannot be canceled or deleted
- Auto-generates unique requisition numbers (REQ-XXXXXX)

## Related Components
- [catalogs](../catalogs/NEOLIT.md) - Source of sheet types and pricing
- [material-batches](../material-batches/NEOLIT.md) - Created when requisition fulfilled
- [organizations](../organizations/NEOLIT.md) - Contractor and manufacturer organizations
