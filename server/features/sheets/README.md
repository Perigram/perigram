# COMPONENT: Sheets

Individual physical units tracked throughout the production lifecycle.

## v24 Architecture
- **Cumulative Lineage**: Bridging physical ancestry (`pileId`, `warehouseId`) with digital context (`queueId`, `runId`).
- **Inherited Specs**: Resolves primary physical properties via `pileId`, while optionally storing unique measured `specs` overrides.
- **Status**: Governed by `SheetMachine` (AVAILABLE -> IN-CUTTING -> MILLED -> SCRAP).

## Key Workflows
1. **Instantiation**: Multiple sheets are created from a single `material_pile` via `sheetsService.createFromPile()`.
2. **Batch Allocation**: `allocateFromPile()` creates sheets from piles.
3. **Nesting Hand-off**: Assigned to a `nesting_run` (digital link).
4. **Queue Production Output**: chosen nesting runs consume pile stock but do
   not create `sheet` inventory rows for sheets that were immediately cut.
   Produced cassette instances and reusable remnant geometry carry the
   warehouse/pile/queue/run lineage instead.
5. **Production Update**: `finishMilling()` validates `IN-CUTTING`, stores produced cassette/remnant IDs in `data`, transitions the sheet to `MILLED`, and adjusts warehouse counters.

## Data Structure
```typescript
{
  identity: { serial },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, warehouseId, pileId, queueId, runId },
  specs: Object, // Optional overrides
  data: { serial, specs }
}
```
