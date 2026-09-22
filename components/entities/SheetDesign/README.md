# COMPONENT: Sheet Design Entity UI

`SheetDesignCard.vue` renders sheet design DTOs through `InstanceCard`.

## Behavior

- Supports `inline`, `compact`, and `card` variants.
- Inline and compact variants use `InstanceCard`, so they expand through the
  shared entity popover on click or keyboard activation.
- The expanded inline/compact body reuses the same operational content as the
  card variant: `GeometryPreview` plus `SpecsBlock`.
- Geometry presence is represented by the preview itself; the card does not add
  `Preview` or `DXF` tags that duplicate implementation details.
- When rendered inside a project route, the card exposes an open action to
  `/project/:slug/sheet-design/:sheetDesignId`, where the full
  `SheetDesignDetail` view renders the same geometry preview plus a `DataBlock`
  metric summary. Generated nesting metrics read `summary.efficiency` for
  utilization and `summary.placedCount` for placed parts.
- The detail page DXF action triggers the standard
  `generateAttachment` command with `entities.sheetDesign` and
  `parameters.kind = "LAYOUT_DXF"`, then downloads the returned artifact from
  `/api/artifacts/:id`.
- Write-authorized detail surfaces mount `SheetDesignEditor`. It draws the
  physical sheet and cassette outlines in sheet coordinates, supports pointer
  dragging with tool-diameter snapping, keyboard or toolbar deletion, adding
  existing cassette designs, and DXF upload through `CassetteEditorDialog`.
  The editor loads the same layer-standard and pen stores as `DrawingCanvas`,
  including canonical pen `identity.uid` references, and renders each source
  OCCS layer with its resolved stroke. A padded viewBox keeps the
  `contour.material_sheet` boundary visible; adaptive major-grid lines and
  selected-placement crosshairs make the smaller snap increment visible. Drag
  clamping uses the complete rotated cassette bounds so no part can cross the
  physical sheet rectangle. Save sends source items and placements to the
  revision-backed update endpoint. Read-only users continue to receive
  `GeometryPreview`.
- Generated sheet-design details show the sheet identity in the standard
  `InstancePage` header in addition to lineage context.
- Cards show a compact cassette-design summary when `data.cassetteDesigns` is
  present. The detail sidebar lists each cassette design placed on the sheet
  with `InstanceInlineRef type="cassetteDesign"` and its placement count; it must
  not route those refs through `TraceLink` or cassette-template routes.
- Cards and details show a compact material-source summary when
  `data.materialPool` is present on sheet designs generated from warehouse-mode
  nesting runs.
- Sheet designs hide status controls because the current UI contract treats
  them as generated design outputs rather than direct lifecycle action targets.

## Related

- [shared components](../../shared/README.md)
- [sheet design feature](../../../server/features/sheet-designs/README.md)
