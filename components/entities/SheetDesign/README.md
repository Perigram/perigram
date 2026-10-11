# COMPONENT: Sheet Design Entity UI

`SheetDesignCard.vue` renders sheet design DTOs through `InstanceCard`.

## Behavior

- Supports `inline`, `compact`, and `card` variants.
- Inline and compact variants use `InstanceCard`, so they expand through the
  shared entity popover on click or keyboard activation.
- The expanded inline/compact body reuses the same operational content as the
  card variant: `GeometryPreview` plus the declared specs fact rows through
  `DataBlock` (the sheet-design declaration's dimensional group).
- Geometry presence is represented by the preview itself; the card does not add
  `Preview` or `DXF` tags that duplicate implementation details.
- Generated nesting metrics read `summary.efficiency` for utilization and
  `summary.placedCount` for placed parts.
- The detail page DXF action triggers the standard
  `generateAttachment` command with `entities.sheetDesign` and
  `parameters.kind = "LAYOUT_DXF"`, then downloads the returned artifact from
  `/api/artifacts/:id`.
- Write-authorized detail surfaces mount the facade plugin's
  sheet-design editor surface (a plugin-delivered module under
  `workers/facade/surfaces/`, loaded through the remote-surface
  contract). It draws the
  physical sheet and cassette outlines in sheet coordinates, supports pointer
  dragging with tool-diameter snapping, keyboard or toolbar deletion, and adding
  existing cassettes (the DXF-upload entry returns with the cassette editor
  surface migration).
  The editor loads the same layer-standard and pen records as `DrawingCanvas`
  (through the surface mount's query transport),
  including canonical pen `identity.uid` references, and renders each source
  OCCS layer with its resolved stroke. A padded viewBox keeps the
  `contour.material_sheet` boundary visible; adaptive major-grid lines and
  selected-placement crosshairs make the smaller snap increment visible. Drag
  clamping uses the complete rotated cassette bounds so no part can cross the
  physical sheet rectangle. Save sends source items and placements through
  the surface mount's generic patch transport. Read-only users continue to
  receive `GeometryPreview`.
- Generated sheet-design details show the sheet identity in the standard
  `InstancePage` header in addition to lineage context.
- Cards show a compact placed-cassette summary with distinct cassette and
  placement counts.
- Cards and details show a compact material-source summary when
  `data.materialPool` is present on sheet designs generated from warehouse-mode
  nesting runs.
- Sheet designs hide status controls because the current UI contract treats
  them as generated design outputs rather than direct lifecycle action targets.

## Related

- [shared components](../../shared/README.md)
- [facade plugin executor](../../../../workers/facade/README.md) — sheet-design
  construction compute and the `generate-sheet-dxf` export service
