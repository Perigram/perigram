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
    ],
    nestingParams,
    revisions: {
      geometry: { currentId, number, contentHash }
    }
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

Every generated or manually saved layout resolves an immutable
`entity_revision` with `entityType: "sheet_design"` and `scope: "geometry"`.
The sheet design stores the current pointer under
`data.revisions.geometry`. `PUT /api/sheet-designs/:id` accepts nesting source
`items` plus the first sheet's `placedItems`, requires a concrete
`sheet_designs:write` grant, rebuilds the preview and placement summaries, and
creates or reuses the geometry revision. `data.nestingParams` preserves the
solver settings. The editor resolves `toolProfileId` through the public tool
catalogue and uses the tool diameter as its snap increment; saved solver spacing
is the fallback for older layouts without a resolvable tool profile.

GET/list APIs require authenticated lineage context. `queueId`, `projectId`,
and `runId`/`runIds` query parameters are mapped to `lineage.queueId`,
`lineage.projectId`, and `lineage.runId`, then combined with the
server-derived access filter. Queue detail workspaces use the run-id query for
sheet layouts that belong to the concrete `nesting_run` records already
visible in that queue, instead of relying on a broad sheet-design list screen.
List and detail access both evaluate the loaded sheet design through
`sheet_designs` grants. Queue access does not imply sheet-design visibility;
process command output grants from `solveNesting` are what expose generated
layouts to generated queue/run screens.

`listForRunOutput(queueId, runId, sheetDesignIds)` is an internal service
lookup used by queue production output creation. It returns full sheet-design
DTOs for the owning queue/run without applying UI field redaction, because
remnant and cassette-instance generation need stored geometry and placement
counts.

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
