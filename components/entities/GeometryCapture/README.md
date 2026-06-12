# COMPONENT: Geometry Capture UI

Entity card and detail surfaces for `geometry_capture` records.

## Files

| File | Purpose |
|---|---|
| `GeometryCaptureCard.vue` | Entity-card wrapper for photo-derived capture drafts, extraction confidence, dimensions, and lineage context. |
| `GeometryCaptureDetail.vue` | Review surface for extracted polygons, detector presets, revisions, diagnostics, traceability, and confirmation action. |

## Contracts

- Uses `EntityCard`, `EntityPage`, `GeometryPreview`, `DataBlock`,
  `EntityInlineRef`, and `StatusHistory`.
- Expects `data.geometry.preview` and `data.geometry.polygon.outer/inner` from
  the backend extraction workflow.
- Expects `data.revisions[]` and `data.activeRevisionId` when recalculation is
  available. The detail surface can queue a new preset-based recalculation and
  reactivate older successful revisions.
- Confirmation is not a generic status button. It calls the capture confirm API
  because remnant confirmation creates a `remnant` entity while facade
  confirmation only accepts a draft vector capture.

## Related

- [server/features/geometry-captures](../../../server/features/geometry-captures/README.md)
- [components/shared](../../shared/README.md)
