# COMPONENT: Cassette Instances

Individual physical products cut from material sheets.

## v24 Architecture
- **Digital/Physical Bridge**: Lineage traces both the production intent (`queueId`, `designId`) and the physical source (`sheetId`, `pileId`).
- **Identity**: Uses `serial` for physical marking/barcoding and `reference` for project-specific IDs (e.g., "Wall-A-01").
- **Status**: Governed by `InstanceMachine` (NESTED -> CUT -> ON-SITE -> INSTALLED -> DAMAGED).

## Key Workflows
1. **Creation**: Instantiated from `sheetsService.finishMilling()`.
2. **On-Site Tracking**: State updates as the piece moves through the logistics and installation chain.
3. **Traceability**: Indexed by any ancestor in the lineage.

## Data Structure
```typescript
{
  identity: { serial, reference },
  status: StatusBlock,
  lineage: { organizationId, projectId, queueId, designId, runId, sheetId, pileId }
}
```