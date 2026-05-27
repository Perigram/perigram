# COMPONENT: Cassette Instances

Individual physical products cut from material sheets.

## v24 Architecture
- **Digital/Physical Bridge**: Lineage traces both the production intent (`queueId`, `designId`) and the physical source (`sheetId`, `pileId`).
- **Identity**: Uses `serial` for physical marking/barcoding and `reference` for project-specific IDs (e.g., "Wall-A-01").
- **Status**: Governed by `InstanceMachine` (NESTED -> CUT -> ON-SITE -> INSTALLED -> DAMAGED).

## Key Workflows
1. **Creation**: Instantiated from `sheetsService.finishMilling()` or `cassetteInstancesService.createFromSheet()`.
2. **Status Tracking**: `updateStatus()` manages state transitions (e.g. READY -> IN-WORK -> COMPLETED).
3. **On-Site Tracking**: State updates as the piece moves through the logistics and installation chain.
4. **Traceability**: Indexed by any ancestor in the lineage.

## API Routes
- `GET /api/cassette-instances`: Lists instances visible to the authenticated user. Supports `lineage.queueId` for queue-scoped lookups used by queue editing surfaces.
- `GET /api/cassette-instances/:id`: Loads a single cassette instance through lineage access checks.
- `POST /api/cassette-instances/:id/status`: Transitions an instance through the status machine.

## Data Structure
```typescript
{
  identity: { serial, reference },
  status: StatusBlock,
  lineage: { organizationId, projectId, queueId, designId, runId, sheetId, pileId }
}
```
