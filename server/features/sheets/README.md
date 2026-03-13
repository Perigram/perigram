# COMPONENT: Sheets

Individual physical units tracked throughout the production lifecycle.

## v24 Architecture
- **Cumulative Lineage**: Bridging physical ancestry (`pileId`, `warehouseId`) with digital context (`queueId`, `runId`).
- **Inherited Specs**: Resolves primary physical properties via `pileId`, while optionally storing unique measured `specs` overrides.
- **Status**: Governed by `SheetMachine` (AVAILABLE -> IN-CUTTING -> MILLED -> SCRAP).

## Key Workflows
1. **Instantiation**: Multiple sheets are created from a single `material_pile` via `sheetsService.createFromPile()`.
2. **Batch Allocation**: `allocateFromBatch()` provides a high-level bridge for creating sheets from piles in the context of material batches.
3. **Nesting Hand-off**: Assigned to a `nesting_run` (digital link).
4. **Production Update**: State changes to `MILLED` once the CNC process is complete.

## Data Structure
```typescript
{
  identity: { serial },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, warehouseId, pileId, queueId, runId },
  specs: Object // Optional overrides
}
```