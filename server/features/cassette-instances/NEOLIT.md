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

## Data Structure
```typescript
{
  identity: { serial, reference },
  status: StatusBlock,
  lineage: { organizationId, projectId, queueId, designId, runId, sheetId, pileId }
}
```