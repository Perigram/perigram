# COMPONENT: Sheet Designs

Digital sheet layouts generated from nesting runs.

## Core Files

- `model.js`: `SheetDesign` v24 entity wrapper. Preserves standard blocks and hoists `geometry` from `data.geometry`.
- `service.js`: Creates one sheet design per nesting composition group, lists by
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
    cassettes: [
      { cassetteId, count }
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

Sheet designs also store per-layout counts of the cassette ids placed on that
physical sheet. The summary mirrors these as cassette and placement counts for
compact UI display. Current nesting output collapses layouts with the same
cassette/count composition into one sheet design and records the physical
multiplicity in `data.sheetCount`. The historical composition migration only
backfills this metadata and missing sheet twins; it does not delete existing
sheet-design records or their geometry revisions.
When the parent run used warehouse mode, `data.materialPool` keeps the selected
stock source context so sheet design cards/details can show which warehouse
stock was allowed for the generated layout.

Every generated or manually saved layout resolves an immutable
`entity_revision` with `typeId: "sheet_design"` and `scope: "geometry"`.
The sheet design stores the current pointer under
`data.revisions.geometry`. `PUT /api/sheet-designs/:id` accepts nesting source
`items` plus the first sheet's `placedItems`, requires a concrete
`sheet_designs:write` grant, rebuilds the preview and placement summaries, and
creates or reuses the geometry revision. `data.nestingParams` preserves the
solver settings. The editor resolves `toolProfileId` through the public tool
catalogue and uses tool kerf as placement clearance. Snapping generates
magnetic candidates from transformed cassette production-contour edges, checks
transformed polygon clearance before accepting a placement, clamps complete
rotated geometry to the stored usable sheet polygon when present, and falls
back to rectangular visible sheet bounds for virtual rectangle sheets. Saved
solver spacing is only a legacy fallback for older layouts without a
resolvable tool profile.

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

- [components](../../../components/README.md) - card/display contract
