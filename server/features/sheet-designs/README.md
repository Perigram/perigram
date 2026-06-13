# COMPONENT: Sheet Designs

Digital sheet layouts generated from nesting runs.

## Core Files

- `model.js`: `SheetDesign` v24 entity wrapper. Preserves standard blocks and hoists `geometry` from `data.geometry`.
- `service.js`: Creates one sheet design per nesting layout, lists by
  authenticated lineage filters, projects generated geometry from nesting
  results, and delegates status transitions to the status machine.
- `repository.js`: MongoDB access for `sheet_designs` using `toFlexibleId()` for mixed string/ObjectId IDs.

## Data Shape

```js
{
  identity,
  origin,
  status,
  lineage,
  data: {
    geometry: {
      svgId,
      dxfId,
      data,    // raw worker result
      preview, // DrawingCanvas-compatible { viewBox, layers }
      summary
    },
    cassetteDesigns: [
      { cassetteDesignId, count }
    ],
    materialPool: [
      { type, id, label, specs, dimensions, available }
    ]
  },
  summary
}
```

## Workflow

`createFromRun(run, data, userId)` inherits lineage from the nesting run,
creates a `READY` status/origin block, stores geometry metadata, and returns
`SheetDesign.toJSON()`. The nesting task passes complete per-layout geometry,
so each physical worker sheet becomes its own `sheet_design` entity named and
serialized from the parent run.

`nestingResultForLayout(result, layoutIndex)` slices a multi-sheet worker result
to one physical layout. `nestingResultToPreview(result, params, { layoutIndex })`
projects that one layout into `data.geometry.preview`; without a `layoutIndex`
it can still render a stacked compatibility preview.

Preview projection supports the current nesting worker schema by joining
`solution.layouts[].placed_items[]` entries back to `result.items[].shape.data`
through `item_id`, then applying `transformation.translation` and
`transformation.rotation`. If the enriched item has `sourceLayers`, those OCCS
layers are transformed instead of drawing a fallback outline, so placed cassettes
can show `cut.outer`, `fold.route`, `dimension.cassette`, and other semantic
layers on the generated sheet. The material sheet boundary uses
`contour.material_sheet`; fallback placed outlines use
`contour.cassette_face`. Explicit fallback stroke colors/weights keep previews
readable when layer standards or pen seeds are missing. Generic OCCS text
geometry is projected as DrawingCanvas text paths, so `code.cassette_mark`
labels from cassette templates survive worker placement into sheet-design
previews.

Sheet designs also store `data.cassetteDesigns`, a per-layout count of cassette
design ids placed on that physical sheet. The summary mirrors this as
`cassetteDesignCount` and `cassettePlacementCount` for compact UI display.
When the parent run used warehouse mode, `data.materialPool` keeps the selected
stock source context so sheet design cards/details can show which warehouse
stock was allowed for the generated layout.

`updateGeometryFromResult(id, { result, summary, params })` is retained for
legacy callers that update an existing sheet design in place. New nesting runs
create per-layout sheet designs directly through `createFromRun()`.

GET/list APIs require authenticated lineage context. `queueId` and `projectId`
query parameters are mapped to `lineage.queueId` and `lineage.projectId`, then
combined with the server-derived access filter.

## DXF Export

- `GET /api/sheet-designs/:id/export` returns a generated DXF directly from the
  stored preview/layer geometry.
- The `generateAttachment` command with `kind: "LAYOUT_DXF"` uses
  `generateAndStoreDxf()` to write that DXF to the `nestDxf` GridFS bucket and
  creates a ready artifact linked to the sheet design lineage.

DXF generation reads `data.geometry.preview.layers` first, then falls back to
stored `data.geometry.data.layerData` / `polygonParts` when preview layers are
not available.

## Related

- [nesting-runs](../nesting-runs/README.md) - parent process that produces sheet designs
- [components](../../../components/README.md) - card/display contract
