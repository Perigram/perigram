# COMPONENT: Cassette Instances

Individual physical products cut from material sheets.

## v24 Architecture
- **Digital/Physical Bridge**: Structured lineage traces both the production
  intent (`queue` with optional `revisionId`, `cassetteDesign`) and the physical
  source (`sheet`, `materialPile`).
- **Identity**: Uses `serial` for physical marking/barcoding and `reference` for project-specific IDs (e.g., "Wall-A-01").
- **Status**: Governed by `InstanceMachine`. Queue-cut instances are created
  in `CUT` state because the production run acceptance already represents cut
  material. Legacy `PRODUCED` / `MILLED` states remain in the workflow for older
  lifecycle records. Older queue-cut rows saved as `NESTED` are normalized to
  `CUT` on read when `data.source === 'QUEUE_CUT'`. `CUT` instances can move to
  `MILLED` through the same operator workflow that legacy `PRODUCED` instances
  used.

## Key Workflows
1. **Creation**: Instantiated from `sheetsService.finishMilling()`,
   `cassetteInstancesService.createFromSheet()`, or queue-cut physical output
   creation through `createFromCutSheet()`.
2. **Status Tracking**: `updateStatus()` manages state transitions (e.g. READY -> IN-WORK -> COMPLETED).
3. **On-Site Tracking**: State updates as the piece moves through the logistics and installation chain.
4. **Traceability**: Indexed by any ancestor in the lineage.
5. **Queue Production Output**: `createFromCutSheet()` creates `CUT`
   physical cassette instances for each generated sheet design cassette count.
   For queue-cut output it can receive a non-persisted source sheet descriptor,
   so instances carry material-pile, warehouse, revision-qualified queue,
   cassette-design, and sheet-design lineage without requiring a saved `sheet`
   document for an already-cut sheet.

## API Routes
- `GET /api/cassette-instances`: Lists instances visible to the authenticated
  user. Supports public lineage aliases such as `queueId` and `warehouseId`,
  which map to the structured `lineage.queue.entityId` and
  `lineage.warehouse.entityId` storage paths.
- `GET /api/cassette-instances/:id`: Loads a single cassette instance through lineage access checks.
- `POST /api/cassette-instances/:id/status`: Transitions an instance through the status machine.

## Data Structure
```typescript
{
  identity: { serial, reference },
  status: StatusBlock,
  lineage: {
    organization?: EntityReference,
    project?: EntityReference,
    queue?: { entityType: 'queue', entityId, revisionId? },
    cassetteDesign: EntityReference,
    sheetDesign?: EntityReference,
    sheet?: EntityReference,
    materialPile?: EntityReference,
    warehouse?: EntityReference
  },
  data: {
    source?: 'QUEUE_CUT' | 'PROCESS'
  }
}
```

## UI Notes
- `CassetteInstanceCard` resolves the source cassette design and parent
  template, renders the design geometry via `CassetteThumbnail`, and shows
  embedded design/template identity rows. Queue context remains a trace link.
