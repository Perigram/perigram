# COMPONENT: Sheets

Individual physical units tracked throughout the production lifecycle.

## v24 Architecture
- **Cumulative Lineage**: Structured references bridge physical ancestry
  (`materialPile`, `warehouse`) with queue/revision context.
- **Inherited Specs**: Resolves primary physical properties through
  `lineage.materialPile`, while optionally storing unique measured `specs` overrides.
- **Status**: Governed by `SheetMachine` (AVAILABLE -> IN-CUTTING -> MILLED -> SCRAP).

## Key Workflows
1. **Instantiation**: Multiple sheets are created from a single `material_pile` via `sheetsService.createFromPile()`.
2. **Batch Allocation**: `allocateFromPile()` provides a high-level bridge for creating sheets from piles.
3. **Nesting Hand-off**: Assigned to an immutable queue nesting revision by
   storing the queue reference's optional `revisionId`.
4. **Queue Production Output**: selected queue revisions consume pile stock but do
   not create `sheet` inventory rows for sheets that were immediately cut.
   Produced cassette instances and reusable remnant geometry carry the
   warehouse/pile/queue-revision lineage instead.
5. **Production Update**: `finishMilling()` validates `IN-CUTTING`, stores produced cassette/remnant IDs in `data`, transitions the sheet to `MILLED`, and adjusts warehouse counters.

## Data Structure
```typescript
{
  identity: { serial },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: {
    organization: EntityReference,
    warehouse: EntityReference,
    materialPile: EntityReference,
    queue: { entityType: 'queue', entityId, revisionId? }
  },
  specs: Object, // Optional overrides
  data: { serial, specs }
}
```
