# COMPONENT: Sheet Instances

A `sheet_instance` is a planned future physical sheet digital twin. A nesting
revision creates one deterministic instance for every required copy of a
canonical sheet design.

Instances inherit the revision-qualified queue ancestry and add:

```js
lineage: {
  queue: { entityType: 'queue', entityId, revisionId },
  sheetDesign: { entityType: 'sheet_design', entityId, revisionId? }
}
```

`data` contains only instance facts (`layoutHash`, sequence, and the optional
physical-sheet binding). It does not duplicate `sheetDesignId`; containment is
owned by `lineage.sheetDesign`. Deterministic ids make terminal task retries
idempotent. `data.physicalSheetId` may later bind the plan to a warehouse
`sheet`; physical inventory remains a separate entity.
