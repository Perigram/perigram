# COMPONENT: Sheet Designs

Digital sheet layouts generated from nesting runs.

## Core Files

- `model.js`: `SheetDesign` v24 entity wrapper. Preserves standard blocks and hoists `geometry` from `data.geometry`.
- `service.js`: Creates sheet designs from nesting runs, lists by lineage filters, and delegates status transitions to the status machine.
- `repository.js`: MongoDB access for `sheet_designs` using `toFlexibleId()` for mixed string/ObjectId IDs.

## Data Shape

```js
{
  identity,
  origin,
  status,
  lineage,
  data: {
    geometry: { svgId, dxfId, data }
  },
  geometry // DTO alias from toJSON()
}
```

## Workflow

`createFromRun(run, data, userId)` inherits lineage from the nesting run, creates a `READY` status/origin block, stores geometry metadata, and returns `SheetDesign.toJSON()`.

## Related

- [nesting-runs](../nesting-runs/README.md) - parent process that produces sheet designs
- [components](../../../components/README.md) - card/display contract
