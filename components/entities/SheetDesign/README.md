# COMPONENT: Sheet Design Entity UI

`SheetDesignCard.vue` renders sheet design DTOs through `EntityCard`.

## Behavior

- Supports `inline`, `compact`, and `card` variants.
- Inline and compact variants use `EntityCard`, so they expand through the
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
  `parameters.kind = "LAYOUT_DXF"`; it is a command action, not a passive
  button.
- Cards show a compact cassette-design summary when `data.cassetteDesigns` is
  present. The detail sidebar lists each cassette design placed on the sheet
  with `EntityInlineRef type="cassetteDesign"` and its placement count; it must
  not route those refs through `TraceLink` or cassette-template routes.
- Cards and details show a compact material-source summary when
  `data.materialPool` is present on sheet designs generated from warehouse-mode
  nesting runs.
- Sheet designs hide status controls because the current UI contract treats
  them as generated design outputs rather than direct lifecycle action targets.

## Related

- [shared components](../../shared/README.md)
- [sheet design feature](../../../server/features/sheet-designs/README.md)
